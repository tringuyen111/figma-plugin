/// <reference types="@figma/plugin-typings" />
import {
  fingerprint,
  isRecord,
  planEntityPatchExecution,
  validateConflictPolicy,
  validateEntityPatches,
  validateEntityRef,
  type CreateEntityPatchWire,
  type EntityRefWire,
  type EntityGraphTargetWire,
  type EntityPatchRequestWire,
  type EntityPatchWire,
  type EvidenceCoverageWire,
  type EvidenceEnvelopeWire,
  type JsonValue,
  type SetBindings,
  type VariableCommand,
} from "../../shared/entity-contract.js";
import { ErrorCode, type EntityKind, type QueryKind } from "../../shared/protocol.js";
import { PluginExecError } from "./execute-js.js";
import {
  MUTATION_SNAPSHOT_SCHEMA_VERSION,
  mutationSnapshotEntry,
  mutationSnapshotFingerprint,
  mutationSnapshotsEqual,
} from "./entity-mutation-snapshot.js";
import {
  changeFeed,
  controlMetadata,
  encodeCursor,
  assignFreshControlId,
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

interface ResolvedPatchTarget {
  evidence: Record<string, unknown>;
  mutation: Record<string, unknown>;
}

function patchAt(patches: EntityPatchWire[], index: number, source: string): EntityPatchWire {
  const patch = patches[index];
  if (!patch) throw failure(ErrorCode.INTERNAL, `${source} references out-of-range patch index ${index}.`);
  return patch;
}

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
  const executionPlan = planEntityPatchExecution(patches);
  const conflictPolicy = validateConflictPolicy(input.conflictPolicy);
  const traceId = typeof input.traceId === "string" ? input.traceId : undefined;
  const resultMode = input.resultMode === undefined ? "full" : input.resultMode;
  if (resultMode !== "full" && resultMode !== "receipt") throw failure(ErrorCode.INVALID_PARAMS, 'resultMode must be "full" or "receipt".');
  const dryRun = input.dryRun === undefined ? true : input.dryRun;
  if (typeof dryRun !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "dryRun must be boolean.");
  if (input.confirm !== undefined && typeof input.confirm !== "boolean") throw failure(ErrorCode.INVALID_PARAMS, "confirm must be boolean.");

  const resolvedBefore = await resolvePatchTargets(patches, executionPlan);
  const before = resolvedBefore.map((item) => item.evidence);
  const mutationBefore = resolvedBefore.map((item) => item.mutation);
  const normalizedPatches = normalizePatches(patches, mutationBefore);
  const snapshotId = mutationSnapshotFingerprint(mutationBefore);
  const planHash = fingerprint({ patches: canonicalPlanPatches(patches), mutationBefore, snapshotId, conflictPolicy, executionOrder: executionPlan.order });
  const plan = {
    action: "apply_entity_patch",
    snapshotSchemaVersion: MUTATION_SNAPSHOT_SCHEMA_VERSION,
    snapshotId,
    planHash,
    conflictPolicy,
    maxOperations,
    patches: normalizedPatches,
    before,
    executionOrder: executionPlan.order,
    dependencies: executionPlan.dependencies,
    producers: executionPlan.producers,
    deferredPreflightCount: before.filter((item) => item.preflight === "deferred_to_execution").length,
    limitations: featureLimitations(),
  };
  if (dryRun) return { dryRun: true, plan, writePerformed: false };
  if (input.confirm !== true) throw failure(ErrorCode.INVALID_PARAMS, "apply_entity_patch requires confirm: true when dryRun is false.", "Run the same patch with dryRun: true, inspect planHash and targets, then pass expectedPlanHash and confirm: true.");
  if (typeof input.expectedPlanHash !== "string") throw failure(ErrorCode.INVALID_PARAMS, "expectedPlanHash is required when dryRun is false.", "Run the same patch with dryRun: true, inspect planHash, then pass it with confirm: true.");
  let rebasedFromPlanHash: string | undefined;
  let rebasedFromCursor: string | undefined;
  if (input.expectedPlanHash !== planHash) {
    if (conflictPolicy !== "merge_non_overlapping" || !canRebaseNonOverlapping(patches, mutationBefore)) {
      throw failure(ErrorCode.DRIFT_CONFLICT, "expectedPlanHash does not match the current Figma document snapshot and the patch overlaps the observed drift.", "Re-run dryRun and inspect the new target fingerprints before executing.");
    }
    rebasedFromPlanHash = input.expectedPlanHash;
    const cursor = syncState();
    rebasedFromCursor = encodeCursor(cursor.syncEpoch, cursor.changeSeq);
  }

  const changedIds = [...new Set(before.flatMap((item) => [item.entityId, ...(Array.isArray(item.affectedEntityIds) ? item.affectedEntityIds : [])]).filter((item): item is string => typeof item === "string"))];
  if (traceId) rememberAgentChange(traceId, changedIds, changedProperties(patches));
  figma.commitUndo();
  const appliedByIndex: Array<Record<string, unknown> | undefined> = new Array(patches.length);
  const localRefs = new Map<string, { entityKind: EntityKind; ref: EntityRefWire }>();
  const orderedApplied = (): Array<Record<string, unknown>> => appliedByIndex.flatMap((item) => item ? [item] : []);
  try {
    for (const patchIndex of executionPlan.order) {
      const patch = patchAt(patches, patchIndex, "Execution plan");
      const executablePatch = materializeLocalPatchRefs(patch, localRefs);
      const summary = await executePatch(executablePatch, traceId);
      const opRef = producerOpRef(patch);
      const enriched = opRef ? { ...summary, opRef, entityKind: patch.entityKind } : summary;
      appliedByIndex[patchIndex] = enriched;
      if (opRef) localRefs.set(opRef, { entityKind: patch.entityKind, ref: concreteEntityRef(patch.entityKind, summary) });
    }
    const applied = orderedApplied();
    const after = applied.length ? applied : (await resolvePatchTargets(patches, executionPlan)).map((item) => item.evidence);
    if (resultMode === "receipt") {
      return {
        dryRun: false,
        writePerformed: true,
        state: "COMMITTED",
        resultMode: "receipt",
        plan: compactMutationPlan(plan),
        beforeFingerprint: mutationSnapshotFingerprint(mutationBefore),
        afterFingerprint: fingerprint(after),
        changedEntities: compactChangedEntities(appliedByIndex, patches),
        ...(rebasedFromPlanHash ? { rebasedFromPlanHash } : {}),
        ...(rebasedFromCursor ? { rebasedFromCursor } : {}),
        undoCommitted: true,
        rollbackState: "not_needed",
      };
    }
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
    const applied = orderedApplied();
    try {
      figma.triggerUndo();
      const resolvedRolledBack = await resolvePatchTargets(patches, executionPlan);
      const rolledBack = resolvedRolledBack.map((item) => item.evidence);
      const mutationRolledBack = resolvedRolledBack.map((item) => item.mutation);
      const survivingProducedEntities = await findSurvivingProducedEntities(patches, appliedByIndex);
      const rollbackFingerprintMatches = mutationSnapshotsEqual(mutationRolledBack, mutationBefore);
      const rollbackVerified = rollbackFingerprintMatches && survivingProducedEntities.length === 0;
      const rollbackFailureDetail = rollbackVerified ? undefined : rollbackFailureMessage(rollbackFingerprintMatches, survivingProducedEntities);
      if (resultMode === "receipt") {
        return {
          dryRun: false,
          writePerformed: !rollbackVerified,
          state: rollbackVerified ? "ROLLED_BACK" : "PARTIAL_COMMIT",
          resultMode: "receipt",
          plan: compactMutationPlan(plan),
          beforeFingerprint: mutationSnapshotFingerprint(mutationBefore),
          changedEntities: compactChangedEntities(appliedByIndex, patches),
          afterRollbackFingerprint: mutationSnapshotFingerprint(mutationRolledBack),
          rollbackState: rollbackVerified ? "verified" : "unverified",
          error: error instanceof Error ? error.message : String(error),
          ...(rollbackVerified ? {} : { rollbackError: rollbackFailureDetail, survivingProducedEntities }),
        };
      }
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
        ...(rollbackVerified ? {} : { rollbackError: rollbackFailureDetail, survivingProducedEntities }),
      };
    } catch (rollbackError) {
      if (resultMode === "receipt") {
        return {
          dryRun: false,
          writePerformed: true,
          state: "PARTIAL_COMMIT",
          resultMode: "receipt",
          plan: compactMutationPlan(plan),
          beforeFingerprint: mutationSnapshotFingerprint(mutationBefore),
          changedEntities: compactChangedEntities(appliedByIndex, patches),
          rollbackState: "unverified",
          error: error instanceof Error ? error.message : String(error),
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
          limitations: [{ code: ErrorCode.ROLLBACK_FAILED, message: "The provider did not allow rollback verification; the document may contain a partial commit.", unlock: "Inspect artifact_manifest and change_feed before retrying." }],
        };
      }
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


const COMPACT_CHANGED_ENTITY_FIELDS = [
  "opRef",
  "id",
  "controlId",
  "key",
  "type",
  "name",
  "styleType",
  "resolvedType",
  "collectionId",
  "variableCollectionId",
  "created",
  "deleted",
  "componentId",
  "componentPropertyKey",
  "previousComponentPropertyKey",
  "componentPropertyType",
  "deletedComponentProperty",
  "slotReset",
  "componentSetMemberCount",
  "modeId",
  "modeName",
  "aliasedVariableId",
  "codeSyntaxPlatform",
] as const;

function compactMutationPlan(plan: Record<string, unknown>): Record<string, unknown> {
  return {
    action: plan.action,
    snapshotSchemaVersion: plan.snapshotSchemaVersion,
    snapshotId: plan.snapshotId,
    planHash: plan.planHash,
    conflictPolicy: plan.conflictPolicy,
    maxOperations: plan.maxOperations,
    operationCount: Array.isArray(plan.patches) ? plan.patches.length : 0,
    ...(Array.isArray(plan.executionOrder) ? { executionOrder: plan.executionOrder } : {}),
    ...(Array.isArray(plan.dependencies) ? { dependencies: plan.dependencies } : {}),
    ...(typeof plan.deferredPreflightCount === "number" ? { deferredPreflightCount: plan.deferredPreflightCount } : {}),
    ...(Array.isArray(plan.limitations) && plan.limitations.length ? { limitations: plan.limitations } : {}),
  };
}

function compactChangedEntities(entitiesByIndex: Array<Record<string, unknown> | undefined>, patches: EntityPatchWire[]): Array<Record<string, unknown>> {
  return entitiesByIndex.flatMap((entity, index) => {
    if (!entity) return [];
    const compact: Record<string, unknown> = { entityKind: entity.entityKind ?? patches[index]?.entityKind ?? null };
    for (const key of COMPACT_CHANGED_ENTITY_FIELDS) if (entity[key] !== undefined && entity[key] !== null) compact[key] = entity[key];
    return [compact];
  });
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

async function resolvePatchTargets(
  patches: EntityPatchWire[],
  executionPlan = planEntityPatchExecution(patches),
): Promise<ResolvedPatchTarget[]> {
  const output: ResolvedPatchTarget[] = [];
  const producers = new Map(executionPlan.producers.map((producer) => [producer.opRef, producer]));
  for (const [patchIndex, patch] of patches.entries()) {
    if (patch.kind === "create") {
      validateCreateShape(patch);
      let deferred = false;
      let collectionFact: Record<string, unknown> | undefined;
      if (patch.parent) {
        if (patch.parent.opRef) {
          validateLocalParentProducer(patch.parent, producers, patches, `patches[${patchIndex}].parent`);
          deferred = true;
        } else {
          const parent = await resolveEntity(patch.parent, "node");
          if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "create parent does not accept children.");
        }
      }
      if (patch.entityKind === "variable") {
        if (patch.collection?.opRef) {
          const producer = producers.get(patch.collection.opRef);
          if (!producer) throw failure(ErrorCode.INVALID_PARAMS, `patches[${patchIndex}].collection references missing opRef producer "${patch.collection.opRef}".`);
          if (producer.entityKind !== "variable_collection") throw failure(ErrorCode.INVALID_PARAMS, `patches[${patchIndex}].collection opRef "${patch.collection.opRef}" must produce a variable_collection.`);
          collectionFact = { opRef: patch.collection.opRef, preflight: "deferred_to_execution" };
          deferred = true;
        } else if (patch.collection) {
          const collection = await resolveEntity(patch.collection, "variable_collection");
          assertMutableTarget(collection);
          collectionFact = { id: collection.id, name: collection.name };
        } else {
          const collectionId = stringProperty(patch.properties, "collectionId", "");
          const collection = collectionId ? await figma.variables.getVariableCollectionByIdAsync(collectionId) : null;
          if (!collection) throw failure(ErrorCode.TARGET_NOT_FOUND, `Variable collection "${collectionId}" was not found.`);
          assertMutableTarget(collection);
          collectionFact = { id: collection.id, name: collection.name, legacyCollectionId: true };
        }
      }
      const evidence = {
        operation: "create",
        entityKind: patch.entityKind,
        controlId: patch.controlId ?? null,
        entityType: patch.entityType ?? null,
        opRef: patch.opRef ?? null,
        ...(patch.parent?.opRef ? { parentOpRef: patch.parent.opRef } : {}),
        ...(collectionFact ? { collection: collectionFact } : {}),
        preflight: deferred ? "deferred_to_execution" : "complete",
      };
      output.push(resolvedPatchTarget(patch, evidence));
      continue;
    }
    if (isCombineVariantsPatch(patch)) {
      const evidence = await preflightCombineVariantsPatch(patch, producers, patches, patchIndex);
      output.push(resolvedPatchTarget(patch, evidence));
      continue;
    }
    const target = patch.target;
    if (!target) throw failure(ErrorCode.INVALID_PARAMS, `Patch kind "${patch.kind}" requires target.`);
    if (target.opRef) {
      const producer = producers.get(target.opRef);
      if (!producer) throw failure(ErrorCode.INVALID_PARAMS, `Missing local producer for opRef "${target.opRef}".`);
      const producerPatch = patchAt(patches, producer.patchIndex, "Local target producer");
      validateLocalExpectedType(target, producerPatch);
      await preflightDeferredLocalTarget(patch, producers, patches, patchIndex);
      const evidence = {
        operation: "local_ref",
        entityKind: patch.entityKind,
        opRef: target.opRef,
        producerIndex: producer.patchIndex,
        producerKind: producerPatch.kind,
        producerEntityType: producerPatch.kind === "create" ? producerPatch.entityType ?? null : null,
        preflight: "deferred_to_execution",
      };
      output.push(resolvedPatchTarget(patch, evidence));
      continue;
    }
    const resolved = await resolveEntity(target, patch.entityKind);
    assertExpectedType(resolved, target.expectedType);
    assertMutableTarget(resolved);
    await preflightMutation(patch, resolved, true);
    const summary = await entitySummary(resolved, patch.entityKind);
    const deferredEdges = {
      ...("alias" in patch && patch.alias?.opRef ? { aliasOpRef: patch.alias.opRef } : {}),
      ...("variable" in patch && patch.variable?.opRef ? { variableOpRef: patch.variable.opRef } : {}),
    };
    const withDeferred = Object.keys(deferredEdges).length ? { ...summary, ...deferredEdges, preflight: "deferred_to_execution" } : summary;
    const evidence = producerOpRef(patch) ? { ...withDeferred, producesOpRef: producerOpRef(patch) } : withDeferred;
    output.push(resolvedPatchTarget(patch, evidence, resolved));
  }
  return output;
}

function resolvedPatchTarget(
  patch: EntityPatchWire,
  evidence: Record<string, unknown>,
  target?: BaseNode | BaseStyle | Variable | VariableCollection,
): ResolvedPatchTarget {
  return {
    evidence,
    mutation: mutationSnapshotEntry(patch, target, evidence, patchTouchedProperties(patch)),
  };
}

async function preflightCombineVariantsPatch(
  patch: EntityPatchWire & { members?: EntityRefWire[]; parent?: EntityRefWire; index?: number },
  producers: Map<string, { patchIndex: number; entityKind: EntityKind }>,
  patches: EntityPatchWire[],
  patchIndex: number,
): Promise<Record<string, unknown>> {
  if (figma.editorType !== "figma" || typeof (figma as unknown as { combineAsVariants?: unknown }).combineAsVariants !== "function") {
    throw failure(ErrorCode.FEATURE_GATED, "component combine_variants requires Figma Design with native combineAsVariants support.");
  }
  const members = patch.members ?? [];
  const memberSnapshots: Array<Record<string, unknown>> = [];
  const resolvedMemberIds = new Set<string>();
  let deferred = false;
  let parentPageId = figma.currentPage.id;
  let parentFact: Record<string, unknown> = { id: figma.currentPage.id, type: "PAGE", name: figma.currentPage.name, currentPage: true };

  if (patch.parent?.opRef) {
    validateLocalParentProducer(patch.parent, producers, patches, `patches[${patchIndex}].parent`);
    deferred = true;
    parentFact = { opRef: patch.parent.opRef, preflight: "deferred_to_execution" };
    parentPageId = "deferred";
  } else if (patch.parent) {
    const parent = await resolveEntity(patch.parent, "node");
    assertMutableTarget(parent);
    if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "combine_variants parent does not accept children.");
    parentPageId = owningPageId(parent) ?? figma.currentPage.id;
    parentFact = { id: (parent as { id: string }).id, type: String((parent as { type?: unknown }).type ?? "UNKNOWN"), name: String((parent as { name?: unknown }).name ?? ""), pageId: parentPageId };
    if (patch.index !== undefined && patch.index > parent.children.length) throw failure(ErrorCode.INVALID_PARAMS, "combine_variants index exceeds parent child count.");
  } else if (patch.index !== undefined && patch.index > figma.currentPage.children.length) {
    throw failure(ErrorCode.INVALID_PARAMS, "combine_variants index exceeds current page child count.");
  }

  for (const [memberIndex, member] of members.entries()) {
    if (member.opRef) {
      const producer = producers.get(member.opRef);
      if (!producer) throw failure(ErrorCode.INVALID_PARAMS, `Missing local producer for component member opRef "${member.opRef}".`);
      validateLocalExpectedType({ ...member, expectedType: "COMPONENT" }, patchAt(patches, producer.patchIndex, "Variant member producer"));
      memberSnapshots.push({ opRef: member.opRef, expectedType: "COMPONENT", preflight: "deferred_to_execution" });
      deferred = true;
      continue;
    }
    const resolved = await resolveEntity(member, "node");
    assertMutableTarget(resolved);
    if (!isSceneNode(resolved) || resolved.type !== "COMPONENT") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `combine_variants members[${memberIndex}] must resolve to a COMPONENT.`);
    assertExpectedType(resolved, member.expectedType);
    if (resolvedMemberIds.has(resolved.id)) throw failure(ErrorCode.INVALID_PARAMS, `combine_variants members resolve to duplicate component id "${resolved.id}".`);
    resolvedMemberIds.add(resolved.id);
    const memberPageId = owningPageId(resolved);
    if (parentPageId !== "deferred" && memberPageId && memberPageId !== parentPageId) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "combine_variants members and parent must belong to the same page.");
    memberSnapshots.push(variantMemberSnapshot(resolved));
  }

  return {
    operation: "combine_variants",
    entityKind: "node",
    opRef: producerOpRef(patch) ?? null,
    memberCount: members.length,
    members: memberSnapshots,
    affectedEntityIds: memberSnapshots.map((item) => item.id).filter((id): id is string => typeof id === "string"),
    parent: parentFact,
    index: patch.index ?? null,
    preflight: deferred ? "deferred_to_execution" : "complete",
  };
}

