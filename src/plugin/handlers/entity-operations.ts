/// <reference types="@figma/plugin-typings" />
import {
  fingerprint,
  isRecord,
  validateConflictPolicy,
  validateEntityPatches,
  validateEntityRef,
  type CreateEntityPatchWire,
  type EntityGraphTargetWire,
  type EntityPatchRequestWire,
  type EntityPatchWire,
  type EvidenceCoverageWire,
  type EvidenceEnvelopeWire,
  type JsonValue,
} from "../../shared/entity-contract.js";
import { ErrorCode, type EntityKind, type QueryKind } from "../../shared/protocol.js";
import { PluginExecError } from "./execute-js.js";
import {
  changeFeed,
  controlMetadata,
  encodeCursor,
  ensureControlId,
  ensureRegistryId,
  featureLimitations,
  findRegistryEntity,
  findControlId,
  initializeSync,
  registryMetadata,
  refreshSync,
  rememberAgentChange,
  syncState,
} from "../sync-engine.js";

const MAX_GRAPH_LIMIT = 1_000;
declare const __BUNDLE_REVISION__: string;
const PLUGIN_BUNDLE_REVISION = typeof __BUNDLE_REVISION__ === "string" ? __BUNDLE_REVISION__ : "dev";

export async function queryEntity(kind: QueryKind, params: Record<string, unknown>): Promise<unknown> {
  await initializeSync();
  await refreshSync();
  if (kind === "artifact_manifest") return artifactManifest(params);
  if (kind === "entity_graph") return entityGraph(params);
  if (kind === "change_feed") {
    const feed = changeFeed(typeof params.cursor === "string" ? params.cursor : undefined, params.refresh === true);
    return envelope("change_feed", params, fingerprint(feed), feed, { scope: "document", scanned: Array.isArray(feed.changes) ? feed.changes.length : 0, total: typeof feed.toSeq === "number" ? feed.toSeq : null, returned: Array.isArray(feed.changes) ? feed.changes.length : 0, truncated: false });
  }
  if (kind === "component_integrity") return componentIntegrity(params);
  if (kind === "binding_inventory") return bindingInventory(params);
  if (kind === "prototype_graph") return prototypeGraph(params);
  if (kind === "motion_snapshot") return motionSnapshot(params);
  if (kind === "accessibility_design_facts") return accessibilityFacts(params);
  throw failure(ErrorCode.INVALID_PARAMS, `Unsupported extended query kind "${kind}".`);
}

export async function applyEntityPatch(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  await initializeSync();
  await refreshSync();
  const input = params as unknown as EntityPatchRequestWire & { traceId?: unknown };
  const maxOperations = input.maxOperations === undefined ? 100 : input.maxOperations;
  if (typeof maxOperations !== "number" || !Number.isInteger(maxOperations) || maxOperations < 1 || maxOperations > 100) throw failure(ErrorCode.INVALID_PARAMS, "maxOperations must be an integer from 1 to 100.");
  const patches = validateEntityPatches(input.patches, maxOperations).map((patch) => input.allowDelete === true && patch.kind === "delete" ? { ...patch, allowDelete: true } : patch);
  const conflictPolicy = validateConflictPolicy(input.conflictPolicy);
  const traceId = typeof input.traceId === "string" ? input.traceId : undefined;
  const dryRun = input.dryRun === undefined ? true : input.dryRun;
  if (typeof dryRun !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "dryRun must be boolean.");
  if (input.confirm !== undefined && typeof input.confirm !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "confirm must be boolean.");

  const before = await resolvePatchTargets(patches);
  const normalizedPatches = normalizePatches(patches, before);
  const snapshotId = await snapshotIdFor(before);
  const planHash = fingerprint({ patches: canonicalPlanPatches(patches), before, snapshotId, conflictPolicy });
  const plan = {
    action: "apply_entity_patch",
    snapshotId,
    planHash,
    conflictPolicy,
    maxOperations,
    patches: normalizedPatches,
    before,
    limitations: featureLimitations(),
  };
  if (dryRun) return { dryRun: true, plan, writePerformed: false };
  if (input.confirm !== true) throw failure(ErrorCode.INVALID_PARAMS, "apply_entity_patch requires confirm: true when dryRun is false.", "Run the same patch with dryRun: true, inspect planHash and targets, then pass expectedPlanHash and confirm: true.");
  if (typeof input.expectedPlanHash !== "string") throw failure(ErrorCode.INVALID_PARAMS, "expectedPlanHash is required when dryRun is false.", "Run the same patch with dryRun: true, inspect planHash, then pass it with confirm: true.");
  let rebasedFromPlanHash: string | undefined;
  let rebasedFromCursor: string | undefined;
  if (input.expectedPlanHash !== planHash) {
    if (conflictPolicy !== "merge_non_overlapping" || !canRebaseNonOverlapping(patches, before)) {
      throw failure(ErrorCode.DRIFT_CONFLICT, "expectedPlanHash does not match the current Figma document snapshot and the patch overlaps the observed drift.", "Re-run dryRun and inspect the new target fingerprints before executing.");
    }
    rebasedFromPlanHash = input.expectedPlanHash;
    const cursor = syncState();
    rebasedFromCursor = encodeCursor(cursor.syncEpoch, cursor.changeSeq);
  }

  const changedIds = before.map((item) => item.entityId).filter((item): item is string => typeof item === "string");
  if (traceId) rememberAgentChange(traceId, changedIds, changedProperties(patches));
  figma.commitUndo();
  const applied: Array<Record<string, unknown>> = [];
  try {
    for (const patch of patches) applied.push(await executePatch(patch, traceId));
    const after = applied.length ? applied : await resolvePatchTargets(patches);
    return {
      dryRun: false,
      writePerformed: true,
      state: "COMMITTED",
      plan,
      before,
      after,
      changedEntities: applied,
      ...(rebasedFromPlanHash ? { rebasedFromPlanHash } : {}),
      ...(rebasedFromCursor ? { rebasedFromCursor } : {}),
      undoCommitted: true,
      rollbackState: "not_needed",
    };
  } catch (error) {
    try {
      figma.triggerUndo();
      const rolledBack = await resolvePatchTargets(patches);
      const rollbackVerified = fingerprint(rolledBack) === fingerprint(before);
      return {
        dryRun: false,
        writePerformed: !rollbackVerified,
        state: rollbackVerified ? "ROLLED_BACK" : "PARTIAL_COMMIT",
        plan,
        before,
        changedEntities: applied,
        afterRollback: rolledBack,
        rollbackState: rollbackVerified ? "verified" : "unverified",
        error: error instanceof Error ? error.message : String(error),
        ...(rollbackVerified ? {} : { rollbackError: "Undo completed but the target fingerprint did not return to the pre-transaction value." }),
      };
    } catch (rollbackError) {
      return {
        dryRun: false,
        writePerformed: true,
        state: "PARTIAL_COMMIT",
        plan,
        before,
        changedEntities: applied,
        rollbackState: "unverified",
        error: error instanceof Error ? error.message : String(error),
        rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        limitations: [{ code: ErrorCode.ROLLBACK_FAILED, message: "The provider did not allow rollback verification; the document may contain a partial commit.", unlock: "Inspect artifact_manifest and change_feed before retrying." }],
      };
    }
  }
}

