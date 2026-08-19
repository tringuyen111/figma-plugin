/// <reference types="@figma/plugin-typings" />
import { ErrorCode } from "../../shared/protocol.js";
import { PluginExecError } from "./execute-js.js";

type QueryParams = { kind?: unknown; nodeId?: unknown; includeChildren?: unknown };
type ApplyParams = { action?: unknown; dryRun?: unknown; confirm?: unknown; pageIds?: unknown; removeLocalAssets?: unknown };

export async function queryDocument(params: Record<string, unknown>): Promise<unknown> {
  const kind = params.kind;
  if (kind === "file_inventory") return inventoryFile();
  if (kind === "node_handoff") return inspectHandoff(validateQuery(params));
  if (kind === "structure") return inspectStructure(validateQuery(params));
  throw failure(ErrorCode.INVALID_PARAMS, `query kind must be file_inventory, node_handoff, or structure (got ${String(kind)}).`);
}

export async function applyDocument(params: Record<string, unknown>): Promise<unknown> {
  const action = params.action;
  if (action !== "clear_file_owned_assets") {
    throw failure(ErrorCode.INVALID_PARAMS, `apply action must be clear_file_owned_assets (got ${String(action)}).`);
  }
  const dryRun = params.dryRun === undefined ? true : params.dryRun;
  const confirm = params.confirm === true;
  const removeLocalAssets = params.removeLocalAssets === true;
  if (typeof dryRun !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "dryRun must be boolean.");
  if (params.confirm !== undefined && typeof params.confirm !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "confirm must be boolean.");
  if (params.removeLocalAssets !== undefined && typeof params.removeLocalAssets !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "removeLocalAssets must be boolean.");
  const pageIds = validatePageIds(params.pageIds);
  const before = await inventoryFile();
  const selectedPages = await selectPages(pageIds);
  const plan = {
    pages: selectedPages.map((page) => ({ id: page.id, name: page.name, childCount: page.children.length })),
    removeLocalAssets,
    localStyles: removeLocalAssets ? before.localStyles : { paint: 0, text: 0, effect: 0, grid: 0 },
    variables: removeLocalAssets ? before.variables : { collections: 0, variables: 0 },
  };
  if (dryRun) return { action, dryRun: true, plan, before };
  if (!confirm) {
    throw failure(ErrorCode.INVALID_PARAMS, "clear_file_owned_assets requires confirm: true when dryRun is false.", "Run the same action with dryRun: true first, inspect the plan, then pass confirm: true.");
  }

  const clearedPages = [];
  for (const page of selectedPages) {
    await page.loadAsync();
    const snapshot = page.children.map((node) => ({ id: node.id, name: node.name, type: node.type }));
    const removed = [];
    const skipped = [];
    for (const item of snapshot) {
      const node = await figma.getNodeByIdAsync(item.id);
      if (node && node.parent && node.parent.id === page.id) {
        node.remove();
        removed.push(item);
      } else {
        skipped.push(item);
      }
    }
    clearedPages.push({ id: page.id, name: page.name, removedCount: removed.length, skipped, remainingCount: page.children.length });
  }

  const removedStyles = { paint: 0, text: 0, effect: 0, grid: 0 };
  const removedVariableCollections: Array<{ id: string; name: string; variableCount: number }> = [];
  if (removeLocalAssets) {
    const styleGroups = [
      { type: "paint" as const, values: await figma.getLocalPaintStylesAsync() },
      { type: "text" as const, values: await figma.getLocalTextStylesAsync() },
      { type: "effect" as const, values: await figma.getLocalEffectStylesAsync() },
      { type: "grid" as const, values: await figma.getLocalGridStylesAsync() },
    ];
    for (const group of styleGroups) {
      for (const style of group.values) {
        style.remove();
        removedStyles[group.type] += 1;
      }
    }
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    for (const collection of collections) {
      removedVariableCollections.push({ id: collection.id, name: collection.name, variableCount: collection.variableIds.length });
      collection.remove();
    }
  }

  figma.commitUndo();
  const after = await inventoryFile();
  return { action, dryRun: false, confirm: true, plan, before, clearedPages, removedStyles, removedVariableCollections, undoCommitted: true, after };
}

async function inventoryFile(): Promise<Record<string, unknown>> {
  const pages = figma.root.children.filter((node): node is PageNode => node.type === "PAGE");
  const pageSummaries = [];
  for (const page of pages) {
    await page.loadAsync();
    const reusable = page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET", "INSTANCE"] });
    pageSummaries.push({
      id: page.id,
      name: page.name,
      childCount: page.children.length,
      descendantCount: page.findAll(() => true).length,
      components: reusable.filter((node) => node.type === "COMPONENT").length,
      componentSets: reusable.filter((node) => node.type === "COMPONENT_SET").length,
      instances: reusable.filter((node) => node.type === "INSTANCE").length,
      topLevel: page.children.slice(0, 100).map((node) => ({ id: node.id, name: node.name, type: node.type })),
    });
  }
  const [paints, texts, effects, grids, collections, variables] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
    figma.variables.getLocalVariableCollectionsAsync(),
    figma.variables.getLocalVariablesAsync(),
  ]);
  let enabledLibraryVariableCollections: number | null = null;
  let teamLibraryError: string | null = null;
  try {
    enabledLibraryVariableCollections = (await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()).length;
  } catch (error) {
    teamLibraryError = error instanceof Error ? error.message : String(error);
  }
  return {
    editorType: figma.editorType,
    fileName: figma.root.name,
    pages: pageSummaries,
    components: {
      total: pageSummaries.reduce((sum, page) => sum + page.components + page.componentSets + page.instances, 0),
      components: pageSummaries.reduce((sum, page) => sum + page.components, 0),
      componentSets: pageSummaries.reduce((sum, page) => sum + page.componentSets, 0),
      instances: pageSummaries.reduce((sum, page) => sum + page.instances, 0),
    },
    localStyles: { paint: paints.length, text: texts.length, effect: effects.length, grid: grids.length },
    variables: { collections: collections.length, variables: variables.length, names: collections.slice(0, 100).map((collection) => collection.name) },
    enabledLibraries: { variableCollections: enabledLibraryVariableCollections, error: teamLibraryError },
  };
}