function validateLocalParentProducer(
  ref: EntityRefWire,
  producers: Map<string, { patchIndex: number; entityKind: EntityKind }>,
  patches: EntityPatchWire[],
  label: string,
): void {
  if (!ref.opRef) return;
  const producer = producers.get(ref.opRef);
  if (!producer) throw failure(ErrorCode.INVALID_PARAMS, `${label} references missing opRef producer "${ref.opRef}".`);
  const producerPatch = patchAt(patches, producer.patchIndex, "Local parent producer");
  if (producerPatch.entityKind !== "node") throw failure(ErrorCode.INVALID_PARAMS, `${label} opRef "${ref.opRef}" does not produce a node parent.`);
  if (producerPatch.kind === "create") {
    const entityType = producerPatch.entityType ?? "FRAME";
    if (!["FRAME", "SECTION", "COMPONENT"].includes(entityType)) {
      throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `${label} opRef "${ref.opRef}" produces ${entityType}, which is not a typed children parent.`);
    }
  }
}

function validateLocalExpectedType(ref: EntityRefWire, producerPatch: EntityPatchWire): void {
  if (!ref.expectedType || producerPatch.entityKind !== "node") return;
  const producedType = producerPatch.kind === "create"
    ? producerPatch.entityType ?? "FRAME"
    : producerPatch.kind === "component_command" && producerPatch.command === "create_slot"
      ? "SLOT"
      : producerPatch.kind === "component_command" && producerPatch.command === "combine_variants"
        ? "COMPONENT_SET"
        : undefined;
  if (!producedType) return;
  if (producedType !== ref.expectedType) throw failure(ErrorCode.STALE_TARGET, `Local opRef expected type "${ref.expectedType}" but producer declares "${producedType}".`);
}

