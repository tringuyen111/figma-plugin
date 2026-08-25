/// <reference types="@figma/plugin-typings" />
import {
  fingerprint,
  type EntityGraphTargetWire,
  type EvidenceCoverageWire,
  type EvidenceEnvelopeWire,
} from "../../shared/entity-contract.js";
import { ErrorCode, type EntityKind } from "../../shared/protocol.js";
import { failure, isSceneNode, safeJson } from "./entity-operation-support.js";
import {
  controlMetadata,
  featureLimitations,
  findControlId,
  registryMetadata,
  syncState,
} from "../sync-engine.js";

const MAX_GRAPH_LIMIT = 1_000;
declare const __BUNDLE_REVISION__: string;
const PLUGIN_BUNDLE_REVISION = typeof __BUNDLE_REVISION__ === "string" ? __BUNDLE_REVISION__ : "dev";

export async function artifactManifest(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraphComplete(params);
  const snapshotId = fingerprint({
    fileName: figma.root.name,
    fileKey: (figma as unknown as { fileKey?: string }).fileKey ?? null,
    pages: graph.items,
    styles: await styleFacts(),
    variables: await variableFacts(),
  });
  return evidenceEnvelope("artifact_manifest", params, snapshotId, {
    fileName: figma.root.name,
    fileKey: (figma as unknown as { fileKey?: string }).fileKey ?? null,
    editorType: figma.editorType,
    pages: figma.root.children.filter((node): node is PageNode => node.type === "PAGE").map((page) => ({ id: page.id, name: page.name })),
    snapshotId,
    sync: syncState(),
    graphCoverage: graph.coverage,
  }, graph.coverage);
}

export async function entityGraph(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraph(params);
  const snapshotId = fingerprint(graph.items);
  return evidenceEnvelope("entity_graph", params, snapshotId, { items: graph.items, sync: syncState() }, graph.coverage);
}

export async function componentIntegrity(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraph({ ...params, projection: ["component", "prototype", "metadata"] });
  const allComponents: Array<Record<string, unknown>> = [];
  for (const page of pages()) {
    await page.loadAsync();
    for (const node of page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET", "INSTANCE", "SLOT"] })) {
      if (node.type === "INSTANCE") {
        const main = await node.getMainComponentAsync();
        allComponents.push({ id: node.id, type: node.type, name: node.name, pageId: page.id, controlId: controlMetadata(node)?.controlId ?? null, mainComponentId: main?.id ?? null, mainComponentKey: main?.key ?? null, detached: !main, overrides: safeJson(node.componentProperties), reactionCount: "reactions" in node ? node.reactions.length : 0 });
      } else if (node.type === "SLOT") {
        const childIds = node.children.slice(0, 64).map((child) => child.id);
        allComponents.push({
          id: node.id,
          type: node.type,
          name: node.name,
          pageId: page.id,
          controlId: controlMetadata(node)?.controlId ?? null,
          componentPropertyReferences: safeJson(node.componentPropertyReferences),
          limitViolations: safeJson(node.limitViolations),
          slotChildCount: node.children.length,
          slotChildIds: childIds,
          slotChildrenTruncated: node.children.length > childIds.length,
        });
      } else {
        const definitions = node.type === "COMPONENT_SET" || node.parent?.type !== "COMPONENT_SET" ? safeJson(node.componentPropertyDefinitions) : {};
        allComponents.push({ id: node.id, type: node.type, name: node.name, pageId: page.id, controlId: controlMetadata(node)?.controlId ?? null, key: node.key, remote: node.remote, variantCount: node.type === "COMPONENT_SET" ? node.children.length : null, properties: definitions });
      }
    }
  }
  const consumerCounts = new Map<string, number>();
  for (const item of allComponents) if (typeof item.mainComponentKey === "string") consumerCounts.set(item.mainComponentKey, (consumerCounts.get(item.mainComponentKey) ?? 0) + 1);
  for (const item of allComponents) if (typeof item.key === "string") item.consumerCount = consumerCounts.get(item.key) ?? 0;
  const graphIds = new Set(graph.items.map((item) => item.id).filter((id): id is string => typeof id === "string"));
  const components = allComponents.filter((item) => typeof item.id === "string" && graphIds.has(item.id));
  const componentCoverage = { total: allComponents.length, returned: components.length, alignedTo: "graph_page" };
  return evidenceEnvelope("component_integrity", params, fingerprint({ graph: graph.items, components }), { components, componentCoverage, graphCoverage: graph.coverage }, graph.coverage);
}