async function inspectHandoff(params: QueryParams): Promise<Record<string, unknown>> {
  const node = await resolveNode(params.nodeId);
  const raw = node as unknown as {
    getCSSAsync?: () => Promise<Record<string, string>>;
    getDevResourcesAsync?: (options?: { includeChildren?: boolean }) => Promise<unknown[]>;
    getTopLevelFrame?: () => FrameNode | undefined;
    getPublishStatusAsync?: () => Promise<string>;
    key?: string;
    remote?: boolean;
    isAsset?: boolean;
    componentPropertyDefinitions?: unknown;
    componentProperties?: unknown;
  };
  let definition: ComponentNode | ComponentSetNode | null = null;
  if (node.type === "INSTANCE") definition = await node.getMainComponentAsync();
  else if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") definition = node;
  return {
    node: { id: node.id, name: node.name, type: node.type, isAsset: raw.isAsset === true },
    topLevelFrameId: raw.getTopLevelFrame?.()?.id ?? null,
    css: raw.getCSSAsync ? await raw.getCSSAsync() : null,
    devResources: raw.getDevResourcesAsync ? await raw.getDevResourcesAsync({ includeChildren: params.includeChildren === true }) : [],
    component: definition ? {
      id: definition.id,
      name: definition.name,
      type: definition.type,
      key: definition.key,
      remote: definition.remote,
      publishStatus: await definition.getPublishStatusAsync(),
      propertyDefinitions: definition.componentPropertyDefinitions,
    } : null,
    instanceProperties: node.type === "INSTANCE" ? node.componentProperties : null,
  };
}

async function inspectStructure(params: QueryParams): Promise<Record<string, unknown>> {
  const root = await resolveNode(params.nodeId) as SceneNode & { findAll?: (callback: (node: SceneNode) => boolean) => SceneNode[] };
  if (typeof root.findAll !== "function") throw failure(ErrorCode.INVALID_PARAMS, `Node "${root.id}" does not support structure traversal.`);
  const descendants = root.findAll(() => true);
  const links = [];
  for (const node of descendants) {
    if (node.type !== "INSTANCE") continue;
    const master = await node.getMainComponentAsync();
    links.push({ instanceId: node.id, instanceName: node.name, masterId: master?.id ?? null, masterName: master?.name ?? null });
  }
  const autoLayoutNodes = [root, ...descendants].filter((node) => "layoutMode" in node && node.layoutMode !== "NONE");
  return {
    rootId: root.id,
    descendantCount: descendants.length,
    componentCount: descendants.filter((node) => node.type === "COMPONENT").length,
    componentSetCount: descendants.filter((node) => node.type === "COMPONENT_SET").length,
    instanceCount: links.length,
    linkedInstanceCount: links.filter((item) => Boolean(item.masterId)).length,
    autoLayoutNodeCount: autoLayoutNodes.length,
    links,
  };
}

function validateQuery(params: Record<string, unknown>): QueryParams {
  const input = params as QueryParams;
  if (typeof input.nodeId !== "string" || !input.nodeId) throw failure(ErrorCode.INVALID_PARAMS, "nodeId is required for node_handoff and structure queries.");
  if (input.includeChildren !== undefined && typeof input.includeChildren !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "includeChildren must be boolean.");
  return input;
}

function validatePageIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 100 || !value.every((id) => typeof id === "string" && id.length > 0 && id.length <= 256)) {
    throw failure(ErrorCode.INVALID_PARAMS, "pageIds must be an array of 1-100 non-empty page ids.");
  }
  return [...new Set(value as string[])];
}

async function selectPages(pageIds?: string[]): Promise<PageNode[]> {
  const pages = figma.root.children.filter((node): node is PageNode => node.type === "PAGE");
  if (!pageIds) return pages;
  const selected: PageNode[] = [];
  for (const pageId of pageIds) {
    const node = await figma.getNodeByIdAsync(pageId);
    if (!node || node.type !== "PAGE") throw failure(ErrorCode.PAGE_NOT_FOUND, `Page "${pageId}" was not found.`);
    selected.push(node);
  }
  return selected;
}

async function resolveNode(value: unknown): Promise<SceneNode> {
  if (typeof value !== "string" || !value) throw failure(ErrorCode.INVALID_PARAMS, "nodeId must be a non-empty node id.");
  const node = await figma.getNodeByIdAsync(value);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE") throw failure(ErrorCode.TARGET_NOT_FOUND, `Scene node "${value}" was not found.`);
  return node;
}

function failure(code: ErrorCode, message: string, hint?: string): PluginExecError {
  return new PluginExecError({ code, message, ...(hint ? { hint } : {}) });
}