async function preflightDeferredLocalTarget(
  patch: Exclude<EntityPatchWire, CreateEntityPatchWire>,
  producers: Map<string, { patchIndex: number; entityKind: EntityKind }>,
  patches: EntityPatchWire[],
  patchIndex: number,
): Promise<void> {
  if (patch.kind === "update") {
    if (patch.unset?.length) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unset is not supported for typed property groups yet (${patch.unset.join(", ")}).`, "Send an explicit stable default value instead of relying on an implicit reset.");
    validateDeferredPropertyShape(patch.set ?? {});
    return;
  }
  if (patch.kind === "move" || patch.kind === "clone") {
    const parent = patch.parent;
    if (parent?.opRef) validateLocalParentProducer(parent, producers, patches, `patches[${patchIndex}].parent`);
    else if (parent) {
      const resolvedParent = await resolveEntity(parent, "node");
      if (!isChildrenParent(resolvedParent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `${patch.kind} parent does not accept children.`);
    }
    return;
  }
  if (patch.kind === "delete") {
    if (patch.allowDelete !== true) throw failure(ErrorCode.INVALID_PARAMS, "delete requires allowDelete: true on the patch or request.");
    return;
  }
  validateDeferredCommandShape(patch.kind, patch.command, patch.payload ?? {});
}

function validateDeferredPropertyShape(properties: Record<string, JsonValue>): void {
  for (const key of Object.keys(properties)) {
    if (key === "collectionId" || key === "resolvedType" || ["id", "key", "type", "parent", "children", "remote", "absoluteBoundingBox", "componentPropertyDefinitions"].includes(key)) {
      throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Property "${key}" is immutable or provider-owned.`);
    }
    if (key === "reactions" && !Array.isArray(properties[key])) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "reactions requires an array value.");
    if (key === "boundVariable" && !isRecord(properties[key])) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "boundVariable requires a binding object.");
  }
}