export async function bindingInventory(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraph({ ...params, projection: ["bindings", "metadata", "scene"] });
  const allVariables = await variableFacts();
  const allStyles = await styleFacts();
  const inventoryIncluded = parseOffset(params.cursor) === 0;
  const variables = inventoryIncluded ? allVariables : [];
  const styles = inventoryIncluded ? allStyles : [];
  const inventoryDelivery = {
    mode: "first_graph_page_only",
    included: inventoryIncluded,
    variables: { total: allVariables.length, returned: variables.length },
    styles: { total: allStyles.length, returned: styles.length },
  };
  return evidenceEnvelope("binding_inventory", params, fingerprint({ graph: graph.items, variables, styles }), { nodes: graph.items, variables, styles, inventoryDelivery, graphCoverage: graph.coverage }, graph.coverage);
}

export async function prototypeGraph(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const edges: Array<Record<string, unknown>> = [];
  const startingPoints: Array<Record<string, unknown>> = [];
  const missingDestinations: Array<Record<string, unknown>> = [];
  for (const page of pages()) {
    await page.loadAsync();
    const starts = (page as unknown as { flowStartingPoints?: Array<{ nodeId: string; name: string }> }).flowStartingPoints ?? [];
    for (const start of starts) startingPoints.push({ pageId: page.id, ...start });
    for (const node of page.findAll(() => true)) {
      if (!("reactions" in node) || node.reactions.length === 0) continue;
      const owner = prototypeOwner(node);
      for (let reactionIndex = 0; reactionIndex < node.reactions.length; reactionIndex += 1) {
        const reaction = node.reactions[reactionIndex];
        if (!reaction) continue;
        for (let actionIndex = 0; actionIndex < (reaction.actions ?? []).length; actionIndex += 1) {
          const action = (reaction.actions ?? [])[actionIndex];
          if (!action) continue;
          const destinationId = action.type === "NODE" ? action.destinationId : undefined;
          if (destinationId && !(await figma.getNodeByIdAsync(destinationId))) missingDestinations.push({ sourceId: node.id, destinationId, reactionIndex, actionIndex });
          edges.push({ sourceId: node.id, sourceName: node.name, sourceType: node.type, sourceOwnerId: owner.id, sourceOwnerName: owner.name, sourceOwnerType: owner.type, reactionIndex, actionIndex, trigger: reaction.trigger, action: safeJson(action), destinationId: destinationId ?? null });
        }
      }
    }
  }
  const reachable = new Set(startingPoints.map((start) => start.nodeId).filter((id): id is string => typeof id === "string"));
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) if (typeof edge.sourceOwnerId === "string" && reachable.has(edge.sourceOwnerId) && typeof edge.destinationId === "string" && !reachable.has(edge.destinationId)) { reachable.add(edge.destinationId); changed = true; }
  }
  const reactiveSources = [...new Set(edges.map((edge) => edge.sourceId).filter((id): id is string => typeof id === "string"))];
  const sourceOwnerBySourceId = new Map(edges.flatMap((edge) => typeof edge.sourceId === "string" && typeof edge.sourceOwnerId === "string" ? [[edge.sourceId, edge.sourceOwnerId] as const] : []));
  const unreachableSourceIds = reactiveSources.filter((id) => !reachable.has(sourceOwnerBySourceId.get(id) ?? id));
  const unreachableOwnerIds = [...new Set(unreachableSourceIds.map((id) => sourceOwnerBySourceId.get(id)).filter((id): id is string => typeof id === "string"))];
  const facts = { startingPoints, edges, edgeCount: edges.length, missingDestinations, missingDestinationCount: missingDestinations.length, reachableNodeIds: [...reachable], unreachableSourceIds, unreachableOwnerIds };
  return evidenceEnvelope("prototype_graph", params, fingerprint(facts), facts, { scope: "document", scanned: edges.length, total: edges.length, returned: edges.length, truncated: false });
}

function prototypeOwner(node: SceneNode): SceneNode {
  let current = node;
  while (current.parent && current.parent.type !== "PAGE" && current.parent.type !== "SECTION") {
    current = current.parent as SceneNode;
  }
  return current;
}

