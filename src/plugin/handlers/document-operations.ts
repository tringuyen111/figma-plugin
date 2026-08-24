/// <reference types="@figma/plugin-typings" />
import { ErrorCode, LIBRARY_ASSET_TYPES, type LibraryAssetType, type QueryKind } from "../../shared/protocol.js";
import { PluginExecError } from "./execute-js.js";
import { applyEntityPatch, queryEntity } from "./entity-operations.js";

type QueryParams = { kind?: unknown; nodeId?: unknown; includeChildren?: unknown };
type LibraryImportParams = {
  action?: unknown;
  assetType?: unknown;
  key?: unknown;
  dryRun?: unknown;
  confirm?: unknown;
  instanceName?: unknown;
  x?: unknown;
  y?: unknown;
  propertyValues?: unknown;
};

export async function queryDocument(params: Record<string, unknown>): Promise<unknown> {
  const kind = params.kind;
  if (kind === "file_inventory") return inventoryFile();
  if (kind === "library_inventory") return inventoryLibrary();
  if (kind === "node_handoff") return inspectHandoff(validateQuery(params));
  if (kind === "structure") return inspectStructure(validateQuery(params));
  if (typeof kind === "string" && ["artifact_manifest", "entity_graph", "change_feed", "component_integrity", "binding_inventory", "prototype_graph", "motion_snapshot", "accessibility_design_facts"].includes(kind)) return queryEntity(kind as QueryKind, params);
  throw failure(ErrorCode.INVALID_PARAMS, `query kind is unsupported (got ${String(kind)}). Supported kinds are file_inventory, library_inventory, node_handoff, structure, artifact_manifest, entity_graph, change_feed, component_integrity, binding_inventory, prototype_graph, motion_snapshot, and accessibility_design_facts.`);
}