function validateDeferredCommandShape(kind: string, command: string | undefined, payload: Record<string, JsonValue>): void {
  if (kind === "set_reactions") {
    if (!Array.isArray(payload.reactions)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_reactions requires reactions array.");
    return;
  }
  if (kind === "component_command" && command === "set_properties") {
    if (!isRecord(payload.properties)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_properties requires a properties object.");
    return;
  }
  if (kind === "component_command") {
    validateComponentCommandPayload(command, payload);
    return;
  }
  if (kind === "style_command" && command === "rename") {
    if (typeof payload.name !== "string") throw failure(ErrorCode.INVALID_PARAMS, "style rename requires a name.");
    return;
  }
  if (kind === "variable_command") {
    validateDeferredVariableCommand(command, payload);
    return;
  }
  if (kind === "layout_command") {
    validateDeferredLayoutCommand(command, payload);
    return;
  }
  if (kind === "motion_command" && command === "set_tracks") {
    motionTrackInputs(payload);
    return;
  }
  if (kind === "set_bindings") {
    if (!isRecord(payload.binding)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "set_bindings requires a binding object.");
    return;
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed command "${kind}:${command ?? "unknown"}".`);
}

function validateDeferredLayoutCommand(command: string | undefined, payload: Record<string, JsonValue>): void {
  if (command === "configure_grid") {
    const allowed = new Set(["rowCount", "columnCount", "rowGap", "columnGap", "gridAutoTracks", "gridItemsPositioning"]);
    for (const key of Object.keys(payload)) if (!allowed.has(key)) throw failure(ErrorCode.INVALID_PARAMS, `configure_grid does not support payload.${key}.`);
    if (Object.keys(payload).length === 0) throw failure(ErrorCode.INVALID_PARAMS, "configure_grid requires at least one Grid property.");
    return;
  }
  if (command === "place_grid_child") {
    if (!Number.isInteger(payload.rowIndex) || !Number.isInteger(payload.columnIndex)) throw failure(ErrorCode.INVALID_PARAMS, "place_grid_child requires integer rowIndex and columnIndex.");
    return;
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed layout command "${command ?? "unknown"}".`);
}

function validateCreateShape(patch: CreateEntityPatchWire): void {
  if (patch.entityKind === "node" && !["FRAME", "SECTION", "RECTANGLE", "ELLIPSE", "LINE", "POLYGON", "STAR", "TEXT", "COMPONENT", "SLICE", "BOOLEAN_OPERATION"].includes(patch.entityType ?? "FRAME")) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Typed create does not support node type "${patch.entityType}" yet.`);
  if (patch.entityKind === "style" && !["PAINT", "TEXT", "EFFECT", "GRID"].includes(stringProperty(patch.properties, "styleType", "PAINT"))) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported styleType "${stringProperty(patch.properties, "styleType", "PAINT")}".`);
  if (patch.entityKind === "variable") {
    const collectionId = stringProperty(patch.properties, "collectionId", "");
    if (!patch.collection && !collectionId) throw failure(ErrorCode.INVALID_PARAMS, "Variable create requires collection or properties.collectionId.");
    const allowed = new Set(["name", "collectionId", "resolvedType", "description", "hiddenFromPublishing", "scopes"]);
    for (const key of Object.keys(patch.properties ?? {})) if (!allowed.has(key)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Variable create property "${key}" is not typed in this checkpoint.`);
  }
  if (patch.entityKind === "variable_collection") {
    const allowed = new Set(["name", "hiddenFromPublishing"]);
    for (const key of Object.keys(patch.properties ?? {})) if (!allowed.has(key)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Variable collection create property "${key}" is not typed in this checkpoint.`);
  }
}

async function preflightMutation(patch: Exclude<EntityPatchWire, CreateEntityPatchWire>, target: BaseNode | BaseStyle | Variable | VariableCollection, allowLocalParent = false): Promise<void> {
  if (patch.kind === "update") {
    if (patch.unset?.length) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unset is not supported for typed property groups yet (${patch.unset.join(", ")}).`, "Send an explicit stable default value instead of relying on an implicit reset.");
    validatePropertyShape(target, patch.set ?? {});
    return;
  }
  if (patch.kind === "move") {
    if (!isSceneNode(target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "move requires a scene node target.");
    if (patch.parent.opRef && allowLocalParent) return;
    const parent = await resolveEntity(patch.parent, "node");
    if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "move parent does not accept children.");
    return;
  }
  if (patch.kind === "clone") {
    if (!isSceneNode(target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "clone requires a scene node target.");
    if (patch.parent) {
      if (patch.parent.opRef && allowLocalParent) return;
      const parent = await resolveEntity(patch.parent, "node");
      if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "clone parent does not accept children.");
    }
    return;
  }
  if (patch.kind === "delete") {
    if (patch.allowDelete !== true) throw failure(ErrorCode.INVALID_PARAMS, "delete requires allowDelete: true on the patch or request.");
    return;
  }
  if (patch.kind === "variable_command") {
    await preflightVariableCommand(target, patch);
    return;
  }
  if (patch.kind === "set_bindings") {
    await preflightBinding(target, patch);
    return;
  }
  if (patch.kind === "layout_command") {
    preflightLayoutCommand(target, patch.command, patch.payload ?? {});
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
  if (kind === "component_command") {
    validateComponentCommandTarget(target, command, payload);
    return;
  }
  if (kind === "style_command" && command === "rename") {
    if (typeof payload.name !== "string" || !("name" in dynamic)) throw failure(ErrorCode.INVALID_PARAMS, "style rename requires a name.");
    return;
  }
  if (kind === "motion_command") {
    if (command !== "set_tracks" || typeof dynamic.applyManualKeyframeTrack !== "function") throw failure(ErrorCode.FEATURE_GATED, "Motion command is unavailable on this editor/runtime or command shape.");
    motionTrackInputs(payload);
    return;
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed command "${kind}:${command ?? "unknown"}".`);
}

const COMPONENT_PROPERTY_TYPES = ["BOOLEAN", "TEXT", "INSTANCE_SWAP", "VARIANT", "SLOT"] as const;
type ComponentPropertyTypeName = (typeof COMPONENT_PROPERTY_TYPES)[number];
const MAX_COMPONENT_PREFERRED_VALUES = 128;

function validateComponentCommandPayload(command: string | undefined, payload: Record<string, JsonValue>): void {
  if (command === "add_property") {
    if (typeof payload.name !== "string" || payload.name.length === 0) throw failure(ErrorCode.INVALID_PARAMS, "component add_property requires a non-empty name.");
    const propertyType = componentPropertyType(payload.propertyType);
    if (propertyType === "SLOT") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "Typed add_property does not create SLOT properties directly.", "Use component_command:create_slot so the semantic property and native SlotNode are created together.");
    validateComponentDefaultValue(propertyType, payload.defaultValue, "component add_property defaultValue");
    if (payload.preferredValues !== undefined) {
      if (propertyType !== "INSTANCE_SWAP") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "preferredValues are only supported for INSTANCE_SWAP in add_property; Slot preferred values belong to create_slot.");
      validatePreferredValues(payload.preferredValues);
    }
    return;
  }
  if (command === "edit_property") {
    if (typeof payload.propertyKey !== "string" || payload.propertyKey.length === 0 || !isRecord(payload.changes)) throw failure(ErrorCode.INVALID_PARAMS, "component edit_property requires propertyKey and changes object.");
    validateComponentPropertyChanges(payload.changes);
    return;
  }
  if (command === "delete_property") {
    if (typeof payload.propertyKey !== "string" || payload.propertyKey.length === 0) throw failure(ErrorCode.INVALID_PARAMS, "component delete_property requires propertyKey.");
    return;
  }
  if (command === "create_slot") {
    if (payload.name !== undefined && (typeof payload.name !== "string" || payload.name.length === 0)) throw failure(ErrorCode.INVALID_PARAMS, "component create_slot name must be a non-empty string when provided.");
    if (payload.description !== undefined && typeof payload.description !== "string") throw failure(ErrorCode.INVALID_PARAMS, "component create_slot description must be a string when provided.");
    if (payload.preferredValues !== undefined) validatePreferredValues(payload.preferredValues);
    if (payload.slotSettings !== undefined) validateSlotSettings(payload.slotSettings);
    return;
  }
  if (command === "reset_slot") {
    if (Object.keys(payload).length > 0) throw failure(ErrorCode.INVALID_PARAMS, "component reset_slot does not accept payload fields.");
    return;
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed component command "${command ?? "unknown"}".`);
}

function validateComponentCommandTarget(target: BaseNode | BaseStyle | Variable | VariableCollection, command: string | undefined, payload: Record<string, JsonValue>): void {
  validateComponentCommandPayload(command, payload);
  const dynamic = target as unknown as Record<string, unknown>;
  if (command === "add_property" || command === "edit_property" || command === "delete_property") {
    if (!isSceneNode(target) || (target.type !== "COMPONENT" && target.type !== "COMPONENT_SET")) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `${command} requires a local COMPONENT or COMPONENT_SET target.`);
    const method = command === "add_property" ? "addComponentProperty" : command === "edit_property" ? "editComponentProperty" : "deleteComponentProperty";
    if (typeof dynamic[method] !== "function") throw failure(ErrorCode.FEATURE_GATED, `Figma runtime does not expose ${method} on this component target.`);
    if (command === "edit_property" || command === "delete_property") validateExistingComponentProperty(target, command, payload);
    return;
  }
  if (command === "create_slot") {
    if (!isSceneNode(target) || target.type !== "COMPONENT" || typeof dynamic.createSlot !== "function" || typeof dynamic.editComponentProperty !== "function") {
      throw failure(ErrorCode.FEATURE_GATED, "create_slot requires a local COMPONENT with native createSlot/editComponentProperty support.");
    }
    return;
  }
  if (command === "reset_slot") {
    if (!isSceneNode(target) || target.type !== "SLOT" || typeof dynamic.resetSlot !== "function") throw failure(ErrorCode.FEATURE_GATED, "reset_slot requires a native SLOT target with resetSlot support.");
    return;
  }
}

function validateExistingComponentProperty(target: BaseNode | BaseStyle | Variable | VariableCollection, command: "edit_property" | "delete_property", payload: Record<string, JsonValue>): void {
  const propertyKey = String(payload.propertyKey);
  const definitions = (target as unknown as { componentPropertyDefinitions?: Record<string, { type?: string }> }).componentPropertyDefinitions ?? {};
  const definition = definitions[propertyKey];
  if (!definition) throw failure(ErrorCode.TARGET_NOT_FOUND, `Component property "${propertyKey}" was not found on the target.`);
  const propertyType = componentPropertyType(definition.type);
  if (command === "delete_property" && propertyType === "VARIANT") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "Figma deleteComponentProperty does not support VARIANT properties.");
  if (command === "edit_property") validateComponentPropertyChanges(payload.changes, propertyType);
}

function componentPropertyType(value: unknown): ComponentPropertyTypeName {
  if (typeof value !== "string" || !(COMPONENT_PROPERTY_TYPES as readonly string[]).includes(value)) throw failure(ErrorCode.INVALID_PARAMS, `component propertyType must be one of ${COMPONENT_PROPERTY_TYPES.join(", ")}.`);
  return value as ComponentPropertyTypeName;
}

function validateComponentDefaultValue(propertyType: ComponentPropertyTypeName, value: unknown, label: string): void {
  if (propertyType === "BOOLEAN") {
    if (typeof value !== "boolean" && !isVariableAliasLike(value)) throw failure(ErrorCode.INVALID_PARAMS, `${label} must be boolean or VARIABLE_ALIAS for BOOLEAN.`);
    return;
  }
  if (propertyType === "TEXT" || propertyType === "INSTANCE_SWAP" || propertyType === "VARIANT") {
    if (typeof value !== "string" && !(propertyType !== "VARIANT" && isVariableAliasLike(value))) throw failure(ErrorCode.INVALID_PARAMS, `${label} must be ${propertyType === "VARIANT" ? "string" : "string or VARIABLE_ALIAS"} for ${propertyType}.`);
    return;
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `${label} is not valid for SLOT; use create_slot.`);
}

function isVariableAliasLike(value: unknown): boolean {
  return isRecord(value) && value.type === "VARIABLE_ALIAS" && typeof value.id === "string" && value.id.length > 0;
}

function validatePreferredValues(value: unknown): void {
  if (!Array.isArray(value) || value.length > MAX_COMPONENT_PREFERRED_VALUES) throw failure(ErrorCode.INVALID_PARAMS, `preferredValues must be an array with at most ${MAX_COMPONENT_PREFERRED_VALUES} entries.`);
  for (const [index, item] of value.entries()) {
    if (!isRecord(item) || typeof item.type !== "string" || typeof item.key !== "string" || item.key.length === 0) throw failure(ErrorCode.INVALID_PARAMS, `preferredValues[${index}] requires type and key strings.`);
  }
}

function validateSlotSettings(value: unknown): void {
  if (!isRecord(value)) throw failure(ErrorCode.INVALID_PARAMS, "slotSettings must be an object.");
  const allowed = new Set(["stretchChildOnInsert", "displayEmptyByDefault", "minChildren", "maxChildren", "allowPreferredValuesOnly"]);
  for (const [key, item] of Object.entries(value)) {
    if (!allowed.has(key)) throw failure(ErrorCode.INVALID_PARAMS, `slotSettings.${key} is not supported.`);
    if (key === "minChildren" || key === "maxChildren") {
      if (item !== null && (typeof item !== "number" || !Number.isInteger(item) || item < 0)) throw failure(ErrorCode.INVALID_PARAMS, `slotSettings.${key} must be a non-negative integer or null.`);
    } else if (typeof item !== "boolean") {
      throw failure(ErrorCode.INVALID_PARAMS, `slotSettings.${key} must be boolean.`);
    }
  }
  const min = value.minChildren;
  const max = value.maxChildren;
  if (typeof min === "number" && typeof max === "number" && min > max) throw failure(ErrorCode.INVALID_PARAMS, "slotSettings.minChildren must be less than or equal to maxChildren.");
}

function validateComponentPropertyChanges(value: unknown, propertyType?: ComponentPropertyTypeName): void {
  if (!isRecord(value) || Object.keys(value).length === 0) throw failure(ErrorCode.INVALID_PARAMS, "component edit_property changes must be a non-empty object.");
  const allowed = new Set(["name", "defaultValue", "preferredValues", "description", "slotSettings"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw failure(ErrorCode.INVALID_PARAMS, `component edit_property changes.${key} is not supported.`);
  if (value.name !== undefined && (typeof value.name !== "string" || value.name.length === 0)) throw failure(ErrorCode.INVALID_PARAMS, "component edit_property changes.name must be a non-empty string.");
  if (value.preferredValues !== undefined) validatePreferredValues(value.preferredValues);
  if (value.description !== undefined && typeof value.description !== "string") throw failure(ErrorCode.INVALID_PARAMS, "component edit_property changes.description must be a string.");
  if (value.slotSettings !== undefined) validateSlotSettings(value.slotSettings);
  if (!propertyType) return;
  if (value.defaultValue !== undefined) {
    if (propertyType === "VARIANT" || propertyType === "SLOT") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `defaultValue cannot be edited for ${propertyType} component properties.`);
    validateComponentDefaultValue(propertyType, value.defaultValue, "component edit_property defaultValue");
  }
  if (value.preferredValues !== undefined && propertyType !== "INSTANCE_SWAP" && propertyType !== "SLOT") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `preferredValues are not supported for ${propertyType} component properties.`);
  if ((value.description !== undefined || value.slotSettings !== undefined) && propertyType !== "SLOT") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `description and slotSettings are only supported for SLOT component properties.`);
}

const MAX_MOTION_TRACKS_PER_COMMAND = 64;
const MAX_MOTION_KEYFRAMES_PER_TRACK = 256;

function motionTrackInputs(payload: Record<string, JsonValue>): Array<{ field: KeyframeField; track: ManualKeyframeTrackInput }> {
  if (!Array.isArray(payload.tracks) || payload.tracks.length < 1 || payload.tracks.length > MAX_MOTION_TRACKS_PER_COMMAND) {
    throw failure(ErrorCode.INVALID_PARAMS, `motion set_tracks requires 1-${MAX_MOTION_TRACKS_PER_COMMAND} {field, track} entries.`);
  }
  return payload.tracks.map((raw, index) => {
    if (!isRecord(raw) || !isRecord(raw.field) || !isRecord(raw.track)) throw failure(ErrorCode.INVALID_PARAMS, `motion track ${index} requires field and track objects.`);
    const field = raw.field;
    if (field.type === "PROPERTY") {
      if (typeof field.name !== "string" || field.name.length === 0) throw failure(ErrorCode.INVALID_PARAMS, `motion track ${index} PROPERTY field requires name.`);
    } else if (field.type === "INDEXED_ITEM") {
      if (!(["fills", "strokes", "effects"] as const).includes(field.collection as "fills" | "strokes" | "effects") || typeof field.index !== "number" || !Number.isInteger(field.index) || field.index < 0) {
        throw failure(ErrorCode.INVALID_PARAMS, `motion track ${index} INDEXED_ITEM requires fills/strokes/effects collection and a non-negative integer index.`);
      }
      if (field.propertyId !== undefined && typeof field.propertyId !== "string") throw failure(ErrorCode.INVALID_PARAMS, `motion track ${index} propertyId must be a string when provided.`);
      if (field.field !== undefined && typeof field.field !== "string") throw failure(ErrorCode.INVALID_PARAMS, `motion track ${index} effect field must be a string when provided.`);
    } else {
      throw failure(ErrorCode.INVALID_PARAMS, `motion track ${index} field.type must be PROPERTY or INDEXED_ITEM.`);
    }
    const track = raw.track;
    if (!Array.isArray(track.keyframes) || track.keyframes.length < 1 || track.keyframes.length > MAX_MOTION_KEYFRAMES_PER_TRACK) {
      throw failure(ErrorCode.INVALID_PARAMS, `motion track ${index} requires 1-${MAX_MOTION_KEYFRAMES_PER_TRACK} keyframes.`);
    }
    for (const [keyframeIndex, keyframe] of track.keyframes.entries()) {
      if (!isRecord(keyframe) || typeof keyframe.timelinePosition !== "number" || !Number.isFinite(keyframe.timelinePosition) || keyframe.timelinePosition < 0 || !isRecord(keyframe.value)) {
        throw failure(ErrorCode.INVALID_PARAMS, `motion track ${index} keyframe ${keyframeIndex} requires non-negative timelinePosition and a value object.`);
      }
    }
    return { field: field as unknown as KeyframeField, track: track as unknown as ManualKeyframeTrackInput };
  });
}

function normalizePatches(patches: EntityPatchWire[], before: Array<Record<string, unknown>>): EntityPatchWire[] {
  return patches.map((patch, index) => {
    if (patch.kind === "create" || !patch.target || patch.target.opRef) return patch;
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
  if (patch.kind === "component_command") {
    if (patch.command === "set_properties") return ["componentProperties"];
    if (patch.command === "reset_slot") return ["slotChildCount", "slotChildIds"];
    if (patch.command === "combine_variants") return ["parentId", "index", "componentPropertyDefinitions"];
    return ["componentPropertyDefinitions"];
  }
  if (patch.kind === "style_command") return ["name"];
  if (patch.kind === "variable_command") return ["values"];
  if (patch.kind === "layout_command") return patch.command === "configure_grid"
    ? ["layoutMode", "gridRowCount", "gridColumnCount", "gridRowGap", "gridColumnGap", "gridAutoTracks", "gridItemsPositioning"]
    : ["gridRowAnchorIndex", "gridColumnAnchorIndex", "gridRowSpan", "gridColumnSpan", "gridChildHorizontalAlign", "gridChildVerticalAlign"];
  if (patch.kind === "motion_command") return ["motion"];
  return [patch.kind];
}

function canRebaseNonOverlapping(patches: EntityPatchWire[], before: Array<Record<string, unknown>>): boolean {
  for (const [index, patch] of patches.entries()) {
    if (isCombineVariantsPatch(patch) || patch.kind === "layout_command") return false;
    if (patch.kind === "create" || !patch.target || patch.target.opRef) continue;
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
  if (isCombineVariantsPatch(patch)) return executeCombineVariants(patch, traceId);
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
    assignFreshControlId(clone, "node", patch.controlId, traceId);
    return entitySummary(clone, "node");
  }
  if (patch.kind === "delete") {
    if (patch.allowDelete !== true) throw failure(ErrorCode.INVALID_PARAMS, "delete requires allowDelete: true on the patch or request.");
    if (!isRemovable(target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "The target cannot be removed through typed CRUD.");
    const id = target.id;
    target.remove();
    return { id, deleted: true, entityKind: patch.entityKind };
  }
  if (patch.kind === "variable_command") return executeVariableCommand(target, patch);
  if (patch.kind === "set_bindings") return executeBinding(target, patch);
  if (patch.kind === "layout_command") return executeLayoutCommand(target, patch.command, patch.payload ?? {});
  return executeCommand(target, patch.kind, patch.command, patch.payload ?? {}, traceId);
}

function producerOpRef(patch: EntityPatchWire): string | undefined {
  if ((patch.kind === "create" || patch.kind === "clone" || (patch.kind === "component_command" && (patch.command === "create_slot" || patch.command === "combine_variants"))) && typeof patch.opRef === "string") return patch.opRef;
  return undefined;
}

function materializeLocalPatchRefs(
  patch: EntityPatchWire,
  bindings: Map<string, { entityKind: EntityKind; ref: EntityRefWire }>,
): EntityPatchWire {
  const next = { ...patch } as EntityPatchWire;
  if ("target" in next && next.target?.opRef) {
    (next as Exclude<EntityPatchWire, CreateEntityPatchWire>).target = materializeEntityRef(next.target, patch.entityKind, bindings);
  }
  if ("collection" in next && next.collection?.opRef) {
    next.collection = materializeEntityRef(next.collection, "variable_collection", bindings);
  }
  if ("alias" in next && next.alias?.opRef) {
    next.alias = materializeEntityRef(next.alias, "variable", bindings);
  }
  if ("variable" in next && next.variable?.opRef) {
    next.variable = materializeEntityRef(next.variable, "variable", bindings);
  }
  if ("members" in next && Array.isArray(next.members)) {
    next.members = next.members.map((member) => member.opRef ? materializeEntityRef(member, "node", bindings) : member);
  }
  if ("parent" in next && next.parent?.opRef) {
    next.parent = materializeEntityRef(next.parent, "node", bindings);
  }
  return next;
}

function materializeEntityRef(
  ref: EntityRefWire,
  expectedKind: EntityKind,
  bindings: Map<string, { entityKind: EntityKind; ref: EntityRefWire }>,
): EntityRefWire {
  if (!ref.opRef) return ref;
  const binding = bindings.get(ref.opRef);
  if (!binding) throw failure(ErrorCode.INTERNAL, `Transaction-local opRef "${ref.opRef}" was not bound before execution.`);
  if (binding.entityKind !== expectedKind) throw failure(ErrorCode.INTERNAL, `Transaction-local opRef "${ref.opRef}" resolved as ${binding.entityKind}, expected ${expectedKind}.`);
  return { ...binding.ref, ...(ref.expectedType ? { expectedType: ref.expectedType } : {}) };
}

function concreteEntityRef(entityKind: EntityKind, summary: Record<string, unknown>): EntityRefWire {
  const id = summary.id;
  if (typeof id !== "string" || id.length === 0) throw failure(ErrorCode.INTERNAL, `Producer result for ${entityKind} did not expose a persistent id.`);
  if (entityKind === "node") return { nodeId: id };
  if (entityKind === "style") return { styleId: id };
  if (entityKind === "variable") return { variableId: id };
  return { collectionId: id };
}

async function findSurvivingProducedEntities(
  patches: EntityPatchWire[],
  appliedByIndex: Array<Record<string, unknown> | undefined>,
): Promise<Array<Record<string, unknown>>> {
  const survivors: Array<Record<string, unknown>> = [];
  for (const [patchIndex, patch] of patches.entries()) {
    const opRef = producerOpRef(patch);
    if (!opRef) continue;
    const applied = appliedByIndex[patchIndex];
    const id = applied?.id;
    if (typeof id !== "string" || id.length === 0) continue;
    if (await entityExistsById(patch.entityKind, id)) {
      survivors.push({ patchIndex, entityKind: patch.entityKind, id, opRef });
    }
  }
  return survivors;
}

async function entityExistsById(entityKind: EntityKind, id: string): Promise<boolean> {
  if (entityKind === "node") return Boolean(await figma.getNodeByIdAsync(id));
  if (entityKind === "style") {
    const styles = [
      ...(await figma.getLocalPaintStylesAsync()),
      ...(await figma.getLocalTextStylesAsync()),
      ...(await figma.getLocalEffectStylesAsync()),
      ...(await figma.getLocalGridStylesAsync()),
    ];
    return styles.some((style) => style.id === id);
  }
  if (entityKind === "variable") return Boolean(await figma.variables.getVariableByIdAsync(id));
  return Boolean(await figma.variables.getVariableCollectionByIdAsync(id));
}

function rollbackFailureMessage(fingerprintMatches: boolean, survivors: Array<Record<string, unknown>>): string {
  const parts: string[] = [];
  if (!fingerprintMatches) parts.push("Undo completed but rollback fingerprint does not match the pre-transaction snapshot.");
  if (survivors.length) parts.push(`Undo completed but produced entities remain after rollback: ${survivors.map((item) => `${String(item.entityKind)}:${String(item.id)}`).join(", ")}.`);
  return parts.join(" ") || "Rollback could not be verified.";
}

async function createEntity(patch: CreateEntityPatchWire, traceId?: string): Promise<Record<string, unknown>> {
  if (patch.entityKind === "node") {
    const node = createNode(patch.entityType ?? "FRAME");
    const parent = patch.parent ? await resolveEntity(patch.parent, "node") : figma.currentPage;
    if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "create parent does not accept children.");
    parent.appendChild(node);
    if (patch.index !== undefined && patch.index < parent.children.length) parent.insertChild(patch.index, node);
    assignFreshControlId(node, "node", patch.controlId, traceId);
    await applyProperties(node, patch.properties ?? {});
    return entitySummary(node, "node");
  }
  if (patch.entityKind === "style") return createStyle(patch);
  if (patch.entityKind === "variable_collection") {
    const name = stringProperty(patch.properties, "name", "Untitled collection");
    const collection = figma.variables.createVariableCollection(name);
    const mutable = mutableCreateProperties(patch.properties, ["name"]);
    if (Object.keys(mutable).length) await applyProperties(collection, mutable);
    const controlId = ensureRegistryId(collection.id, patch.entityKind, patch.controlId);
    return { id: collection.id, key: collection.key, name: collection.name, controlId, defaultModeId: collection.defaultModeId, entityKind: patch.entityKind, created: true };
  }
  if (patch.entityKind === "variable") {
    const collection = patch.collection
      ? await resolveEntity(patch.collection, "variable_collection") as VariableCollection
      : await figma.variables.getVariableCollectionByIdAsync(stringProperty(patch.properties, "collectionId", ""));
    if (!collection) throw failure(ErrorCode.TARGET_NOT_FOUND, `Variable collection "${stringProperty(patch.properties, "collectionId", "")}" was not found.`);
    assertMutableTarget(collection);
    const variable = figma.variables.createVariable(stringProperty(patch.properties, "name", "Untitled variable"), collection, stringProperty(patch.properties, "resolvedType", "STRING") as VariableResolvedDataType);
    const mutable = mutableCreateProperties(patch.properties, ["name", "collectionId", "resolvedType"]);
    if (Object.keys(mutable).length) await applyProperties(variable, mutable);
    const controlId = ensureRegistryId(variable.id, patch.entityKind, patch.controlId);
    return { id: variable.id, key: variable.key, name: variable.name, controlId, resolvedType: variable.resolvedType, collectionId: variable.variableCollectionId, entityKind: patch.entityKind, created: true };
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
      await applyLegacyDirectBinding(target, value);
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

type GridContainerSpec = {
  rowCount?: number;
  columnCount?: number;
  rowGap?: number;
  columnGap?: number;
  gridAutoTracks?: "NONE" | "ROWS";
  gridItemsPositioning?: "MANUAL" | "ROW_AUTO_FLOW";
};

type GridChildSpec = {
  rowIndex: number;
  columnIndex: number;
  rowSpan?: number;
  columnSpan?: number;
  horizontalAlign?: "MIN" | "CENTER" | "MAX" | "AUTO";
  verticalAlign?: "MIN" | "CENTER" | "MAX" | "AUTO";
};

function gridContainerSpec(payload: Record<string, JsonValue>): GridContainerSpec {
  validateDeferredLayoutCommand("configure_grid", payload);
  return payload as unknown as GridContainerSpec;
}

function gridChildSpec(payload: Record<string, JsonValue>): GridChildSpec {
  validateDeferredLayoutCommand("place_grid_child", payload);
  return payload as unknown as GridChildSpec;
}

function preflightLayoutCommand(target: BaseNode | BaseStyle | Variable | VariableCollection, command: string | undefined, payload: Record<string, JsonValue>): void {
  if (!isSceneNode(target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "layout_command requires a scene node target.");
  const dynamic = target as unknown as Record<string, unknown>;
  if (command === "configure_grid") {
    const spec = gridContainerSpec(payload);
    for (const property of ["layoutMode", "gridRowCount", "gridColumnCount", "gridRowGap", "gridColumnGap", "gridAutoTracks", "gridItemsPositioning"]) if (!(property in dynamic)) throw failure(ErrorCode.FEATURE_GATED, `Target does not expose Grid Auto Layout property ${property}.`);
    if (spec.rowCount !== undefined && (spec.rowCount < 1 || spec.rowCount > 4096)) throw failure(ErrorCode.INVALID_PARAMS, "configure_grid rowCount must be 1-4096.");
    if (spec.columnCount !== undefined && (spec.columnCount < 1 || spec.columnCount > 4096)) throw failure(ErrorCode.INVALID_PARAMS, "configure_grid columnCount must be 1-4096.");
    return;
  }
  if (command === "place_grid_child") {
    const spec = gridChildSpec(payload);
    const parent = target.parent as unknown as Record<string, unknown> | null;
    if (!parent || parent.layoutMode !== "GRID") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "place_grid_child requires a direct child of a GRID parent.");
    if (parent.gridItemsPositioning === "ROW_AUTO_FLOW") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "Manual grid placement is unavailable while parent gridItemsPositioning=ROW_AUTO_FLOW.");
    if (typeof dynamic.setGridChildPosition !== "function") throw failure(ErrorCode.FEATURE_GATED, "Target does not expose setGridChildPosition in this runtime/editor.");
    const rowCount = typeof parent.gridRowCount === "number" ? parent.gridRowCount : 0;
    const columnCount = typeof parent.gridColumnCount === "number" ? parent.gridColumnCount : 0;
    const rowSpan = spec.rowSpan ?? 1;
    const columnSpan = spec.columnSpan ?? 1;
    if (spec.rowIndex >= rowCount || spec.columnIndex >= columnCount || spec.rowIndex + rowSpan > rowCount || spec.columnIndex + columnSpan > columnCount) throw failure(ErrorCode.INVALID_PARAMS, `Grid placement (${spec.rowIndex},${spec.columnIndex}) span ${rowSpan}x${columnSpan} exceeds parent ${rowCount}x${columnCount}.`);
    return;
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed layout command "${command ?? "unknown"}".`);
}