export async function motionSnapshot(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraph({ ...params, projection: ["motion", "metadata"] }, { includeTargetDescendants: true });
  const unsupported = graph.items.filter((item) => item.motionUnsupported === true).map((item) => ({ id: item.id, type: item.type }));
  return evidenceEnvelope("motion_snapshot", params, fingerprint(graph.items), { nodes: graph.items, unsupported, graphCoverage: graph.coverage }, graph.coverage);
}

export async function accessibilityFacts(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraph({ ...params, projection: ["geometry", "text", "visual", "prototype", "metadata"] });
  const interactive = graph.items.filter((item) => typeof item.reactionCount === "number" && item.reactionCount > 0).map((item) => {
    const width = typeof item.width === "number" ? item.width : null;
    const height = typeof item.height === "number" ? item.height : null;
    return { id: item.id, name: item.name, type: item.type, hitGeometry: { width, height, absoluteBoundingBox: item.absoluteBoundingBox ?? null }, hitTargetMin44: width !== null && height !== null && width >= 44 && height >= 44, text: item.characters ?? null, visible: item.visible, focusStateCues: { reactionCount: item.reactionCount ?? 0, name: item.name ?? null }, contrastInputs: { fills: item.fills ?? null, strokes: item.strokes ?? null, opacity: item.opacity ?? null } };
  });
  return evidenceEnvelope("accessibility_design_facts", params, fingerprint(interactive), { interactive, interactiveCoverage: { returned: interactive.length, alignedTo: "graph_page" }, runtimeSemantics: "NOT_RUN", graphCoverage: graph.coverage }, graph.coverage);
}

async function collectGraph(
  params: Record<string, unknown>,
  options: { includeTargetDescendants?: boolean } = {},
): Promise<{ items: Array<Record<string, unknown>>; coverage: EvidenceCoverageWire }> {
  const scope = params.scope === "node" ? "node" : params.scope === "page" ? "page" : "document";
  const limit = typeof params.limit === "number" && Number.isInteger(params.limit) ? Math.min(MAX_GRAPH_LIMIT, Math.max(1, params.limit)) : 200;
  if (params.scope === "styles" || params.scope === "variables" || params.entityKind === "style" || params.entityKind === "variable" || params.entityKind === "variable_collection") {
    const requestedKind = params.entityKind === "style" ? "style" : params.entityKind === "variable" ? "variable" : params.entityKind === "variable_collection" ? "variable_collection" : undefined;
    const variableProjection = new Set(Array.isArray(params.projection) ? params.projection.filter((item): item is string => typeof item === "string") : []);
    const all = (params.scope === "styles" || requestedKind === "style" ? await styleFacts() : await variableFacts({ details: variableProjection.has("variable_details") })).filter((item) => (!requestedKind || item.entityKind === requestedKind || requestedKind === "style") && (typeof params.logicalId !== "string" || item.controlId === params.logicalId));
    const offset = parseOffset(params.cursor);
    const items = all.slice(offset, offset + limit);
    const truncated = offset + items.length < all.length;
    const coverageScope: "styles" | "variables" = params.scope === "styles" || requestedKind === "style" ? "styles" : "variables";
    return { items, coverage: { scope: coverageScope, scanned: all.length, total: all.length, returned: items.length, truncated, ...(truncated ? { nextCursor: `offset:${offset + items.length}` } : {}) } };
  }
  const requestedNodeId = typeof params.nodeId === "string" ? params.nodeId : undefined;
  const requestedControlId = typeof params.logicalId === "string" ? params.logicalId : undefined;
  const includeDescendants = options.includeTargetDescendants === true;
  const pageScopeId = scope === "page" ? (typeof params.pageId === "string" ? params.pageId : figma.currentPage.id) : undefined;
  const projection = new Set(Array.isArray(params.projection) ? params.projection.filter((item): item is string => typeof item === "string") : ["scene", "geometry", "layout", "text", "component", "bindings", "prototype", "motion", "metadata"]);
  const candidates: SceneNode[] = [];
  if (requestedNodeId) {
    const target = await figma.getNodeByIdAsync(requestedNodeId);
    if (!target || target.type === "PAGE" || target.type === "DOCUMENT") throw failure(ErrorCode.TARGET_NOT_FOUND, `Scene node "${requestedNodeId}" was not found.`);
    candidates.push(target as SceneNode);
    if ((scope !== "node" || includeDescendants) && "findAll" in target && typeof (target as unknown as { findAll?: unknown }).findAll === "function") candidates.push(...(target as unknown as { findAll: (callback: (node: SceneNode) => boolean) => SceneNode[] }).findAll(() => true));
  } else if (requestedControlId) {
    const target = findControlId(requestedControlId);
    if (!target || !isSceneNode(target)) throw failure(ErrorCode.TARGET_NOT_FOUND, `Managed entity "${requestedControlId}" was not found.`);
    candidates.push(target);
    if ((scope !== "node" || includeDescendants) && "findAll" in target && typeof (target as unknown as { findAll?: unknown }).findAll === "function") candidates.push(...(target as unknown as { findAll: (callback: (node: SceneNode) => boolean) => SceneNode[] }).findAll(() => true));
  } else {
    for (const page of pages()) {
      await page.loadAsync();
      if (scope === "page" && page.id !== pageScopeId) continue;
      candidates.push(...page.findAll(() => true));
    }
  }
  const unique = [...new Map(candidates.map((node) => [node.id, node])).values()];
  const offset = parseOffset(params.cursor);
  const selected = unique.slice(offset, offset + limit);
  const items = selected.map((node) => projectNode(node, projection));
  const truncated = offset + items.length < unique.length;
  return { items, coverage: { scope, scanned: unique.length, total: unique.length, returned: items.length, truncated, ...(truncated ? { nextCursor: `offset:${offset + items.length}` } : {}) } };
}