async function artifactManifest(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraphComplete(params);
  const snapshotId = fingerprint({
    fileName: figma.root.name,
    fileKey: (figma as unknown as { fileKey?: string }).fileKey ?? null,
    pages: graph.items,
    styles: await styleFacts(),
    variables: await variableFacts(),
  });
  return envelope("artifact_manifest", params, snapshotId, {
    fileName: figma.root.name,
    fileKey: (figma as unknown as { fileKey?: string }).fileKey ?? null,
    editorType: figma.editorType,
    pages: figma.root.children.filter((node): node is PageNode => node.type === "PAGE").map((page) => ({ id: page.id, name: page.name })),
    snapshotId,
    sync: syncState(),
    graphCoverage: graph.coverage,
  }, graph.coverage);
}

async function entityGraph(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraph(params);
  const snapshotId = fingerprint(graph.items);
  return envelope("entity_graph", params, snapshotId, { items: graph.items, sync: syncState() }, graph.coverage);
}

async function componentIntegrity(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraph({ ...params, projection: ["component", "prototype", "metadata"] });
  const allComponents: Array<Record<string, unknown>> = [];
  for (const page of pages()) {
    await page.loadAsync();
    for (const node of page.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET", "INSTANCE"] })) {
      if (node.type === "INSTANCE") {
        const main = await node.getMainComponentAsync();
        allComponents.push({ id: node.id, type: node.type, name: node.name, pageId: page.id, controlId: controlMetadata(node)?.controlId ?? null, mainComponentId: main?.id ?? null, mainComponentKey: main?.key ?? null, detached: !main, overrides: safeJson(node.componentProperties), reactionCount: "reactions" in node ? node.reactions.length : 0 });
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
  return envelope("component_integrity", params, fingerprint({ graph: graph.items, components }), { components, componentCoverage, graphCoverage: graph.coverage }, graph.coverage);
}

async function bindingInventory(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
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
  return envelope("binding_inventory", params, fingerprint({ graph: graph.items, variables, styles }), { nodes: graph.items, variables, styles, inventoryDelivery, graphCoverage: graph.coverage }, graph.coverage);
}

async function prototypeGraph(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
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
  return envelope("prototype_graph", params, fingerprint(facts), facts, { scope: "document", scanned: edges.length, total: edges.length, returned: edges.length, truncated: false });
}

function prototypeOwner(node: SceneNode): SceneNode {
  let current = node;
  while (current.parent && current.parent.type !== "PAGE" && current.parent.type !== "SECTION") {
    current = current.parent as SceneNode;
  }
  return current;
}

async function motionSnapshot(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraph({ ...params, projection: ["motion", "metadata"] }, { includeTargetDescendants: true });
  const unsupported = graph.items.filter((item) => item.motionUnsupported === true).map((item) => ({ id: item.id, type: item.type }));
  return envelope("motion_snapshot", params, fingerprint(graph.items), { nodes: graph.items, unsupported, graphCoverage: graph.coverage }, graph.coverage);
}

async function accessibilityFacts(params: Record<string, unknown>): Promise<EvidenceEnvelopeWire<Record<string, unknown>>> {
  const graph = await collectGraph({ ...params, projection: ["geometry", "text", "visual", "prototype", "metadata"] });
  const interactive = graph.items.filter((item) => typeof item.reactionCount === "number" && item.reactionCount > 0).map((item) => {
    const width = typeof item.width === "number" ? item.width : null;
    const height = typeof item.height === "number" ? item.height : null;
    return { id: item.id, name: item.name, type: item.type, hitGeometry: { width, height, absoluteBoundingBox: item.absoluteBoundingBox ?? null }, hitTargetMin44: width !== null && height !== null && width >= 44 && height >= 44, text: item.characters ?? null, visible: item.visible, focusStateCues: { reactionCount: item.reactionCount ?? 0, name: item.name ?? null }, contrastInputs: { fills: item.fills ?? null, strokes: item.strokes ?? null, opacity: item.opacity ?? null } };
  });
  return envelope("accessibility_design_facts", params, fingerprint(interactive), { interactive, interactiveCoverage: { returned: interactive.length, alignedTo: "graph_page" }, runtimeSemantics: "NOT_RUN", graphCoverage: graph.coverage }, graph.coverage);
}

async function collectGraph(
  params: Record<string, unknown>,
  options: { includeTargetDescendants?: boolean } = {},
): Promise<{ items: Array<Record<string, unknown>>; coverage: EvidenceCoverageWire }> {
  const scope = params.scope === "node" ? "node" : params.scope === "page" ? "page" : "document";
  const limit = typeof params.limit === "number" && Number.isInteger(params.limit) ? Math.min(MAX_GRAPH_LIMIT, Math.max(1, params.limit)) : 200;
  if (params.scope === "styles" || params.scope === "variables" || params.entityKind === "style" || params.entityKind === "variable" || params.entityKind === "variable_collection") {
    const requestedKind = params.entityKind === "style" ? "style" : params.entityKind === "variable" ? "variable" : params.entityKind === "variable_collection" ? "variable_collection" : undefined;
    const all = (params.scope === "styles" || requestedKind === "style" ? await styleFacts() : await variableFacts()).filter((item) => (!requestedKind || item.entityKind === requestedKind || requestedKind === "style") && (typeof params.logicalId !== "string" || item.controlId === params.logicalId));
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
  return {
    key: dynamic.key ?? null,
    remote: dynamic.remote ?? null,
    componentPropertyDefinitions: definitions,
    componentProperties: safeJson(dynamic.componentProperties),
    componentPropertyReferences: safeJson(dynamic.componentPropertyReferences),
  };
}

async function resolvePatchTargets(patches: EntityPatchWire[]): Promise<Array<Record<string, unknown>>> {
  const output: Array<Record<string, unknown>> = [];
  for (const patch of patches) {
    if (patch.kind === "create") {
      validateCreateShape(patch);
      if (patch.parent) {
        const parent = await resolveEntity(patch.parent, "node");
        if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "create parent does not accept children.");
      }
      output.push({ operation: "create", entityKind: patch.entityKind, controlId: patch.controlId ?? null, entityType: patch.entityType ?? null });
      continue;
    }
    const target = patch.target;
    if (!target) throw failure(ErrorCode.INVALID_PARAMS, `Patch kind "${patch.kind}" requires target.`);
    const resolved = await resolveEntity(target, patch.entityKind);
    assertExpectedType(resolved, target.expectedType);
    assertMutableTarget(resolved);
    await preflightMutation(patch, resolved);
    output.push(await entitySummary(resolved, patch.entityKind));
  }
  return output;
}

function validateCreateShape(patch: CreateEntityPatchWire): void {
  if (patch.entityKind === "node" && !["FRAME", "SECTION", "RECTANGLE", "ELLIPSE", "LINE", "POLYGON", "STAR", "TEXT", "COMPONENT", "SLICE", "BOOLEAN_OPERATION"].includes(patch.entityType ?? "FRAME")) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Typed create does not support node type "${patch.entityType}" yet.`);
  if (patch.entityKind === "style" && !["PAINT", "TEXT", "EFFECT", "GRID"].includes(stringProperty(patch.properties, "styleType", "PAINT"))) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported styleType "${stringProperty(patch.properties, "styleType", "PAINT")}".`);
}

async function preflightMutation(patch: Exclude<EntityPatchWire, CreateEntityPatchWire>, target: BaseNode | BaseStyle | Variable | VariableCollection): Promise<void> {
  if (patch.kind === "update") {
    if (patch.unset?.length) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unset is not supported for typed property groups yet (${patch.unset.join(", ")}).`, "Send an explicit stable default value instead of relying on an implicit reset.");
    validatePropertyShape(target, patch.set ?? {});
    return;
  }
  if (patch.kind === "move") {
    if (!isSceneNode(target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "move requires a scene node target.");
    const parent = await resolveEntity(patch.parent, "node");
    if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "move parent does not accept children.");
    return;
  }
  if (patch.kind === "clone") {
    if (!isSceneNode(target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "clone requires a scene node target.");
    if (patch.parent) {
      const parent = await resolveEntity(patch.parent, "node");
      if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "clone parent does not accept children.");
    }
    return;
  }
  if (patch.kind === "delete") {
    if (patch.allowDelete !== true) throw failure(ErrorCode.INVALID_PARAMS, "delete requires allowDelete: true on the patch or request.");
    return;
  }
  validateCommandShape(target, patch.kind, patch.command, patch.payload ?? {});
}

function validatePropertyShape(target: BaseNode | BaseStyle | Variable | VariableCollection, properties: Record<string, JsonValue>): void {
  const dynamic = target as unknown as Record<string, unknown>;
  for (const key of Object.keys(properties)) {
    if (key === "controlId" || key === "entityKind") continue;
    if (key === "collectionId" || key === "resolvedType") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Property "${key}" is immutable for an existing entity.`);
    if (key === "width" || key === "height") continue;
    if (["id", "key", "type", "parent", "children", "remote", "absoluteBoundingBox", "componentPropertyDefinitions"].includes(key)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Property "${key}" is immutable or provider-owned.`);
    if (key === "reactions") {
      if (typeof dynamic.setReactionsAsync !== "function" || !Array.isArray(properties[key])) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "reactions requires a node with setReactionsAsync and an array value.");
      continue;
    }
    if (key === "boundVariable") {
      if (typeof dynamic.setBoundVariable !== "function") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "Target does not support variable binding.");
      continue;
    }
    if (!(key in dynamic)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Property "${key}" is not supported on ${String(dynamic.type ?? "target")}.`);
  }
}

function validateCommandShape(target: BaseNode | BaseStyle | Variable | VariableCollection, kind: string, command: string | undefined, payload: Record<string, JsonValue>): void {
  const dynamic = target as unknown as Record<string, unknown>;
  if (kind === "set_reactions") {
    if (typeof dynamic.setReactionsAsync !== "function" || !Array.isArray(payload.reactions)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_reactions requires a node and reactions array.");
    return;
  }
  if (kind === "component_command" && command === "set_properties") {
    if (typeof dynamic.setProperties !== "function" || !isRecord(payload.properties)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_properties requires an instance and properties object.");
    return;
  }
  if (kind === "style_command" && command === "rename") {
    if (typeof payload.name !== "string" || !("name" in dynamic)) throw failure(ErrorCode.INVALID_PARAMS, "style rename requires a name.");
    return;
  }
  if (kind === "variable_command" && command === "set_value") {
    if (typeof dynamic.setValueForMode !== "function" || typeof payload.modeId !== "string") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_value requires a variable and modeId.");
    return;
  }
  if (kind === "motion_command") {
    if (command !== "set_tracks" || !("manualKeyframeTracks" in dynamic)) throw failure(ErrorCode.FEATURE_GATED, "Motion command is unavailable on this editor/runtime or command shape.");
    return;
  }
  if (kind === "set_bindings") {
    if (typeof dynamic.setBoundVariable !== "function" || !isRecord(payload.binding)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_bindings requires a binding object.");
    return;
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed command "${kind}:${command ?? "unknown"}".`);
}

function normalizePatches(patches: EntityPatchWire[], before: Array<Record<string, unknown>>): EntityPatchWire[] {
  return patches.map((patch, index) => {
    if (patch.kind === "create" || !patch.target) return patch;
    const observed = before[index];
    if (!observed) return patch;
    const propertyHashes = { ...(patch.precondition?.propertyHashes ?? {}) };
    if (patch.entityKind === "node") {
      for (const structuralProperty of ["parentId", "index"]) if (!(structuralProperty in propertyHashes) && structuralProperty in observed) propertyHashes[structuralProperty] = fingerprint(observed[structuralProperty]);
    }
    for (const property of patchTouchedProperties(patch)) {
      if (property === "__entity") {
        if (!(property in propertyHashes)) propertyHashes[property] = fingerprint(observed);
      } else if (!(property in propertyHashes) && property in observed) {
        propertyHashes[property] = fingerprint(observed[property]);
      }
    }
    if (Object.keys(propertyHashes).length === 0) return patch;
    return { ...patch, precondition: { ...(patch.precondition ?? {}), propertyHashes } } as EntityPatchWire;
  });
}

function canonicalPlanPatches(patches: EntityPatchWire[]): EntityPatchWire[] {
  return patches.map((patch) => {
    if (!("precondition" in patch) || !patch.precondition) return patch;
    const clone = { ...patch } as Record<string, unknown>;
    delete clone.precondition;
    return clone as unknown as EntityPatchWire;
  });
}

function patchTouchedProperties(patch: EntityPatchWire): string[] {
  if (patch.kind === "update") return Object.keys(patch.set ?? {}).concat(patch.unset ?? []);
  if (patch.kind === "move") return ["parentId", "index"];
  if (patch.kind === "clone" || patch.kind === "delete") return ["__entity"];
  if (patch.kind === "set_reactions") return ["reactions"];
  if (patch.kind === "set_bindings") return ["boundVariables"];
  if (patch.kind === "component_command") return ["componentProperties"];
  if (patch.kind === "style_command") return ["name"];
  if (patch.kind === "variable_command") return ["values"];
  if (patch.kind === "motion_command") return ["motion"];
  return [patch.kind];
}

function canRebaseNonOverlapping(patches: EntityPatchWire[], before: Array<Record<string, unknown>>): boolean {
  for (const [index, patch] of patches.entries()) {
    if (patch.kind === "create" || !patch.target) continue;
    const observed = before[index];
    const expected = patch.precondition?.propertyHashes;
    if (!observed || !expected) return false;
    if (patch.entityKind === "node") {
      for (const structuralProperty of ["parentId", "index"]) if (structuralProperty in expected && fingerprint(observed[structuralProperty]) !== expected[structuralProperty]) return false;
    }
    for (const property of patchTouchedProperties(patch)) {
      if (property === "__entity") {
        if (fingerprint(observed) !== expected[property]) return false;
        continue;
      }
      if (!(property in expected) || fingerprint(observed[property]) !== expected[property]) return false;
    }
  }
  return true;
}

async function executePatch(patch: EntityPatchWire, traceId?: string): Promise<Record<string, unknown>> {
  if (patch.kind === "create") return createEntity(patch, traceId);
  if (!patch.target) throw failure(ErrorCode.INVALID_PARAMS, `Patch kind "${patch.kind}" requires target.`);
  const target = await resolveEntity(patch.target, patch.entityKind);
  assertExpectedType(target, patch.target.expectedType);
  if (patch.entityKind !== "node") ensureRegistryId((target as { id: string }).id, patch.entityKind, patch.target.controlId);
  assertMutableTarget(target);
  if (patch.kind === "update") {
    if (patch.unset?.length) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unset is not supported for typed property groups yet (${patch.unset.join(", ")}).`, "Send an explicit stable default value instead of relying on an implicit reset.");
    await applyProperties(target, patch.set ?? {});
    return entitySummary(target, patch.entityKind);
  }
  if (patch.kind === "move") {
    if (!isSceneNode(target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "move requires a scene node target.");
    const parent = await resolveEntity(patch.parent, "node");
    if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "move parent does not accept children.");
    parent.appendChild(target);
    if (patch.index !== undefined && patch.index < parent.children.length) parent.insertChild(patch.index, target);
    return entitySummary(target, "node");
  }
  if (patch.kind === "clone") {
    if (!isSceneNode(target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "clone requires a scene node target.");
    const clone = target.clone();
    const parent = patch.parent ? await resolveEntity(patch.parent, "node") : target.parent;
    if (parent && isChildrenParent(parent) && clone.parent?.id !== parent.id) parent.appendChild(clone);
    if (patch.index !== undefined && parent && isChildrenParent(parent) && patch.index < parent.children.length) parent.insertChild(patch.index, clone);
    assignFreshControlId(clone, patch.controlId, traceId);
    return entitySummary(clone, "node");
  }
  if (patch.kind === "delete") {
    if (patch.allowDelete !== true) throw failure(ErrorCode.INVALID_PARAMS, "delete requires allowDelete: true on the patch or request.");
    if (!isRemovable(target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "The target cannot be removed through typed CRUD.");
    const id = target.id;
    target.remove();
    return { id, deleted: true, entityKind: patch.entityKind };
  }
  return executeCommand(target, patch.kind, patch.command, patch.payload ?? {});
}

async function createEntity(patch: CreateEntityPatchWire, traceId?: string): Promise<Record<string, unknown>> {
  if (patch.entityKind === "node") {
    const node = createNode(patch.entityType ?? "FRAME");
    const parent = patch.parent ? await resolveEntity(patch.parent, "node") : figma.currentPage;
    if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "create parent does not accept children.");
    parent.appendChild(node);
    if (patch.index !== undefined && patch.index < parent.children.length) parent.insertChild(patch.index, node);
    assignFreshControlId(node, patch.controlId, traceId);
    await applyProperties(node, patch.properties ?? {});
    return entitySummary(node, "node");
  }
  if (patch.entityKind === "style") return createStyle(patch);
  if (patch.entityKind === "variable_collection") {
    const name = stringProperty(patch.properties, "name", "Untitled collection");
    const collection = figma.variables.createVariableCollection(name);
    const controlId = ensureRegistryId(collection.id, patch.entityKind, patch.controlId);
    return { id: collection.id, key: collection.key, name: collection.name, controlId, entityKind: patch.entityKind, created: true };
  }
  if (patch.entityKind === "variable") {
    const collectionId = stringProperty(patch.properties, "collectionId", "");
    const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
    if (!collection) throw failure(ErrorCode.TARGET_NOT_FOUND, `Variable collection "${collectionId}" was not found.`);
    const variable = figma.variables.createVariable(stringProperty(patch.properties, "name", "Untitled variable"), collection, stringProperty(patch.properties, "resolvedType", "STRING") as VariableResolvedDataType);
    const controlId = ensureRegistryId(variable.id, patch.entityKind, patch.controlId);
    return { id: variable.id, key: variable.key, name: variable.name, controlId, resolvedType: variable.resolvedType, entityKind: patch.entityKind, created: true };
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported entityKind "${patch.entityKind}" for create.`);
}

function createNode(entityType: string): SceneNode {
  if (entityType === "FRAME") return figma.createFrame();
  if (entityType === "SECTION") return figma.createSection();
  if (entityType === "RECTANGLE") return figma.createRectangle();
  if (entityType === "ELLIPSE") return figma.createEllipse();
  if (entityType === "LINE") return figma.createLine();
  if (entityType === "POLYGON") return figma.createPolygon();
  if (entityType === "STAR") return figma.createStar();
  if (entityType === "TEXT") return figma.createText();
  if (entityType === "COMPONENT") return figma.createComponent();
  if (entityType === "SLICE") return figma.createSlice();
  if (entityType === "BOOLEAN_OPERATION") return figma.createBooleanOperation();
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Typed create does not support node type "${entityType}" yet.`);
}

async function createStyle(patch: CreateEntityPatchWire): Promise<Record<string, unknown>> {
  const properties = patch.properties ?? {};
  const styleType = stringProperty(properties, "styleType", "PAINT");
  const name = stringProperty(properties, "name", "Untitled style");
  let style: BaseStyle;
  if (styleType === "PAINT") style = figma.createPaintStyle();
  else if (styleType === "TEXT") style = figma.createTextStyle();
  else if (styleType === "EFFECT") style = figma.createEffectStyle();
  else if (styleType === "GRID") style = figma.createGridStyle();
  else throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported styleType "${styleType}".`);
  style.name = name;
  const controlId = ensureRegistryId(style.id, "style", patch.controlId);
  return { id: style.id, name: style.name, key: style.key, controlId, styleType, entityKind: "style", created: true };
}

async function applyProperties(target: BaseNode | BaseStyle | Variable | VariableCollection, properties: Record<string, JsonValue>): Promise<void> {
  const dynamic = target as unknown as Record<string, unknown>;
  if ("characters" in properties && target && "type" in dynamic && dynamic.type === "TEXT") {
    const text = target as TextNode;
    if (text.fontName !== figma.mixed) await figma.loadFontAsync(text.fontName);
  }
  for (const [key, value] of Object.entries(properties)) {
    if (key === "controlId" || key === "entityKind") continue;
    if (key === "collectionId" || key === "resolvedType") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Property "${key}" is immutable for an existing entity.`);
    if (key === "reactions") {
      if (!("setReactionsAsync" in dynamic) || !Array.isArray(value)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "reactions requires a node with setReactionsAsync and an array value.");
      await (target as SceneNode & { setReactionsAsync: (reactions: Reaction[]) => Promise<void> }).setReactionsAsync(value as unknown as Reaction[]);
      continue;
    }
    if (key === "boundVariable") {
      await applyBinding(target, value);
      continue;
    }
    if (key === "width" || key === "height") continue;
    if (!(key in dynamic)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Property "${key}" is not supported on ${String(dynamic.type ?? "target")}.`);
    try { dynamic[key] = value as unknown; } catch (error) { throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Property "${key}" was rejected: ${error instanceof Error ? error.message : String(error)}.`); }
  }
  const width = numberProperty(properties, "width");
  const height = numberProperty(properties, "height");
  if ((width !== undefined || height !== undefined) && "resize" in dynamic && typeof dynamic.resize === "function") {
    const currentWidth = typeof dynamic.width === "number" ? dynamic.width : width ?? 1;
    const currentHeight = typeof dynamic.height === "number" ? dynamic.height : height ?? 1;
    (dynamic.resize as (width: number, height: number) => void)(width ?? currentWidth, height ?? currentHeight);
  }
}

async function applyBinding(target: BaseNode | BaseStyle | Variable | VariableCollection, value: JsonValue): Promise<void> {
  if (!isRecord(value)) throw failure(ErrorCode.INVALID_PARAMS, "boundVariable must contain field and variableId.");
  const field = typeof value.field === "string" ? value.field : "";
  const variableId = typeof value.variableId === "string" ? value.variableId : "";
  const variable = variableId ? await figma.variables.getVariableByIdAsync(variableId) : null;
  if (!variable || !field) throw failure(ErrorCode.TARGET_NOT_FOUND, "boundVariable requires an existing variableId and field.");
  const dynamic = target as unknown as { setBoundVariable?: (field: string, variable: Variable) => void };
  if (typeof dynamic.setBoundVariable !== "function") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "Target does not support variable binding.");
  dynamic.setBoundVariable(field, variable);
}