async function executeLayoutCommand(target: BaseNode | BaseStyle | Variable | VariableCollection, command: string | undefined, payload: Record<string, JsonValue>): Promise<Record<string, unknown>> {
  preflightLayoutCommand(target, command, payload);
  const dynamic = target as unknown as Record<string, unknown>;
  if (command === "configure_grid") {
    const spec = gridContainerSpec(payload);
    dynamic.layoutMode = "GRID";
    if (spec.rowCount !== undefined || spec.gridAutoTracks !== undefined) dynamic.gridAutoTracks = "NONE";
    if (spec.rowCount !== undefined) dynamic.gridRowCount = spec.rowCount;
    if (spec.columnCount !== undefined) dynamic.gridColumnCount = spec.columnCount;
    if (spec.rowGap !== undefined) dynamic.gridRowGap = spec.rowGap;
    if (spec.columnGap !== undefined) dynamic.gridColumnGap = spec.columnGap;
    if (spec.gridItemsPositioning !== undefined) dynamic.gridItemsPositioning = spec.gridItemsPositioning;
    if (spec.gridAutoTracks !== undefined) dynamic.gridAutoTracks = spec.gridAutoTracks;
    return entitySummary(target, "node");
  }
  const spec = gridChildSpec(payload);
  (dynamic.setGridChildPosition as (rowIndex: number, columnIndex: number) => void).call(target, spec.rowIndex, spec.columnIndex);
  if (spec.rowSpan !== undefined) dynamic.gridRowSpan = spec.rowSpan;
  if (spec.columnSpan !== undefined) dynamic.gridColumnSpan = spec.columnSpan;
  if (spec.horizontalAlign !== undefined) dynamic.gridChildHorizontalAlign = spec.horizontalAlign;
  if (spec.verticalAlign !== undefined) dynamic.gridChildVerticalAlign = spec.verticalAlign;
  return entitySummary(target, "node");
}