async function collectGraphComplete(params: Record<string, unknown>): Promise<{ items: Array<Record<string, unknown>>; coverage: EvidenceCoverageWire }> {
  const items: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  let coverage: EvidenceCoverageWire = { scope: params.scope === "styles" || params.scope === "variables" ? params.scope : "document", scanned: 0, total: 0, returned: 0, truncated: false };
  do {
    const page = await collectGraph({ ...params, limit: MAX_GRAPH_LIMIT, ...(cursor ? { cursor } : {}) });
    items.push(...page.items);
    coverage = { ...page.coverage, returned: items.length };
    cursor = page.coverage.truncated ? page.coverage.nextCursor : undefined;
  } while (cursor);
  return { items, coverage: { ...coverage, truncated: false, returned: items.length } };
}

function projectNode(node: SceneNode, projection: Set<string>): Record<string, unknown> {
  const metadata = controlMetadata(node);
  const dynamic = node as unknown as Record<string, unknown>;
  const index = node.parent && "children" in node.parent ? node.parent.children.indexOf(node) : -1;
  const base: Record<string, unknown> = { id: node.id, type: node.type, name: node.name, parentId: node.parent?.id ?? null, index: index >= 0 ? index : null, controlId: metadata?.controlId ?? null };
  if (projection.has("scene") || projection.has("geometry")) Object.assign(base, { x: dynamic.x ?? null, y: dynamic.y ?? null, width: dynamic.width ?? null, height: dynamic.height ?? null, absoluteBoundingBox: safeJson(dynamic.absoluteBoundingBox), visible: dynamic.visible ?? null, locked: dynamic.locked ?? null, opacity: dynamic.opacity ?? null, rotation: dynamic.rotation ?? null, clipsContent: dynamic.clipsContent ?? null });
  if (projection.has("layout")) Object.assign(base, layoutFacts(node));
  if (projection.has("text") && node.type === "TEXT") Object.assign(base, { characters: node.characters, fontName: safeJson(node.fontName), fontSize: node.fontSize, lineHeight: safeJson(node.lineHeight), textAutoResize: node.textAutoResize });
  if (projection.has("component")) Object.assign(base, componentFacts(node));
  if (projection.has("visual")) Object.assign(base, { fills: safeJson(dynamic.fills), strokes: safeJson(dynamic.strokes), opacity: dynamic.opacity ?? null });
  if (projection.has("bindings")) Object.assign(base, { boundVariables: safeJson(dynamic.boundVariables), fills: safeJson(dynamic.fills), strokes: safeJson(dynamic.strokes) });
  if (projection.has("prototype") && "reactions" in node) Object.assign(base, { reactionCount: node.reactions.length, reactions: safeJson(node.reactions) });
  if (projection.has("motion")) {
    const dynamic = node as unknown as Record<string, unknown>;
    const motion = { animations: safeJson(dynamic.animations), animationStyles: safeJson(dynamic.animationStyles), manualKeyframeTracks: safeJson(dynamic.manualKeyframeTracks) };
    Object.assign(base, { ...motion, motionUnsupported: motion.animations === null && motion.animationStyles === null && motion.manualKeyframeTracks === null });
  }
  return base;
}