async function executeCommand(target: BaseNode | BaseStyle | Variable | VariableCollection, kind: string, command: string | undefined, payload: Record<string, JsonValue>): Promise<Record<string, unknown>> {
  assertMutableTarget(target);
  if (kind === "set_reactions") {
    if (!("setReactionsAsync" in target) || !Array.isArray(payload.reactions)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_reactions requires a node and reactions array.");
    await (target as SceneNode & { setReactionsAsync: (reactions: Reaction[]) => Promise<void> }).setReactionsAsync(payload.reactions as unknown as Reaction[]);
    return entitySummary(target, "node");
  }
  if (kind === "component_command" && command === "set_properties") {
    if (!("setProperties" in target) || !isRecord(payload.properties)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_properties requires an instance and properties object.");
    (target as InstanceNode).setProperties(payload.properties as unknown as Record<string, string | boolean>);
    return entitySummary(target, "node");
  }
  if (kind === "style_command" && command === "rename") {
    if (typeof payload.name !== "string" || !("name" in target)) throw failure(ErrorCode.INVALID_PARAMS, "style rename requires a name.");
    target.name = payload.name;
    return entitySummary(target, "style");
  }
  if (kind === "variable_command" && command === "set_value") {
    if (!("setValueForMode" in target) || typeof payload.modeId !== "string") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_value requires a variable and modeId.");
    (target as Variable).setValueForMode(payload.modeId, payload.value as unknown as VariableValue);
    return entitySummary(target, "variable");
  }
  if (kind === "motion_command") {
    const dynamic = target as unknown as Record<string, unknown>;
    if (command !== "set_tracks" || !("manualKeyframeTracks" in dynamic)) throw failure(ErrorCode.FEATURE_GATED, "Motion command is unavailable on this editor/runtime or command shape.");
    dynamic.manualKeyframeTracks = payload.tracks as unknown;
    return entitySummary(target, "node");
  }
  if (kind === "set_bindings") {
    await applyBinding(target, payload.binding ?? null);
    return entitySummary(target, "node");
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed command "${kind}:${command ?? "unknown"}".`);
}

async function resolveEntity(ref: { controlId?: string; nodeId?: string; styleId?: string; variableId?: string; collectionId?: string }, entityKind: EntityKind): Promise<BaseNode | BaseStyle | Variable | VariableCollection> {
  validateEntityRef(ref);
  if (ref.controlId) {
    const found = findControlId(ref.controlId);
    if (found && isSceneNode(found)) {
      if (entityKind !== "node") throw failure(ErrorCode.STALE_TARGET, "The resolved controlId belongs to a node, not the requested entity kind.");
      return found;
    }
    const registry = findRegistryEntity(ref.controlId, entityKind);
    if (!registry) throw failure(ErrorCode.TARGET_NOT_FOUND, `Managed entity "${ref.controlId}" was not found.`);
    if (entityKind === "style") {
      const styles = [...(await figma.getLocalPaintStylesAsync()), ...(await figma.getLocalTextStylesAsync()), ...(await figma.getLocalEffectStylesAsync()), ...(await figma.getLocalGridStylesAsync())];
      const style = styles.find((item) => item.id === registry.entityId);
      if (!style) throw failure(ErrorCode.TARGET_NOT_FOUND, `Managed style "${ref.controlId}" was not found.`);
      return style;
    }
    if (entityKind === "variable") {
      const variable = await figma.variables.getVariableByIdAsync(registry.entityId);
      if (!variable) throw failure(ErrorCode.TARGET_NOT_FOUND, `Managed variable "${ref.controlId}" was not found.`);
      return variable;
    }
    const collection = await figma.variables.getVariableCollectionByIdAsync(registry.entityId);
    if (!collection) throw failure(ErrorCode.TARGET_NOT_FOUND, `Managed variable collection "${ref.controlId}" was not found.`);
    return collection;
  }
  if (ref.nodeId) {
    const node = await figma.getNodeByIdAsync(ref.nodeId);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") throw failure(ErrorCode.TARGET_NOT_FOUND, `Node "${ref.nodeId}" was not found.`);
    assertEntityKind(node as SceneNode, entityKind);
    return node as SceneNode;
  }
  if (ref.styleId) {
    const styles = [...(await figma.getLocalPaintStylesAsync()), ...(await figma.getLocalTextStylesAsync()), ...(await figma.getLocalEffectStylesAsync()), ...(await figma.getLocalGridStylesAsync())];
    const style = styles.find((item) => item.id === ref.styleId);
    if (!style) throw failure(ErrorCode.TARGET_NOT_FOUND, `Style "${ref.styleId}" was not found.`);
    assertEntityKind(style, entityKind);
    return style;
  }
  if (ref.variableId) {
    const variable = await figma.variables.getVariableByIdAsync(ref.variableId);
    if (!variable) throw failure(ErrorCode.TARGET_NOT_FOUND, `Variable "${ref.variableId}" was not found.`);
    assertEntityKind(variable, entityKind);
    return variable;
  }
  const collection = ref.collectionId ? await figma.variables.getVariableCollectionByIdAsync(ref.collectionId) : null;
  if (!collection) throw failure(ErrorCode.TARGET_NOT_FOUND, `Variable collection "${ref.collectionId ?? ""}" was not found.`);
  assertEntityKind(collection, entityKind);
  return collection;
}

async function entitySummary(entity: BaseNode | BaseStyle | Variable | VariableCollection, entityKind: EntityKind): Promise<Record<string, unknown>> {
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

async function variableFacts(): Promise<Array<Record<string, unknown>>> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  return [
    ...collections.map((collection) => ({ entityKind: "variable_collection", id: collection.id, key: collection.key, name: collection.name, controlId: registryMetadata(collection.id)?.controlId ?? null, modes: safeJson(collection.modes), variableIds: collection.variableIds })),
    ...variables.map((variable) => ({ entityKind: "variable", id: variable.id, key: variable.key, name: variable.name, controlId: registryMetadata(variable.id)?.controlId ?? null, resolvedType: variable.resolvedType, collectionId: variable.variableCollectionId, remote: variable.remote })),
  ];
}

function envelope(kind: string, params: Record<string, unknown>, snapshotId: string, facts: Record<string, unknown>, coverageValue?: EvidenceCoverageWire): EvidenceEnvelopeWire<Record<string, unknown>> {
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
function isSceneNode(value: BaseNode | BaseStyle | Variable | VariableCollection): value is SceneNode { return "parent" in value && "remove" in value && "type" in value && value.type !== "PAGE" && value.type !== "DOCUMENT"; }
function isChildrenParent(value: BaseNode | BaseStyle | Variable | VariableCollection): value is PageNode | FrameNode | SectionNode | ComponentNode | ComponentSetNode | InstanceNode | GroupNode { return "appendChild" in value && "children" in value; }
function isRemovable(value: BaseNode | BaseStyle | Variable | VariableCollection): value is SceneNode | BaseStyle | Variable | VariableCollection { return typeof (value as unknown as { remove?: unknown }).remove === "function"; }
function assertExpectedType(target: BaseNode | BaseStyle | Variable | VariableCollection, expectedType?: string): void { if (expectedType && (target as unknown as { type?: string }).type !== expectedType) throw failure(ErrorCode.STALE_TARGET, `Expected target type "${expectedType}" but observed "${String((target as unknown as { type?: string }).type)}".`); }
function assertEntityKind(target: BaseNode | BaseStyle | Variable | VariableCollection, entityKind: EntityKind): void {
  const node = isSceneNode(target);
  if (entityKind === "node" && !node) throw failure(ErrorCode.STALE_TARGET, "The resolved identity is not a scene node.");
  if (entityKind !== "node" && node) throw failure(ErrorCode.STALE_TARGET, `The resolved identity is a scene node, not ${entityKind}.`);
  if (entityKind === "style" && !["PAINT", "TEXT", "EFFECT", "GRID"].includes(String((target as { type?: unknown }).type))) throw failure(ErrorCode.STALE_TARGET, "The resolved identity is not a local style.");
  if (entityKind === "variable" && !("setValueForMode" in target)) throw failure(ErrorCode.STALE_TARGET, "The resolved identity is not a variable.");
  if (entityKind === "variable_collection" && !("variableIds" in target)) throw failure(ErrorCode.STALE_TARGET, "The resolved identity is not a variable collection.");
}
function assertMutableTarget(target: BaseNode | BaseStyle | Variable | VariableCollection): void {
  if (Boolean((target as unknown as { remote?: unknown }).remote)) throw failure(ErrorCode.FEATURE_GATED, "Remote/provider-owned entities are read-only through typed CRUD.", "Use a local editable entity or the provider's supported publish/import workflow.");
}
function assignFreshControlId(node: BaseNodeMixin, requested?: string, traceId?: string): string {
  const validRequested = requested && /^[A-Za-z0-9._:-]{8,128}$/.test(requested) ? requested : undefined;
  const collision = validRequested ? findControlId(validRequested) ?? findRegistryEntity(validRequested) : null;
  const controlId = collision ? `entity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}` : validRequested ?? `entity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const metadata = { schemaVersion: 1, controlId, entityKind: "node", ...(traceId ? { createdByTraceId: traceId } : {}), ...(collision && validRequested ? { forkedFrom: validRequested } : {}) };
  node.setSharedPluginData("figmaplugin", "control", JSON.stringify(metadata));
  return controlMetadata(node)?.controlId ?? ensureControlId(node, "node", controlId, traceId);
}
function changedProperties(patches: EntityPatchWire[]): string[] { return [...new Set(patches.flatMap((patch) => patch.kind === "update" ? Object.keys(patch.set ?? {}) : patch.kind === "set_reactions" ? ["reactions"] : patch.kind === "set_bindings" ? ["boundVariables"] : [patch.kind]))]; }
function stringProperty(properties: Record<string, JsonValue> | undefined, key: string, fallback: string): string { const value = properties?.[key]; return typeof value === "string" ? value : fallback; }
function numberProperty(properties: Record<string, JsonValue>, key: string): number | undefined { const value = properties[key]; return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function safeJson(value: unknown): unknown { try { return value === undefined ? null : JSON.parse(JSON.stringify(value)); } catch { return null; } }
function snapshotIdFor(before: Array<Record<string, unknown>>): Promise<string> { return Promise.resolve(fingerprint(before)); }
function parseOffset(cursor: unknown): number {
  if (typeof cursor !== "string") return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  return match ? Number(match[1]) : 0;
}
function failure(code: ErrorCode, message: string, hint?: string): PluginExecError { return new PluginExecError({ code, message, ...(hint ? { hint } : {}) }); }