type ConsumerBindingSpec =
  | { kind: "node"; field: string; unbind: boolean }
  | { kind: "paint"; property: "fills" | "strokes"; index: number; field: "color"; unbind: boolean };

function consumerBindingSpec(payload: Record<string, JsonValue>): ConsumerBindingSpec {
  if (!isRecord(payload.binding)) throw failure(ErrorCode.INVALID_PARAMS, "set_bindings requires payload.binding.");
  const binding = payload.binding;
  const unbind = binding.unbind === true;
  if (binding.kind === "node") {
    if (typeof binding.field !== "string" || !binding.field) throw failure(ErrorCode.INVALID_PARAMS, "node binding requires field.");
    return { kind: "node", field: binding.field, unbind };
  }
  if (binding.kind === "paint") {
    if ((binding.property !== "fills" && binding.property !== "strokes") || typeof binding.index !== "number" || !Number.isInteger(binding.index) || binding.index < 0 || binding.index > 4095 || binding.field !== "color") {
      throw failure(ErrorCode.INVALID_PARAMS, "paint binding requires property=fills|strokes, index 0-4095, and field=color.");
    }
    return { kind: "paint", property: binding.property, index: binding.index, field: "color", unbind };
  }
  throw failure(ErrorCode.INVALID_PARAMS, "set_bindings binding kind must be node or paint.");
}

async function resolveBindingVariable(patch: SetBindings): Promise<Variable | null> {
  const spec = consumerBindingSpec(patch.payload ?? {});
  if (spec.unbind) return null;
  if (!patch.variable) throw failure(ErrorCode.INVALID_PARAMS, "set_bindings bind requires a modeled variable identity.");
  return await resolveEntity(patch.variable, "variable") as Variable;
}

async function preflightBinding(target: BaseNode | BaseStyle | Variable | VariableCollection, patch: SetBindings): Promise<void> {
  const spec = consumerBindingSpec(patch.payload ?? {});
  const variable = patch.variable?.opRef ? null : await resolveBindingVariable(patch);
  validateBindingTarget(target, spec, variable);
}

function validateBindingTarget(target: BaseNode | BaseStyle | Variable | VariableCollection, spec: ConsumerBindingSpec, variable: Variable | null): void {
  if (spec.kind === "node") {
    const dynamic = target as unknown as { setBoundVariable?: (field: string, variable: Variable | null) => void };
    if (typeof dynamic.setBoundVariable !== "function") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "Target does not support direct variable binding.");
    return;
  }
  const dynamic = target as unknown as Record<string, unknown>;
  const paints = dynamic[spec.property];
  if (!Array.isArray(paints)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Target does not expose a concrete ${spec.property} paint array.`);
  if (spec.index >= paints.length) throw failure(ErrorCode.TARGET_NOT_FOUND, `${spec.property}[${spec.index}] does not exist on the target.`);
  const paint = paints[spec.index] as { type?: unknown };
  if (!paint || paint.type !== "SOLID") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `${spec.property}[${spec.index}] must be a SOLID paint for typed variable binding.`);
  if (!figma.variables || typeof figma.variables.setBoundVariableForPaint !== "function") throw failure(ErrorCode.FEATURE_GATED, "Figma runtime does not expose setBoundVariableForPaint.");
  if (variable && variable.resolvedType !== "COLOR") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Paint color binding requires a COLOR variable, got ${variable.resolvedType}.`);
}