function layoutFacts(node: SceneNode): Record<string, unknown> {
  const dynamic = node as unknown as Record<string, unknown>;
  const parent = node.parent as unknown as Record<string, unknown> | null;
  const gridContainer = dynamic.layoutMode === "GRID" ? (() => {
    const rowSizes = Array.isArray(dynamic.gridRowSizes) ? dynamic.gridRowSizes.slice(0, 64) : [];
    const columnSizes = Array.isArray(dynamic.gridColumnSizes) ? dynamic.gridColumnSizes.slice(0, 64) : [];
    return {
      gridRowCount: dynamic.gridRowCount ?? null, gridColumnCount: dynamic.gridColumnCount ?? null,
      gridRowGap: dynamic.gridRowGap ?? null, gridColumnGap: dynamic.gridColumnGap ?? null,
      gridAutoTracks: dynamic.gridAutoTracks ?? null, gridItemsPositioning: dynamic.gridItemsPositioning ?? null,
      gridRowSizes: safeJson(rowSizes), gridRowSizesTruncated: Array.isArray(dynamic.gridRowSizes) && dynamic.gridRowSizes.length > rowSizes.length,
      gridColumnSizes: safeJson(columnSizes), gridColumnSizesTruncated: Array.isArray(dynamic.gridColumnSizes) && dynamic.gridColumnSizes.length > columnSizes.length,
    };
  })() : {};
  const gridChild = parent?.layoutMode === "GRID" ? {
    gridRowAnchorIndex: dynamic.gridRowAnchorIndex ?? null, gridColumnAnchorIndex: dynamic.gridColumnAnchorIndex ?? null,
    gridRowSpan: dynamic.gridRowSpan ?? null, gridColumnSpan: dynamic.gridColumnSpan ?? null,
    gridChildHorizontalAlign: dynamic.gridChildHorizontalAlign ?? null, gridChildVerticalAlign: dynamic.gridChildVerticalAlign ?? null,
  } : {};
  return {
    layoutMode: dynamic.layoutMode ?? null,
    primaryAxisSizingMode: dynamic.primaryAxisSizingMode ?? null,
    counterAxisSizingMode: dynamic.counterAxisSizingMode ?? null,
    primaryAxisAlignItems: dynamic.primaryAxisAlignItems ?? null,
    counterAxisAlignItems: dynamic.counterAxisAlignItems ?? null,
    itemSpacing: dynamic.itemSpacing ?? null,
    paddingTop: dynamic.paddingTop ?? null,
    paddingRight: dynamic.paddingRight ?? null,
    paddingBottom: dynamic.paddingBottom ?? null,
    paddingLeft: dynamic.paddingLeft ?? null,
    layoutGrids: safeJson(dynamic.layoutGrids),
    constraints: safeJson(dynamic.constraints),
    ...gridContainer,
    ...gridChild,
  };
}

function componentFacts(node: SceneNode): Record<string, unknown> {
  const dynamic = node as unknown as Record<string, unknown>;
  let definitions: unknown = null;
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    const canReadDefinitions = node.type === "COMPONENT_SET" || node.parent?.type !== "COMPONENT_SET";
    if (canReadDefinitions) {
      try { definitions = safeJson(dynamic.componentPropertyDefinitions); } catch { definitions = null; }
    }
  }
  const slotFacts = node.type === "SLOT" ? (() => {
    const childIds = node.children.slice(0, 64).map((child) => child.id);
    return {
      limitViolations: safeJson(node.limitViolations),
      slotChildCount: node.children.length,
      slotChildIds: childIds,
      slotChildrenTruncated: node.children.length > childIds.length,
    };
  })() : {};
  const componentSetFacts = node.type === "COMPONENT_SET" ? (() => {
    const memberIds = node.children.slice(0, 64).map((child) => child.id);
    return {
      componentSetMemberCount: node.children.length,
      componentSetMemberIds: memberIds,
      componentSetMembersTruncated: node.children.length > memberIds.length,
    };
  })() : {};
  return {
    key: dynamic.key ?? null,
    remote: dynamic.remote ?? null,
    componentPropertyDefinitions: definitions,
    componentProperties: safeJson(dynamic.componentProperties),
    componentPropertyReferences: safeJson(dynamic.componentPropertyReferences),
    ...slotFacts,
    ...componentSetFacts,
  };
}