export async function applyDocument(params: Record<string, unknown>): Promise<unknown> {
  const action = params.action;
  if (action === "import_library_asset") return importLibraryAsset(params);
  if (action === "apply_entity_patch") return applyEntityPatch(params);
  if (action !== "clear_file_owned_assets") {
    throw failure(ErrorCode.INVALID_PARAMS, `apply action is unsupported (got ${String(action)}). Supported actions are clear_file_owned_assets, import_library_asset, and apply_entity_patch.`);
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

/** Inspect native library identities and status without claiming publish authority. */
async function inventoryLibrary(): Promise<Record<string, unknown>> {
  const pages = figma.root.children.filter((node): node is PageNode => node.type === "PAGE");
  const assets: Array<Record<string, unknown>> = [];
  for (const page of pages) {
    await page.loadAsync();
    const nodes = page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
    for (const node of nodes) {
      const publishable = node as ComponentNode | ComponentSetNode;
      let publishStatus: string | null = null;
      try { publishStatus = await publishable.getPublishStatusAsync(); } catch { publishStatus = null; }
      let definitions: ComponentPropertyDefinitions = {};
      const canReadDefinitions = node.type === "COMPONENT_SET" || node.parent?.type !== "COMPONENT_SET";
      if (canReadDefinitions) {
        try { definitions = publishable.componentPropertyDefinitions; } catch { definitions = {}; }
      }
      assets.push({
        id: node.id,
        type: node.type,
        name: node.name,
        pageId: page.id,
        pageName: page.name,
        parentId: node.parent?.id ?? null,
        key: publishable.key ?? null,
        remote: publishable.remote === true,
        publishStatus,
        variantCount: node.type === "COMPONENT_SET" ? node.children.length : null,
        properties: summarizePropertyDefinitions(definitions),
      });
    }
    const instances = page.findAllWithCriteria({ types: ["INSTANCE"] });
    for (const instance of instances) {
      const main = await instance.getMainComponentAsync();
      assets.push({
        id: instance.id,
        type: instance.type,
        name: instance.name,
        pageId: page.id,
        pageName: page.name,
        parentId: instance.parent?.id ?? null,
        mainComponentId: main?.id ?? null,
        mainComponentKey: main?.key ?? null,
        remote: main?.remote === true,
      });
    }
  }

  const styles = [
    ...(await summarizeStyles("paint", await figma.getLocalPaintStylesAsync())),
    ...(await summarizeStyles("text", await figma.getLocalTextStylesAsync())),
    ...(await summarizeStyles("effect", await figma.getLocalEffectStylesAsync())),
    ...(await summarizeStyles("grid", await figma.getLocalGridStylesAsync())),
  ];
  const variables = await figma.variables.getLocalVariablesAsync();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  let enabledCollections: Array<Record<string, unknown>> = [];
  let enabledLibraryError: string | null = null;
  try {
    const available = await withTimeout(figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync(), "getAvailableLibraryVariableCollectionsAsync");
    enabledCollections = await Promise.all(available.map(async (collection) => {
      try {
        const libraryVariables = await withTimeout(figma.teamLibrary.getVariablesInLibraryCollectionAsync(collection.key), `getVariablesInLibraryCollectionAsync(${collection.key})`);
        return { ...collection, variables: libraryVariables.slice(0, 500), variableCount: libraryVariables.length };
      } catch (error) {
        return { ...collection, variables: [], variableCount: null, error: error instanceof Error ? error.message : String(error) };
      }
    }));
  } catch (error) {
    enabledLibraryError = error instanceof Error ? error.message : String(error);
  }

  return {
    editorType: figma.editorType,
    fileName: figma.root.name,
    fileKey: (figma as unknown as { fileKey?: string }).fileKey ?? null,
    local: {
      components: assets.filter((asset) => asset.type === "COMPONENT" || asset.type === "COMPONENT_SET"),
      instances: assets.filter((asset) => asset.type === "INSTANCE"),
      styles,
      variables: variables.map((variable) => ({
        id: variable.id,
        key: variable.key,
        name: variable.name,
        resolvedType: variable.resolvedType,
        remote: variable.remote,
        collectionId: variable.variableCollectionId,
      })),
      collections: collections.map((collection) => ({ id: collection.id, name: collection.name, key: collection.key, variableCount: collection.variableIds.length })),
    },
    enabledLibraries: { variableCollections: enabledCollections, error: enabledLibraryError },
    publicationAuthority: {
      pluginApiCanInspectPublishStatus: true,
      pluginApiCanImportPublishedAssetsByKey: true,
      pluginApiCanPublishLibrary: false,
      pluginApiCanEnableLibrary: false,
      requiredExternalAction: "Figma publish/enable authority is outside the native Plugin API surface.",
    },
  };
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = 8_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

async function summarizeStyles(type: string, styles: readonly BaseStyle[]): Promise<Array<Record<string, unknown>>> {
  return Promise.all(styles.map(async (style) => {
    let publishStatus: string | null = null;
    const publishable = style as BaseStyle & { getPublishStatusAsync?: () => Promise<string> };
    try { publishStatus = publishable.getPublishStatusAsync ? await publishable.getPublishStatusAsync() : null; } catch { publishStatus = null; }
    return { id: style.id, type, name: style.name, key: style.key, remote: style.remote, publishStatus };
  }));
}

function summarizePropertyDefinitions(definitions: ComponentPropertyDefinitions): Array<Record<string, unknown>> {
  return Object.entries(definitions).map(([name, definition]) => ({
    name,
    type: definition.type,
    defaultValue: definition.defaultValue,
    ...(definition.variantOptions ? { variantOptions: definition.variantOptions } : {}),
    ...(definition.preferredValues ? { preferredValues: definition.preferredValues } : {}),
  }));
}

/** Import one published asset with a dry-run/confirm gate and typed readback. */
async function importLibraryAsset(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const input = params as LibraryImportParams;
  const assetType = validateLibraryAssetType(input.assetType);
  const key = validateLibraryKey(input.key);
  const dryRun = input.dryRun === undefined ? true : input.dryRun;
  const confirm = input.confirm === true;
  if (typeof dryRun !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "dryRun must be boolean.");
  if (input.confirm !== undefined && typeof input.confirm !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "confirm must be boolean.");

  const instanceName = input.instanceName === undefined ? `Imported / ${assetType} / ${key.slice(0, 8)}` : validateInstanceName(input.instanceName);
  const x = input.x === undefined ? 80 : validateCoordinate(input.x, "x");
  const y = input.y === undefined ? 80 : validateCoordinate(input.y, "y");
  const propertyValues = validatePropertyValues(input.propertyValues);
  const page = figma.currentPage;
  await page.loadAsync();
  const existing = assetType === "component" || assetType === "component_set"
    ? page.findOne((node) => node.type === "INSTANCE" && node.name === instanceName) as InstanceNode | null
    : null;
  const existingProof = existing ? await instanceProof(existing, key) : null;
  if (existing && existingProof) {
    const observedIdentityKey = assetType === "component_set" ? existingProof.mainComponentSetKey : existingProof.mainComponentKey;
    if (observedIdentityKey !== key) {
      throw failure(ErrorCode.AMBIGUOUS_TARGET, `Target instance "${instanceName}" already exists but is linked to a different library identity.`, "Use a new instanceName or inspect the existing target before retrying.");
    }
  }
  const providerOperation = assetType === "component"
    ? "figma.importComponentByKeyAsync"
    : assetType === "component_set"
      ? "figma.importComponentSetByKeyAsync"
      : assetType === "style"
        ? "figma.importStyleByKeyAsync"
        : "figma.variables.importVariableByKeyAsync";
  const plan = {
    action: "import_library_asset",
    assetType,
    key,
    providerOperation,
    targetPage: { id: page.id, name: page.name },
    instanceName: assetType === "component" || assetType === "component_set" ? instanceName : null,
    propertyValues: propertyValues ?? null,
    existingTarget: existingProof ? { id: existingProof.id, name: existingProof.name, mainComponentKey: existingProof.mainComponentKey, mainComponentSetKey: existingProof.mainComponentSetKey } : null,
    writePerformed: false,
  };
  if (dryRun) return { dryRun: true, plan };
  if (!confirm) {
    throw failure(ErrorCode.INVALID_PARAMS, "import_library_asset requires confirm: true when dryRun is false.", "Run the same action with dryRun: true, inspect the exact key/page plan, then pass confirm: true.");
  }
  if (existing) return { dryRun: false, state: "PASS_ALREADY_PRESENT", plan, writePerformed: false, instance: existingProof };

  try {
    if (assetType === "component" || assetType === "component_set") {
      const imported = assetType === "component"
        ? await figma.importComponentByKeyAsync(key)
        : await figma.importComponentSetByKeyAsync(key);
      const component = imported.type === "COMPONENT_SET" ? imported.defaultVariant : imported;
      const instance = component.createInstance();
      try {
        if (instance.parent?.id !== page.id) page.appendChild(instance);
        instance.name = instanceName;
        instance.x = x;
        instance.y = y;
        if (propertyValues) instance.setProperties(propertyValues as Parameters<InstanceNode["setProperties"]>[0]);
        const proof = await instanceProof(instance, key);
        figma.commitUndo();
        return {
          dryRun: false,
          state: "PASS_LIBRARY_ASSET_IMPORTED",
          plan,
          writePerformed: true,
          importedAsset: { id: imported.id, type: imported.type, name: imported.name, key: imported.key, remote: imported.remote, sourceSetKey: imported.type === "COMPONENT_SET" ? imported.key : null },
          instance: proof,
        };
      } catch (error) {
        if (instance.parent && typeof instance.remove === "function") instance.remove();
        throw error;
      }
    }

    const imported = assetType === "style"
      ? await figma.importStyleByKeyAsync(key)
      : await figma.variables.importVariableByKeyAsync(key);
    figma.commitUndo();
    return {
      dryRun: false,
      state: "PASS_LIBRARY_ASSET_IMPORTED",
      plan,
      writePerformed: true,
      importedAsset: { id: imported.id, type: assetType, name: imported.name, key: "key" in imported ? imported.key : key, remote: "remote" in imported ? imported.remote : true },
    };
  } catch (error) {
    if (error instanceof PluginExecError) throw error;
    throw failure(ErrorCode.SANDBOX_ERROR, error instanceof Error ? error.message : String(error), `The provider rejected ${providerOperation}. Verify that the key is published, accessible, and compatible with this editor.`);
  }
}

async function instanceProof(instance: InstanceNode, requestedKey: string): Promise<Record<string, unknown>> {
  const main = await instance.getMainComponentAsync();
  const mainSet = main?.parent?.type === "COMPONENT_SET" ? main.parent : null;
  return {
    id: instance.id,
    name: instance.name,
    parentId: instance.parent?.id ?? null,
    mainComponentId: main?.id ?? null,
    mainComponentKey: main?.key ?? null,
    mainComponentSetKey: mainSet?.key ?? null,
    requestedKey,
    componentProperties: instance.componentProperties,
  };
}

function validateLibraryAssetType(value: unknown): LibraryAssetType {
  if (typeof value !== "string" || !LIBRARY_ASSET_TYPES.includes(value as LibraryAssetType)) {
    throw failure(ErrorCode.INVALID_PARAMS, `assetType must be one of: ${LIBRARY_ASSET_TYPES.join(", ")}.`);
  }
  return value as LibraryAssetType;
}

function validateLibraryKey(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    throw failure(ErrorCode.INVALID_PARAMS, "key must be a non-empty library asset key up to 256 characters.");
  }
  return value.trim();
}

function validateInstanceName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 180 || /[\u0000-\u001f]/.test(value)) {
    throw failure(ErrorCode.INVALID_PARAMS, "instanceName must be a non-empty name up to 180 characters.");
  }
  return value.trim();
}

function validateCoordinate(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -1_000_000 || value > 1_000_000) {
    throw failure(ErrorCode.INVALID_PARAMS, `${label} must be a finite number between -1000000 and 1000000.`);
  }
  return value;
}

function validatePropertyValues(value: unknown): Record<string, string | boolean> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure(ErrorCode.INVALID_PARAMS, "propertyValues must be an object of exact Figma property keys to string/boolean values.");
  const output: Record<string, string | boolean> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key || (typeof item !== "string" && typeof item !== "boolean")) throw failure(ErrorCode.INVALID_PARAMS, "propertyValues keys must map to string or boolean values.");
    output[key] = item;
  }
  return output;
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