async function executeBinding(target: BaseNode | BaseStyle | Variable | VariableCollection, patch: SetBindings): Promise<Record<string, unknown>> {
  const spec = consumerBindingSpec(patch.payload ?? {});
  const variable = await resolveBindingVariable(patch);
  validateBindingTarget(target, spec, variable);
  if (spec.kind === "node") {
    const dynamic = target as unknown as { setBoundVariable: (field: string, variable: Variable | null) => void };
    dynamic.setBoundVariable(spec.field, variable);
  } else {
    const dynamic = target as unknown as Record<string, unknown>;
    const paints = [...(dynamic[spec.property] as unknown[])];
    paints[spec.index] = figma.variables.setBoundVariableForPaint(paints[spec.index] as SolidPaint, spec.field, variable);
    dynamic[spec.property] = paints;
  }
  return entitySummary(target, "node");
}

async function applyLegacyDirectBinding(target: BaseNode | BaseStyle | Variable | VariableCollection, value: JsonValue): Promise<void> {
  if (!isRecord(value)) throw failure(ErrorCode.INVALID_PARAMS, "boundVariable must contain field and variableId.");
  const field = typeof value.field === "string" ? value.field : "";
  const variableId = typeof value.variableId === "string" ? value.variableId : "";
  const variable = variableId ? await figma.variables.getVariableByIdAsync(variableId) : null;
  if (!variable || !field) throw failure(ErrorCode.TARGET_NOT_FOUND, "boundVariable requires an existing variableId and field.");
  const spec: ConsumerBindingSpec = { kind: "node", field, unbind: false };
  validateBindingTarget(target, spec, variable);
  const dynamic = target as unknown as { setBoundVariable: (field: string, variable: Variable | null) => void };
  dynamic.setBoundVariable(field, variable);
}

async function executeCombineVariants(
  patch: EntityPatchWire & { members?: EntityRefWire[]; parent?: EntityRefWire; index?: number },
  traceId?: string,
): Promise<Record<string, unknown>> {
  const combine = (figma as unknown as { combineAsVariants?: (nodes: ReadonlyArray<ComponentNode>, parent: BaseNode & ChildrenMixin, index?: number) => ComponentSetNode }).combineAsVariants;
  if (figma.editorType !== "figma" || typeof combine !== "function") throw failure(ErrorCode.FEATURE_GATED, "component combine_variants requires Figma Design with native combineAsVariants support.");
  const members: ComponentNode[] = [];
  const seenIds = new Set<string>();
  for (const [memberIndex, memberRef] of (patch.members ?? []).entries()) {
    const member = await resolveEntity(memberRef, "node");
    assertMutableTarget(member);
    if (!isSceneNode(member) || member.type !== "COMPONENT") throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `combine_variants members[${memberIndex}] must resolve to a COMPONENT.`);
    assertExpectedType(member, memberRef.expectedType);
    if (seenIds.has(member.id)) throw failure(ErrorCode.INVALID_PARAMS, `combine_variants members resolve to duplicate component id "${member.id}".`);
    seenIds.add(member.id);
    members.push(member);
  }
  const parent = patch.parent ? await resolveEntity(patch.parent, "node") : figma.currentPage;
  if (patch.parent) assertMutableTarget(parent);
  if (!isChildrenParent(parent)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "combine_variants parent does not accept children.");
  if (patch.index !== undefined && patch.index > parent.children.length) throw failure(ErrorCode.INVALID_PARAMS, "combine_variants index exceeds parent child count.");
  const parentPageId = owningPageId(parent) ?? (parent.type === "PAGE" ? parent.id : figma.currentPage.id);
  for (const member of members) {
    const memberPageId = owningPageId(member);
    if (memberPageId && memberPageId !== parentPageId) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "combine_variants members and parent must belong to the same page.");
  }
  const componentSet = patch.index === undefined ? combine.call(figma, members, parent) : combine.call(figma, members, parent, patch.index);
  assignFreshControlId(componentSet, "node", undefined, traceId);
  return { ...(await entitySummary(componentSet, "node")), componentSetMemberCount: componentSet.children.length };
}

function isCombineVariantsPatch(patch: EntityPatchWire): patch is EntityPatchWire & { members: EntityRefWire[]; parent?: EntityRefWire; index?: number } {
  return patch.kind === "component_command" && patch.command === "combine_variants" && Array.isArray((patch as { members?: unknown }).members);
}

function variantMemberSnapshot(member: ComponentNode): Record<string, unknown> {
  const parent = member.parent;
  const siblings = parent && "children" in parent ? parent.children : [];
  return {
    id: member.id,
    type: member.type,
    name: member.name,
    controlId: controlMetadata(member)?.controlId ?? null,
    parentId: parent?.id ?? null,
    index: siblings.indexOf(member),
    pageId: owningPageId(member),
  };
}

function owningPageId(node: BaseNode): string | null {
  let current: BaseNode | null = node;
  while (current) {
    if (current.type === "PAGE") return current.id;
    current = current.parent;
  }
  return null;
}

const CODE_SYNTAX_PLATFORMS = ["WEB", "ANDROID", "iOS"] as const;

function validateDeferredVariableCommand(command: string | undefined, payload: Record<string, JsonValue>): void {
  if (command === "add_mode") {
    if (typeof payload.name !== "string" || payload.name.length === 0) throw failure(ErrorCode.INVALID_PARAMS, "add_mode requires a non-empty name.");
    return;
  }
  if (command === "rename_mode" || command === "remove_mode") {
    validateVariableModeSelectorShape(payload);
    if (command === "rename_mode" && (typeof payload.name !== "string" || payload.name.length === 0)) throw failure(ErrorCode.INVALID_PARAMS, "rename_mode requires a non-empty name.");
    return;
  }
  if (command === "set_value") {
    validateVariableModeSelectorShape(payload);
    return;
  }
  if (command === "set_code_syntax") {
    if (!CODE_SYNTAX_PLATFORMS.includes(payload.platform as (typeof CODE_SYNTAX_PLATFORMS)[number]) || typeof payload.value !== "string") throw failure(ErrorCode.INVALID_PARAMS, "set_code_syntax requires platform WEB/ANDROID/iOS and a string value.");
    return;
  }
  if (command === "remove_code_syntax") {
    if (!CODE_SYNTAX_PLATFORMS.includes(payload.platform as (typeof CODE_SYNTAX_PLATFORMS)[number])) throw failure(ErrorCode.INVALID_PARAMS, "remove_code_syntax requires platform WEB/ANDROID/iOS.");
    return;
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed variable command "${command ?? "unknown"}".`);
}

function validateVariableModeSelectorShape(payload: Record<string, JsonValue>): void {
  const selectors = [typeof payload.modeId === "string" && payload.modeId.length > 0, typeof payload.modeName === "string" && payload.modeName.length > 0, payload.defaultMode === true].filter(Boolean).length;
  if (selectors !== 1) throw failure(ErrorCode.INVALID_PARAMS, "Variable command requires exactly one mode selector: modeId, modeName, or defaultMode=true.");
}

async function preflightVariableCommand(target: BaseNode | BaseStyle | Variable | VariableCollection, patch: VariableCommand): Promise<void> {
  assertMutableTarget(target);
  const payload = patch.payload ?? {};
  validateDeferredVariableCommand(patch.command, payload);
  if (patch.command === "add_mode" || patch.command === "rename_mode" || patch.command === "remove_mode") {
    if (!("variableIds" in target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `${patch.command} requires a variable collection target.`);
    if (patch.command !== "add_mode") resolveCollectionModeId(target as VariableCollection, payload);
    return;
  }
  if (!("setValueForMode" in target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `${patch.command ?? "variable command"} requires a variable target.`);
  const variable = target as Variable;
  if (patch.command === "set_value") {
    await resolveVariableModeId(variable, payload);
    if (patch.alias && !patch.alias.opRef) {
      const aliasVariable = await resolveEntity(patch.alias, "variable") as Variable;
      if (aliasVariable.resolvedType !== variable.resolvedType) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Alias variable type ${aliasVariable.resolvedType} does not match target type ${variable.resolvedType}.`);
    }
    return;
  }
  const dynamic = variable as unknown as Record<string, unknown>;
  if (patch.command === "set_code_syntax" && typeof dynamic.setVariableCodeSyntax !== "function") throw failure(ErrorCode.FEATURE_GATED, "Variable code syntax mutation is unavailable in this runtime.");
  if (patch.command === "remove_code_syntax" && typeof dynamic.removeVariableCodeSyntax !== "function") throw failure(ErrorCode.FEATURE_GATED, "Variable code syntax removal is unavailable in this runtime.");
}