export async function entitySummary(entity: BaseNode | BaseStyle | Variable | VariableCollection, entityKind: EntityKind): Promise<Record<string, unknown>> {
  const dynamic = entity as unknown as Record<string, unknown>;
  if (entityKind === "node" && isSceneNode(entity)) return projectNode(entity, new Set(["scene", "layout", "text", "component", "bindings", "prototype", "motion", "metadata"]));
  return { entityKind, id: dynamic.id ?? null, key: dynamic.key ?? null, name: dynamic.name ?? null, type: dynamic.type ?? null, remote: dynamic.remote ?? null, controlId: "getSharedPluginData" in dynamic ? controlMetadata(entity as BaseNodeMixin)?.controlId ?? null : typeof dynamic.id === "string" ? registryMetadata(dynamic.id)?.controlId ?? null : null };
}

async function styleFacts(): Promise<Array<Record<string, unknown>>> {
  const styles = [
    ...(await figma.getLocalPaintStylesAsync()).map((style) => ({ id: style.id, type: "paint", name: style.name, key: style.key, remote: style.remote, controlId: registryMetadata(style.id)?.controlId ?? null })),
    ...(await figma.getLocalTextStylesAsync()).map((style) => ({ id: style.id, type: "text", name: style.name, key: style.key, remote: style.remote, controlId: registryMetadata(style.id)?.controlId ?? null })),
    ...(await figma.getLocalEffectStylesAsync()).map((style) => ({ id: style.id, type: "effect", name: style.name, key: style.key, remote: style.remote, controlId: registryMetadata(style.id)?.controlId ?? null })),
    ...(await figma.getLocalGridStylesAsync()).map((style) => ({ id: style.id, type: "grid", name: style.name, key: style.key, remote: style.remote, controlId: registryMetadata(style.id)?.controlId ?? null })),
  ];
  return styles;
}

async function variableFacts(options: { details?: boolean } = {}): Promise<Array<Record<string, unknown>>> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const details = options.details === true;
  return [
    ...collections.map((collection) => ({
      entityKind: "variable_collection", id: collection.id, key: collection.key, name: collection.name, controlId: registryMetadata(collection.id)?.controlId ?? null, modes: safeJson(collection.modes), variableIds: collection.variableIds,
      ...(details ? { defaultModeId: collection.defaultModeId, hiddenFromPublishing: collection.hiddenFromPublishing, remote: collection.remote } : {}),
    })),
    ...variables.map((variable) => ({
      entityKind: "variable", id: variable.id, key: variable.key, name: variable.name, controlId: registryMetadata(variable.id)?.controlId ?? null, resolvedType: variable.resolvedType, collectionId: variable.variableCollectionId, remote: variable.remote,
      ...(details ? { valuesByMode: safeJson(variable.valuesByMode), scopes: safeJson(variable.scopes), codeSyntax: safeJson(variable.codeSyntax), description: variable.description, hiddenFromPublishing: variable.hiddenFromPublishing } : {}),
    })),
  ];
}

export function evidenceEnvelope(kind: string, params: Record<string, unknown>, snapshotId: string, facts: Record<string, unknown>, coverageValue?: EvidenceCoverageWire): EvidenceEnvelopeWire<Record<string, unknown>> {
  const target: EntityGraphTargetWire = {
    ...(typeof params.instanceId === "string" ? { instanceId: params.instanceId } : {}),
    fileKey: (figma as unknown as { fileKey?: string }).fileKey ?? null,
    fileName: figma.root.name,
    editorType: figma.editorType,
    pageId: typeof params.pageId === "string" ? params.pageId : figma.currentPage.id,
    ...(typeof params.nodeId === "string" ? { nodeId: params.nodeId } : {}),
    bundleRevision: PLUGIN_BUNDLE_REVISION,
    snapshotId,
  };
  return {
    schemaVersion: 2,
    kind,
    target,
    cursor: { syncEpoch: syncState().syncEpoch, changeSeq: syncState().changeSeq },
    ...(coverageValue ? { coverage: coverageValue } : {}),
    facts,
    limitations: featureLimitations(),
    observedAt: Date.now(),
  };
}

function pages(): PageNode[] { return figma.root.children.filter((node): node is PageNode => node.type === "PAGE"); }

function parseOffset(cursor: unknown): number {
  if (typeof cursor !== "string") return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  return match ? Number(match[1]) : 0;
}