async function executeVariableCommand(target: BaseNode | BaseStyle | Variable | VariableCollection, patch: VariableCommand): Promise<Record<string, unknown>> {
  assertMutableTarget(target);
  const payload = patch.payload ?? {};
  validateDeferredVariableCommand(patch.command, payload);
  if (patch.command === "add_mode") {
    if (!("variableIds" in target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "add_mode requires a variable collection target.");
    const collection = target as VariableCollection;
    const modeId = collection.addMode(payload.name as string);
    return { ...(await entitySummary(collection, "variable_collection")), modeId, modeName: payload.name };
  }
  if (patch.command === "rename_mode") {
    if (!("variableIds" in target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "rename_mode requires a variable collection target.");
    const collection = target as VariableCollection;
    const modeId = resolveCollectionModeId(collection, payload);
    collection.renameMode(modeId, payload.name as string);
    return { ...(await entitySummary(collection, "variable_collection")), modeId, modeName: payload.name };
  }
  if (patch.command === "remove_mode") {
    if (!("variableIds" in target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, "remove_mode requires a variable collection target.");
    const collection = target as VariableCollection;
    const modeId = resolveCollectionModeId(collection, payload);
    const prior = collection.modes.find((mode) => mode.modeId === modeId)?.name ?? null;
    collection.removeMode(modeId);
    return { ...(await entitySummary(collection, "variable_collection")), modeId, modeName: prior, removedMode: true };
  }
  if (!("setValueForMode" in target)) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `${patch.command ?? "variable command"} requires a variable target.`);
  const variable = target as Variable;
  if (patch.command === "set_value") {
    const modeId = await resolveVariableModeId(variable, payload);
    let value = payload.value as unknown as VariableValue;
    let aliasedVariableId: string | undefined;
    if (patch.alias) {
      const aliasVariable = await resolveEntity(patch.alias, "variable") as Variable;
      if (aliasVariable.resolvedType !== variable.resolvedType) throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Alias variable type ${aliasVariable.resolvedType} does not match target type ${variable.resolvedType}.`);
      if (typeof figma.variables.createVariableAlias !== "function") throw failure(ErrorCode.FEATURE_GATED, "Variable alias creation is unavailable in this runtime.");
      value = figma.variables.createVariableAlias(aliasVariable);
      aliasedVariableId = aliasVariable.id;
    }
    variable.setValueForMode(modeId, value);
    const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
    return { ...(await entitySummary(variable, "variable")), modeId, modeName: collection?.modes.find((mode) => mode.modeId === modeId)?.name ?? null, ...(aliasedVariableId ? { aliasedVariableId } : {}) };
  }
  if (patch.command === "set_code_syntax") {
    if (typeof variable.setVariableCodeSyntax !== "function") throw failure(ErrorCode.FEATURE_GATED, "Variable code syntax mutation is unavailable in this runtime.");
    variable.setVariableCodeSyntax(payload.platform as CodeSyntaxPlatform, payload.value as string);
    return { ...(await entitySummary(variable, "variable")), codeSyntaxPlatform: payload.platform };
  }
  if (patch.command === "remove_code_syntax") {
    if (typeof variable.removeVariableCodeSyntax !== "function") throw failure(ErrorCode.FEATURE_GATED, "Variable code syntax removal is unavailable in this runtime.");
    variable.removeVariableCodeSyntax(payload.platform as CodeSyntaxPlatform);
    return { ...(await entitySummary(variable, "variable")), codeSyntaxPlatform: payload.platform, codeSyntaxRemoved: true };
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed variable command "${patch.command ?? "unknown"}".`);
}

async function resolveVariableModeId(variable: Variable, payload: Record<string, JsonValue>): Promise<string> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(variable.variableCollectionId);
  if (!collection) throw failure(ErrorCode.TARGET_NOT_FOUND, `Variable collection "${variable.variableCollectionId}" was not found for variable "${variable.id}".`);
  return resolveCollectionModeId(collection, payload);
}

function resolveCollectionModeId(collection: VariableCollection, payload: Record<string, JsonValue>): string {
  validateVariableModeSelectorShape(payload);
  if (payload.defaultMode === true) return collection.defaultModeId;
  if (typeof payload.modeId === "string") {
    if (!collection.modes.some((mode) => mode.modeId === payload.modeId)) throw failure(ErrorCode.TARGET_NOT_FOUND, `Variable mode "${payload.modeId}" was not found in collection "${collection.id}".`);
    return payload.modeId;
  }
  const matches = collection.modes.filter((mode) => mode.name === payload.modeName);
  if (matches.length !== 1) throw failure(ErrorCode.TARGET_NOT_FOUND, `Variable mode name "${String(payload.modeName ?? "")}" resolved to ${matches.length} modes in collection "${collection.id}".`);
  return matches[0]!.modeId;
}

function mutableCreateProperties(properties: Record<string, JsonValue> | undefined, excluded: string[]): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(properties ?? {})) if (!excluded.includes(key)) output[key] = value;
  return output;
}

async function executeCommand(target: BaseNode | BaseStyle | Variable | VariableCollection, kind: string, command: string | undefined, payload: Record<string, JsonValue>, traceId?: string): Promise<Record<string, unknown>> {
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
  if (kind === "component_command") {
    validateComponentCommandTarget(target, command, payload);
    if (command === "add_property") {
      const component = target as ComponentNode | ComponentSetNode;
      const propertyType = componentPropertyType(payload.propertyType);
      const options = payload.preferredValues === undefined ? undefined : { preferredValues: payload.preferredValues as unknown as InstanceSwapPreferredValue[] };
      const propertyKey = component.addComponentProperty(payload.name as string, propertyType as ComponentPropertyType, payload.defaultValue as unknown as string | boolean | VariableAlias, options);
      return { ...(await entitySummary(target, "node")), componentPropertyKey: propertyKey, componentPropertyType: propertyType };
    }
    if (command === "edit_property") {
      const component = target as ComponentNode | ComponentSetNode;
      const propertyKey = payload.propertyKey as string;
      const definition = component.componentPropertyDefinitions[propertyKey];
      const propertyType = componentPropertyType(definition?.type);
      const nextPropertyKey = component.editComponentProperty(propertyKey, payload.changes as unknown as { name?: string; defaultValue?: string | boolean | VariableAlias; preferredValues?: InstanceSwapPreferredValue[]; description?: string; slotSettings?: SlotSettings });
      return { ...(await entitySummary(target, "node")), componentPropertyKey: nextPropertyKey, previousComponentPropertyKey: propertyKey, componentPropertyType: propertyType };
    }
    if (command === "delete_property") {
      const component = target as ComponentNode | ComponentSetNode;
      const propertyKey = payload.propertyKey as string;
      const propertyType = componentPropertyType(component.componentPropertyDefinitions[propertyKey]?.type);
      component.deleteComponentProperty(propertyKey);
      return { ...(await entitySummary(target, "node")), componentPropertyKey: propertyKey, componentPropertyType: propertyType, deletedComponentProperty: true };
    }
    if (command === "create_slot") {
      const component = target as ComponentNode;
      const beforeKeys = new Set(Object.keys(component.componentPropertyDefinitions));
      const slot = component.createSlot();
      const newSlotKeys = Object.entries(component.componentPropertyDefinitions)
        .filter(([propertyKey, definition]) => !beforeKeys.has(propertyKey) && definition.type === "SLOT")
        .map(([propertyKey]) => propertyKey);
      if (newSlotKeys.length !== 1) throw failure(ErrorCode.INTERNAL, `createSlot produced ${newSlotKeys.length} new SLOT properties; expected exactly one.`);
      let componentPropertyKey = newSlotKeys[0]!;
      const changes: Record<string, unknown> = {};
      if (typeof payload.name === "string") changes.name = payload.name;
      if (typeof payload.description === "string") changes.description = payload.description;
      if (Array.isArray(payload.preferredValues)) changes.preferredValues = payload.preferredValues;
      if (isRecord(payload.slotSettings)) changes.slotSettings = payload.slotSettings;
      if (Object.keys(changes).length) componentPropertyKey = component.editComponentProperty(componentPropertyKey, changes as { name?: string; preferredValues?: InstanceSwapPreferredValue[]; description?: string; slotSettings?: SlotSettings });
      if (typeof payload.name === "string") slot.name = payload.name;
      assignFreshControlId(slot, "node", undefined, traceId);
      return { ...(await entitySummary(slot, "node")), componentId: component.id, componentPropertyKey, componentPropertyType: "SLOT" };
    }
    if (command === "reset_slot") {
      const slot = target as SlotNode;
      slot.resetSlot();
      return { ...(await entitySummary(slot, "node")), slotReset: true };
    }
  }
  if (kind === "style_command" && command === "rename") {
    if (typeof payload.name !== "string" || !("name" in target)) throw failure(ErrorCode.INVALID_PARAMS, "style rename requires a name.");
    target.name = payload.name;
    return entitySummary(target, "style");
  }
  if (kind === "motion_command") {
    const dynamic = target as unknown as Record<string, unknown>;
    if (command !== "set_tracks" || typeof dynamic.applyManualKeyframeTrack !== "function") throw failure(ErrorCode.FEATURE_GATED, "Motion command is unavailable on this editor/runtime or command shape.");
    const applyTrack = dynamic.applyManualKeyframeTrack as (field: KeyframeField, track: ManualKeyframeTrackInput) => void;
    for (const item of motionTrackInputs(payload)) applyTrack.call(target, item.field, item.track);
    return entitySummary(target, "node");
  }
  throw failure(ErrorCode.UNSUPPORTED_PROPERTY, `Unsupported typed command "${kind}:${command ?? "unknown"}".`);
}

async function resolveEntity(ref: EntityRefWire, entityKind: EntityKind): Promise<BaseNode | BaseStyle | Variable | VariableCollection> {
  if (ref.opRef) throw failure(ErrorCode.INTERNAL, `Transaction-local opRef "${ref.opRef}" must be materialized before provider resolution.`);
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
function isChildrenParent(value: BaseNode | BaseStyle | Variable | VariableCollection): value is PageNode | FrameNode | SectionNode | ComponentNode | ComponentSetNode | InstanceNode | GroupNode | SlotNode { return "appendChild" in value && "children" in value; }
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
function changedProperties(patches: EntityPatchWire[]): string[] { return [...new Set(patches.flatMap((patch) => patch.kind === "update" ? Object.keys(patch.set ?? {}) : patch.kind === "set_reactions" ? ["reactions"] : patch.kind === "set_bindings" ? ["boundVariables"] : patch.kind === "layout_command" ? ["layout"] : [patch.kind]))]; }
function stringProperty(properties: Record<string, JsonValue> | undefined, key: string, fallback: string): string { const value = properties?.[key]; return typeof value === "string" ? value : fallback; }
function numberProperty(properties: Record<string, JsonValue>, key: string): number | undefined { const value = properties[key]; return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function safeJson(value: unknown): unknown { try { return value === undefined ? null : JSON.parse(JSON.stringify(value)); } catch { return null; } }
function parseOffset(cursor: unknown): number {
  if (typeof cursor !== "string") return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  return match ? Number(match[1]) : 0;
}
function failure(code: ErrorCode, message: string, hint?: string): PluginExecError { return new PluginExecError({ code, message, ...(hint ? { hint } : {}) }); }
