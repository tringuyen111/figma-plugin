import { afterEach, describe, expect, it, vi } from "vitest";
import { applyDocument, queryDocument } from "../../src/plugin/handlers/document-operations.js";
import { ErrorCode } from "../../src/shared/protocol.js";

afterEach(() => {
  delete (globalThis as Record<string, unknown>).figma;
});

describe("typed entity graph and CRUD", () => {
  it("round-trips create, read, update, non-overlap rebase, conflict, and delete guard", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;

    const create = await applyDocument({
      action: "apply_entity_patch",
      patches: [{ kind: "create", entityKind: "node", entityType: "FRAME", controlId: "sync-lab-root", properties: { name: "Control Sync Lab", width: 320, height: 180 } }],
      dryRun: true,
    }) as any;
    expect(create.dryRun).toBe(true);
    expect(create.plan.planHash).toMatch(/^fnv1a-/);
    expect(fixture.page.children).toHaveLength(0);

    const committed = await applyDocument({ action: "apply_entity_patch", patches: create.plan.patches, dryRun: false, confirm: true, expectedPlanHash: create.plan.planHash }) as any;
    expect(committed.state).toBe("COMMITTED");
    const controlId = committed.changedEntities[0].controlId;
    expect(controlId).toBe("sync-lab-root");

    const graph = await queryDocument({ kind: "entity_graph", scope: "page", limit: 200 }) as any;
    expect(graph.schemaVersion).toBe(2);
    expect(graph.coverage.truncated).toBe(false);
    expect(graph.facts.items).toEqual(expect.arrayContaining([expect.objectContaining({ controlId, name: "Control Sync Lab" })]));

    const update = await applyDocument({ action: "apply_entity_patch", patches: [{ kind: "update", entityKind: "node", target: { controlId }, set: { x: 24 } }], dryRun: true }) as any;
    const normalized = update.plan.patches;
    fixture.page.children[0].name = "Edited in Figma UI";
    const rebased = await applyDocument({ action: "apply_entity_patch", patches: normalized, dryRun: false, confirm: true, expectedPlanHash: update.plan.planHash, conflictPolicy: "merge_non_overlapping" }) as any;
    expect(rebased.state).toBe("COMMITTED");
    expect(rebased.rebasedFromPlanHash).toBe(update.plan.planHash);
    expect(fixture.page.children[0].name).toBe("Edited in Figma UI");
    expect(fixture.page.children[0].x).toBe(24);

    const conflictPlan = await applyDocument({ action: "apply_entity_patch", patches: [{ kind: "update", entityKind: "node", target: { controlId }, set: { x: 48 } }], dryRun: true }) as any;
    fixture.page.children[0].x = 49;
    await expect(applyDocument({ action: "apply_entity_patch", patches: conflictPlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: conflictPlan.plan.planHash, conflictPolicy: "merge_non_overlapping" })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.DRIFT_CONFLICT } });
    expect(fixture.page.children[0].x).toBe(49);

    await expect(applyDocument({ action: "apply_entity_patch", patches: [{ kind: "delete", entityKind: "node", target: { controlId } }], dryRun: true })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.INVALID_PARAMS } });
  });

  it("keeps full mutation results by default and emits compact opt-in receipts", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;

    const patches = [{ kind: "create", entityKind: "node", entityType: "FRAME", controlId: "receipt-root", properties: { name: "Receipt specimen", width: 320, height: 180 } }];
    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true }) as any;
    const full = await applyDocument({ action: "apply_entity_patch", patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash }) as any;
    expect(full.state).toBe("COMMITTED");
    expect(full.plan.before).toBeDefined();
    expect(full.before).toBeDefined();
    expect(full.after).toBeDefined();
    expect(full.resultMode).toBeUndefined();

    const updatePlan = await applyDocument({ action: "apply_entity_patch", patches: [{ kind: "update", entityKind: "node", target: { controlId: "receipt-root" }, set: { x: 24 } }], dryRun: true, resultMode: "receipt" }) as any;
    expect(updatePlan.plan.before).toBeDefined();
    const receipt = await applyDocument({ action: "apply_entity_patch", patches: updatePlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: updatePlan.plan.planHash, resultMode: "receipt" }) as any;

    expect(receipt).toMatchObject({
      dryRun: false,
      writePerformed: true,
      state: "COMMITTED",
      resultMode: "receipt",
      plan: expect.objectContaining({ planHash: updatePlan.plan.planHash, snapshotId: updatePlan.plan.snapshotId, operationCount: 1 }),
      changedEntities: [expect.objectContaining({ id: full.changedEntities[0].id, controlId: "receipt-root", entityKind: "node" })],
      rollbackState: "not_needed",
      undoCommitted: true,
    });
    expect(receipt.plan.before).toBeUndefined();
    expect(receipt.plan.patches).toBeUndefined();
    expect(receipt.before).toBeUndefined();
    expect(receipt.after).toBeUndefined();
    expect(receipt.beforeFingerprint).toMatch(/^fnv1a-/);
    expect(receipt.afterFingerprint).toMatch(/^fnv1a-/);
    expect(receipt.changedEntities[0].layoutMode).toBeUndefined();
    await expect(applyDocument({ action: "clear_file_owned_assets", dryRun: true, resultMode: "receipt" })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.INVALID_PARAMS } });
  });

  it("assigns clone identity through the sync owner without retaining the source controlId", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;

    const createPlan = await applyDocument({
      action: "apply_entity_patch",
      patches: [{ kind: "create", entityKind: "node", entityType: "FRAME", controlId: "clone-source", properties: { name: "Clone source" } }],
      dryRun: true,
    }) as any;
    await applyDocument({ action: "apply_entity_patch", patches: createPlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: createPlan.plan.planHash });

    const clonePlan = await applyDocument({
      action: "apply_entity_patch",
      patches: [{ kind: "clone", entityKind: "node", target: { controlId: "clone-source" }, controlId: "clone-source" }],
      dryRun: true,
    }) as any;
    const cloned = await applyDocument({ action: "apply_entity_patch", patches: clonePlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: clonePlan.plan.planHash }) as any;

    expect(cloned.changedEntities[0].controlId).not.toBe("clone-source");
    const clone = fixture.page.children.find((node: any) => node.id === cloned.changedEntities[0].id);
    expect(JSON.parse(clone.getSharedPluginData("figmaplugin", "control"))).toMatchObject({
      controlId: cloned.changedEntities[0].controlId,
      entityKind: "node",
      forkedFrom: "clone-source",
    });
  });

  it("keeps control IDs globally unique across node and registry entities", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;

    const patches = [
      { kind: "create", entityKind: "node", entityType: "FRAME", controlId: "shared-identity", properties: { name: "Identity owner" } },
      { kind: "create", entityKind: "variable_collection", controlId: "shared-identity", properties: { name: "Token collection" } },
    ];
    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true }) as any;
    const committed = await applyDocument({
      action: "apply_entity_patch",
      patches: plan.plan.patches,
      dryRun: false,
      confirm: true,
      expectedPlanHash: plan.plan.planHash,
    }) as any;

    expect(committed.state).toBe("COMMITTED");
    expect(committed.changedEntities[0].controlId).toBe("shared-identity");
    expect(committed.changedEntities[1].controlId).not.toBe("shared-identity");
    const registry = JSON.parse(fixture.figma.root.getSharedPluginData("figmaplugin", "entity-registry"));
    expect(registry.entities[committed.changedEntities[1].id]).toMatchObject({
      controlId: committed.changedEntities[1].controlId,
      entityKind: "variable_collection",
      forkedFrom: "shared-identity",
    });
  });

  it("keeps planHash stable across evidence-only projection drift", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const frame = fixture.makeNode("FRAME", {
      name: "Stable mutation target",
      x: 0,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 40 },
    });
    fixture.page.appendChild(frame);
    const request = { action: "apply_entity_patch", patches: [{ kind: "update", entityKind: "node", target: { nodeId: frame.id }, set: { x: 24 } }], dryRun: true };

    const first = await applyDocument(request) as any;
    frame.absoluteBoundingBox = { x: 999, y: 999, width: 100, height: 40 };
    const evidenceOnlyChange = await applyDocument(request) as any;
    expect(evidenceOnlyChange.plan.planHash).toBe(first.plan.planHash);
    expect(evidenceOnlyChange.plan.snapshotSchemaVersion).toBe(1);

    frame.x = 1;
    const mutableChange = await applyDocument(request) as any;
    expect(mutableChange.plan.planHash).not.toBe(first.plan.planHash);
  });

  it("invalidates create, move, and clone plans when destination child order drifts", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const destination = fixture.makeNode("FRAME", { name: "Destination" });
    const existing = fixture.makeNode("RECTANGLE", { name: "Existing child" });
    const source = fixture.makeNode("RECTANGLE", { name: "Source" });
    destination.appendChild(existing);
    fixture.page.appendChild(destination);
    fixture.page.appendChild(source);

    const requests = [
      { action: "apply_entity_patch", patches: [{ kind: "create", entityKind: "node", entityType: "RECTANGLE", parent: { nodeId: destination.id }, index: 0 }], dryRun: true },
      { action: "apply_entity_patch", patches: [{ kind: "move", entityKind: "node", target: { nodeId: source.id }, parent: { nodeId: destination.id }, index: 0 }], dryRun: true },
      { action: "apply_entity_patch", patches: [{ kind: "clone", entityKind: "node", target: { nodeId: source.id }, parent: { nodeId: destination.id }, index: 0 }], dryRun: true },
    ];
    const beforeDrift = [] as any[];
    for (const request of requests) beforeDrift.push(await applyDocument(request) as any);

    const concurrentSibling = fixture.makeNode("RECTANGLE", { name: "Concurrent sibling" });
    destination.appendChild(concurrentSibling);
    destination.insertChild(0, concurrentSibling);

    for (const [index, request] of requests.entries()) {
      const afterDrift = await applyDocument(request) as any;
      expect(afterDrift.plan.planHash).not.toBe(beforeDrift[index].plan.planHash);
    }
    await expect(applyDocument({
      ...requests[0],
      patches: beforeDrift[0].plan.patches,
      dryRun: false,
      confirm: true,
      expectedPlanHash: beforeDrift[0].plan.planHash,
    })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.DRIFT_CONFLICT } });
  });

  it("maps shared wire validation failures to INVALID_PARAMS", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const frame = fixture.makeNode("FRAME", { name: "Validation target" });
    fixture.page.appendChild(frame);

    await expect(applyDocument({
      action: "apply_entity_patch",
      patches: [{ kind: "motion_command", entityKind: "node", target: { nodeId: frame.id }, command: "mystery", payload: {} }],
      dryRun: true,
    })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.INVALID_PARAMS } });
  });

  it("keeps compact rollback failure evidence without restoring full entity payloads", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const frame = fixture.makeNode("FRAME", { name: "Rollback frame", x: 0 });
    const instance = fixture.makeNode("INSTANCE", { name: "Failing instance" });
    instance.setProperties = vi.fn(() => { throw new Error("synthetic command failure"); });
    fixture.page.appendChild(frame);
    fixture.page.appendChild(instance);

    const patches = [
      { kind: "update", entityKind: "node", target: { nodeId: frame.id }, set: { x: 42 } },
      { kind: "component_command", entityKind: "node", target: { nodeId: instance.id }, command: "set_properties", payload: { properties: { State: "Pressed" } } },
    ];
    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true, resultMode: "receipt" }) as any;
    const failed = await applyDocument({ action: "apply_entity_patch", patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash, resultMode: "receipt" }) as any;

    expect(failed).toMatchObject({
      dryRun: false,
      writePerformed: true,
      state: "PARTIAL_COMMIT",
      resultMode: "receipt",
      rollbackState: "unverified",
      error: "synthetic command failure",
      plan: expect.objectContaining({ planHash: plan.plan.planHash, operationCount: 2 }),
      changedEntities: [expect.objectContaining({ id: frame.id, entityKind: "node" })],
    });
    expect(failed.before).toBeUndefined();
    expect(failed.afterRollback).toBeUndefined();
    expect(failed.beforeFingerprint).toMatch(/^fnv1a-/);
    expect(failed.afterRollbackFingerprint).toMatch(/^fnv1a-/);
    expect(failed.rollbackError).toContain("fingerprint");
  });

  it("executes forward local-ref dependencies atomically and returns persistent continuation identities in request order", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;

    const patches = [
      { kind: "update", entityKind: "node", target: { opRef: "child" }, set: { x: 24 } },
      { kind: "create", entityKind: "node", entityType: "RECTANGLE", opRef: "child", parent: { opRef: "root" }, controlId: "local-child", properties: { name: "Child", width: 80, height: 40 } },
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "root", controlId: "local-root", properties: { name: "Root", width: 320, height: 180 } },
    ];
    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true, resultMode: "receipt" }) as any;
    expect(plan.plan.executionOrder).toEqual([2, 1, 0]);
    expect(plan.plan.dependencies).toEqual([
      { patchIndex: 0, dependsOn: [1], opRefs: ["child"] },
      { patchIndex: 1, dependsOn: [2], opRefs: ["root"] },
      { patchIndex: 2, dependsOn: [], opRefs: [] },
    ]);
    expect(plan.plan.before[0]).toMatchObject({ operation: "local_ref", opRef: "child", producerIndex: 1, preflight: "deferred_to_execution" });
    expect(plan.plan.before[1]).toMatchObject({ operation: "create", opRef: "child" });

    const committed = await applyDocument({ action: "apply_entity_patch", patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash, resultMode: "receipt" }) as any;
    expect(committed.state).toBe("COMMITTED");
    expect(committed.changedEntities.map((item: any) => item.opRef ?? null)).toEqual([null, "child", "root"]);
    expect(committed.changedEntities[1]).toMatchObject({ opRef: "child", controlId: "local-child", entityKind: "node" });
    expect(committed.changedEntities[2]).toMatchObject({ opRef: "root", controlId: "local-root", entityKind: "node" });
    const root = fixture.page.children.find((item: any) => item.getSharedPluginData("figmaplugin", "control").includes("local-root"));
    expect(root.children).toHaveLength(1);
    expect(root.children[0].x).toBe(24);
  });

  it("does not certify rollback when a produced entity survives undo", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const failing = fixture.makeNode("INSTANCE", { name: "Failing instance" });
    failing.setProperties = vi.fn(() => { throw new Error("synthetic local-ref failure"); });
    fixture.page.appendChild(failing);

    const patches = [
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "created", controlId: "rollback-created", properties: { name: "Created" } },
      { kind: "component_command", entityKind: "node", target: { nodeId: failing.id }, command: "set_properties", payload: { properties: { State: "Pressed" } } },
    ];
    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true, resultMode: "receipt" }) as any;
    const failed = await applyDocument({ action: "apply_entity_patch", patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash, resultMode: "receipt" }) as any;

    expect(failed.state).toBe("PARTIAL_COMMIT");
    expect(failed.rollbackState).toBe("unverified");
    expect(failed.rollbackError).toContain("produced entities");
    expect(fixture.page.children.some((item: any) => item.getSharedPluginData("figmaplugin", "control").includes("rollback-created"))).toBe(true);
  });

  it("aligns component integrity facts to graph pages instead of repeating the full inventory", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const plain = fixture.makeNode("FRAME", { name: "Plain" });
    const component = fixture.makeNode("COMPONENT", { name: "Button", key: "component-key", remote: false, componentPropertyDefinitions: {} });
    const instance = fixture.makeNode("INSTANCE", { name: "Button instance", componentProperties: {} });
    instance.getMainComponentAsync = vi.fn(async () => component);
    fixture.page.appendChild(plain);
    fixture.page.appendChild(component);
    fixture.page.appendChild(instance);

    const first = await queryDocument({ kind: "component_integrity", scope: "page", limit: 2 }) as any;
    const second = await queryDocument({ kind: "component_integrity", scope: "page", limit: 2, cursor: first.coverage.nextCursor }) as any;

    expect(first.coverage).toMatchObject({ returned: 2, truncated: true, nextCursor: "offset:2" });
    expect(second.coverage).toMatchObject({ returned: 1, truncated: false });
    expect(first.facts.components.map((item: any) => item.id)).toEqual([component.id]);
    expect(second.facts.components.map((item: any) => item.id)).toEqual([instance.id]);
    expect(first.facts.componentCoverage).toEqual({ total: 2, returned: 1, alignedTo: "graph_page" });
    expect(second.facts.componentCoverage).toEqual({ total: 2, returned: 1, alignedTo: "graph_page" });
    expect(new Set([...first.facts.components, ...second.facts.components].map((item: any) => item.id)).size).toBe(2);
  });

  it("delivers invariant binding inventories only on the first graph page", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    fixture.page.appendChild(fixture.makeNode("FRAME", { name: "First" }));
    fixture.page.appendChild(fixture.makeNode("FRAME", { name: "Second" }));
    fixture.figma.getLocalPaintStylesAsync = async () => [{ id: "style:1", type: "PAINT", name: "Brand", key: "style-key", remote: false }];
    fixture.figma.variables.getLocalVariableCollectionsAsync = async () => [{ id: "collection:1", key: "collection-key", name: "Theme", modes: [], variableIds: ["variable:1"] }];
    fixture.figma.variables.getLocalVariablesAsync = async () => [{ id: "variable:1", key: "variable-key", name: "Brand", resolvedType: "COLOR", variableCollectionId: "collection:1", remote: false }];

    const first = await queryDocument({ kind: "binding_inventory", scope: "page", limit: 1 }) as any;
    const second = await queryDocument({ kind: "binding_inventory", scope: "page", limit: 1, cursor: first.coverage.nextCursor }) as any;

    expect(first.facts.variables).toHaveLength(2);
    expect(first.facts.styles).toHaveLength(1);
    expect(first.facts.inventoryDelivery).toEqual({
      mode: "first_graph_page_only",
      included: true,
      variables: { total: 2, returned: 2 },
      styles: { total: 1, returned: 1 },
    });
    expect(second.facts.variables).toEqual([]);
    expect(second.facts.styles).toEqual([]);
    expect(second.facts.inventoryDelivery).toEqual({
      mode: "first_graph_page_only",
      included: false,
      variables: { total: 2, returned: 0 },
      styles: { total: 1, returned: 0 },
    });
    expect(first.facts.nodes[0].id).not.toBe(second.facts.nodes[0].id);
  });

  it("computes prototype reachability through SECTION-contained owners, multihop navigation, overlays, and disconnected owners", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const section = fixture.makeNode("SECTION", { name: "Prototype flow" });
    const start = fixture.makeNode("FRAME", { name: "Start" });
    const screen = fixture.makeNode("FRAME", { name: "Destination" });
    const overlay = fixture.makeNode("FRAME", { name: "Confirmation overlay" });
    const disconnected = fixture.makeNode("FRAME", { name: "Disconnected" });
    const startAction = fixture.makeNode("FRAME", { name: "Action / Continue" });
    const screenAction = fixture.makeNode("FRAME", { name: "Action / Open overlay" });
    const overlayClose = fixture.makeNode("FRAME", { name: "Action / Close overlay" });
    const disconnectedAction = fixture.makeNode("FRAME", { name: "Action / Disconnected" });
    startAction.reactions = [{ trigger: { type: "ON_CLICK" }, actions: [{ type: "NODE", destinationId: screen.id, navigation: "NAVIGATE" }] }];
    screenAction.reactions = [{ trigger: { type: "ON_CLICK" }, actions: [{ type: "NODE", destinationId: overlay.id, navigation: "OVERLAY" }] }];
    overlayClose.reactions = [{ trigger: { type: "ON_CLICK" }, actions: [{ type: "CLOSE" }] }];
    disconnectedAction.reactions = [{ trigger: { type: "ON_CLICK" }, actions: [{ type: "NODE", destinationId: screen.id, navigation: "NAVIGATE" }] }];
    start.appendChild(startAction);
    screen.appendChild(screenAction);
    overlay.appendChild(overlayClose);
    disconnected.appendChild(disconnectedAction);
    section.appendChild(start);
    section.appendChild(screen);
    section.appendChild(overlay);
    section.appendChild(disconnected);
    fixture.page.appendChild(section);
    fixture.page.flowStartingPoints = [{ nodeId: start.id, name: "Primary flow" }];

    const result = await queryDocument({ kind: "prototype_graph", scope: "document" }) as any;

    expect(result.facts.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceId: startAction.id, sourceOwnerId: start.id, destinationId: screen.id }),
      expect.objectContaining({ sourceId: screenAction.id, sourceOwnerId: screen.id, destinationId: overlay.id }),
      expect.objectContaining({ sourceId: overlayClose.id, sourceOwnerId: overlay.id, destinationId: null, action: expect.objectContaining({ type: "CLOSE" }) }),
      expect.objectContaining({ sourceId: disconnectedAction.id, sourceOwnerId: disconnected.id, destinationId: screen.id }),
    ]));
    expect(result.facts.reachableNodeIds).toEqual(expect.arrayContaining([start.id, screen.id, overlay.id]));
    expect(result.facts.unreachableSourceIds).toEqual([disconnectedAction.id]);
    expect(result.facts.unreachableOwnerIds).toEqual([disconnected.id]);
    expect(result.facts.missingDestinationCount).toBe(0);
  });

  it("paginates a targeted motion subtree without duplicate or lost nodes while generic node scope stays exact-root", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const root = fixture.makeNode("FRAME", { name: "Motion specimen" });
    const group = fixture.makeNode("FRAME", { name: "Motion group" });
    const staticBadge = fixture.makeNode("ELLIPSE", { name: "Static badge" });
    const animated = fixture.makeNode("ELLIPSE", { name: "Animated badge", manualKeyframeTracks: { OPACITY: { keyframes: [{ timelinePosition: 0, value: 0 }, { timelinePosition: 0.2, value: 1 }] } } });
    group.appendChild(animated);
    root.appendChild(group);
    root.appendChild(staticBadge);
    fixture.page.appendChild(root);

    const first = await queryDocument({ kind: "motion_snapshot", scope: "node", nodeId: root.id, limit: 2 }) as any;
    const second = await queryDocument({ kind: "motion_snapshot", scope: "node", nodeId: root.id, limit: 2, cursor: first.coverage.nextCursor }) as any;
    const generic = await queryDocument({ kind: "entity_graph", scope: "node", nodeId: root.id, limit: 20 }) as any;

    expect(first.coverage).toMatchObject({ scope: "node", scanned: 4, total: 4, returned: 2, truncated: true, nextCursor: "offset:2" });
    expect(second.coverage).toMatchObject({ scope: "node", scanned: 4, total: 4, returned: 2, truncated: false });
    const nodes = [...first.facts.nodes, ...second.facts.nodes];
    expect(nodes.map((item: any) => item.id)).toEqual([root.id, group.id, animated.id, staticBadge.id]);
    expect(new Set(nodes.map((item: any) => item.id)).size).toBe(4);
    expect(nodes.filter((item: any) => item.manualKeyframeTracks?.OPACITY)).toEqual([
      expect.objectContaining({ id: animated.id, manualKeyframeTracks: expect.objectContaining({ OPACITY: expect.any(Object) }) }),
    ]);
    expect(generic.coverage).toMatchObject({ scope: "node", scanned: 1, total: 1, returned: 1, truncated: false });
    expect(generic.facts.items.map((item: any) => item.id)).toEqual([root.id]);
  });

  it("scopes and paginates accessibility facts by current or explicit page with page-aligned interactive coverage", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const currentActionA = fixture.makeNode("FRAME", { name: "Action / Current A", width: 44, height: 44, opacity: 0.8, fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }], strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }] });
    const currentPlain = fixture.makeNode("FRAME", { name: "Plain current node" });
    const currentActionB = fixture.makeNode("FRAME", { name: "Action / Current B", width: 48, height: 48 });
    currentActionA.reactions = [{ trigger: { type: "ON_CLICK" }, actions: [{ type: "CLOSE" }] }];
    currentActionB.reactions = [{ trigger: { type: "ON_CLICK" }, actions: [{ type: "CLOSE" }] }];
    fixture.page.appendChild(currentActionA);
    fixture.page.appendChild(currentPlain);
    fixture.page.appendChild(currentActionB);
    const otherPage = { ...fixture.page, id: "page:other", name: "Other page", children: [], flowStartingPoints: [] };
    const otherAction = fixture.makeNode("FRAME", { name: "Action / Other", width: 44, height: 44 });
    otherAction.reactions = [{ trigger: { type: "ON_CLICK" }, actions: [{ type: "CLOSE" }] }];
    otherPage.appendChild(otherAction);
    fixture.figma.root.children.unshift(otherPage);

    const first = await queryDocument({ kind: "accessibility_design_facts", scope: "page", limit: 2 }) as any;
    const second = await queryDocument({ kind: "accessibility_design_facts", scope: "page", limit: 2, cursor: first.coverage.nextCursor }) as any;
    const explicitOther = await queryDocument({ kind: "accessibility_design_facts", scope: "page", pageId: otherPage.id, limit: 20 }) as any;

    expect(first.coverage).toMatchObject({ scope: "page", scanned: 3, total: 3, returned: 2, truncated: true, nextCursor: "offset:2" });
    expect(first.facts.interactive.map((item: any) => item.id)).toEqual([currentActionA.id]);
    expect(first.facts.interactiveCoverage).toEqual({ returned: 1, alignedTo: "graph_page" });
    expect(first.facts.interactive[0].contrastInputs).toEqual({
      fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
      strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
      opacity: 0.8,
    });
    expect(second.coverage).toMatchObject({ scope: "page", scanned: 3, total: 3, returned: 1, truncated: false });
    expect(second.facts.interactive.map((item: any) => item.id)).toEqual([currentActionB.id]);
    expect(second.facts.interactiveCoverage).toEqual({ returned: 1, alignedTo: "graph_page" });
    expect(explicitOther.coverage).toMatchObject({ scope: "page", scanned: 1, total: 1, returned: 1, truncated: false });
    expect(explicitOther.facts.interactive.map((item: any) => item.id)).toEqual([otherAction.id]);
    expect(explicitOther.facts.interactiveCoverage).toEqual({ returned: 1, alignedTo: "graph_page" });
    expect([...first.facts.interactive, ...second.facts.interactive].map((item: any) => item.id)).not.toContain(otherAction.id);
  });

  it("manages component property lifecycle without raw execution", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const component = fixture.makeComponent("Card");
    fixture.page.appendChild(component);

    const add = [{
      kind: "component_command", entityKind: "node", target: { nodeId: component.id }, command: "add_property",
      payload: { name: "Label", propertyType: "TEXT", defaultValue: "Card title" },
    }];
    const addPlan = await applyDocument({ action: "apply_entity_patch", patches: add, dryRun: true, resultMode: "receipt" }) as any;
    const added = await applyDocument({ action: "apply_entity_patch", patches: addPlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: addPlan.plan.planHash, resultMode: "receipt" }) as any;
    const propertyKey = added.changedEntities[0].componentPropertyKey;
    expect(propertyKey).toMatch(/^Label#/);
    expect(component.componentPropertyDefinitions[propertyKey]).toMatchObject({ type: "TEXT", defaultValue: "Card title" });

    const edit = [{
      kind: "component_command", entityKind: "node", target: { nodeId: component.id }, command: "edit_property",
      payload: { propertyKey, changes: { name: "Title", defaultValue: "Updated title" } },
    }];
    const editPlan = await applyDocument({ action: "apply_entity_patch", patches: edit, dryRun: true, resultMode: "receipt" }) as any;
    const edited = await applyDocument({ action: "apply_entity_patch", patches: editPlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: editPlan.plan.planHash, resultMode: "receipt" }) as any;
    const editedKey = edited.changedEntities[0].componentPropertyKey;
    expect(editedKey).toMatch(/^Title#/);
    expect(edited.changedEntities[0].previousComponentPropertyKey).toBe(propertyKey);

    const remove = [{
      kind: "component_command", entityKind: "node", target: { nodeId: component.id }, command: "delete_property",
      payload: { propertyKey: editedKey },
    }];
    const deletePlan = await applyDocument({ action: "apply_entity_patch", patches: remove, dryRun: true, resultMode: "receipt" }) as any;
    const deleted = await applyDocument({ action: "apply_entity_patch", patches: deletePlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: deletePlan.plan.planHash, resultMode: "receipt" }) as any;
    expect(deleted.changedEntities[0]).toMatchObject({ componentPropertyKey: editedKey, deletedComponentProperty: true });
    expect(component.componentPropertyDefinitions[editedKey]).toBeUndefined();

    await expect(applyDocument({
      action: "apply_entity_patch",
      patches: [{ kind: "component_command", entityKind: "node", target: { nodeId: component.id }, command: "add_property", payload: { name: "Content", propertyType: "SLOT", defaultValue: "" } }],
      dryRun: true,
    })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.UNSUPPORTED_PROPERTY } });
  });

  it("creates a Slot as a transaction-local producer, exposes violations, and resets it natively", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;

    const patches = [
      { kind: "create", entityKind: "node", entityType: "COMPONENT", opRef: "card", controlId: "component-card", properties: { name: "Card" } },
      { kind: "component_command", entityKind: "node", target: { opRef: "card" }, command: "create_slot", opRef: "content", payload: { name: "Content", description: "Flexible card body", slotSettings: { minChildren: 0, maxChildren: 2, stretchChildOnInsert: true } } },
      { kind: "update", entityKind: "node", target: { opRef: "content" }, set: { name: "contentSlot", layoutMode: "VERTICAL" } },
    ];
    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true, resultMode: "receipt" }) as any;
    expect(plan.plan.executionOrder).toEqual([0, 1, 2]);
    const committed = await applyDocument({ action: "apply_entity_patch", patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash, resultMode: "receipt" }) as any;
    expect(committed.state).toBe("COMMITTED");
    expect(committed.changedEntities.map((item: any) => item.opRef ?? null)).toEqual(["card", "content", null]);
    expect(committed.changedEntities[1]).toMatchObject({ opRef: "content", type: "SLOT", componentPropertyKey: expect.stringMatching(/^Content#/) });

    const slotId = committed.changedEntities[1].id;
    const slot = await fixture.figma.getNodeByIdAsync(slotId);
    slot.limitViolations = ["ABOVE_MAX"];
    const graph = await queryDocument({ kind: "entity_graph", scope: "node", nodeId: slotId, projection: ["component"], limit: 10 }) as any;
    expect(graph.facts.items[0]).toMatchObject({ id: slotId, type: "SLOT", limitViolations: ["ABOVE_MAX"] });

    const integrity = await queryDocument({ kind: "component_integrity", scope: "page", limit: 20 }) as any;
    expect(integrity.facts.components).toEqual(expect.arrayContaining([expect.objectContaining({ id: slotId, type: "SLOT", limitViolations: ["ABOVE_MAX"] })]));

    const reset = [{ kind: "component_command", entityKind: "node", target: { nodeId: slotId }, command: "reset_slot", payload: {} }];
    const resetPlan = await applyDocument({ action: "apply_entity_patch", patches: reset, dryRun: true, resultMode: "receipt" }) as any;
    const resetResult = await applyDocument({ action: "apply_entity_patch", patches: resetPlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: resetPlan.plan.planHash, resultMode: "receipt" }) as any;
    expect(resetResult.changedEntities[0]).toMatchObject({ id: slotId, type: "SLOT", slotReset: true });
    expect(slot.resetSlot).toHaveBeenCalledTimes(1);
  });

  it("combines persistent and transaction-local components into a typed component-set producer with bounded evidence", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const existingDefault = fixture.makeComponent("State=Default");
    const existingHover = fixture.makeComponent("State=Hover");
    fixture.page.appendChild(existingDefault);
    fixture.page.appendChild(existingHover);

    const persistent = [{
      kind: "component_command",
      entityKind: "node",
      command: "combine_variants",
      opRef: "existingSet",
      members: [{ nodeId: existingDefault.id, expectedType: "COMPONENT" }, { nodeId: existingHover.id, expectedType: "COMPONENT" }],
      payload: {},
    }];
    const persistentPlan = await applyDocument({ action: "apply_entity_patch", patches: persistent, dryRun: true, resultMode: "receipt" }) as any;
    const persistentResult = await applyDocument({ action: "apply_entity_patch", patches: persistentPlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: persistentPlan.plan.planHash, resultMode: "receipt" }) as any;
    const existingSetId = persistentResult.changedEntities[0].id;
    expect(persistentResult.changedEntities[0]).toMatchObject({ opRef: "existingSet", id: existingSetId, type: "COMPONENT_SET", componentSetMemberCount: 2 });
    expect(fixture.figma.combineAsVariants).toHaveBeenCalledWith([existingDefault, existingHover], fixture.page);

    const graph = await queryDocument({ kind: "entity_graph", scope: "node", nodeId: existingSetId, projection: ["component"], limit: 10 }) as any;
    expect(graph.facts.items[0]).toMatchObject({
      id: existingSetId,
      type: "COMPONENT_SET",
      componentSetMemberCount: 2,
      componentSetMemberIds: [existingDefault.id, existingHover.id],
      componentSetMembersTruncated: false,
    });

    const local = [
      { kind: "component_command", entityKind: "node", command: "combine_variants", opRef: "buttonSet", members: [{ opRef: "default", expectedType: "COMPONENT" }, { opRef: "pressed", expectedType: "COMPONENT" }], payload: {} },
      { kind: "update", entityKind: "node", target: { opRef: "buttonSet", expectedType: "COMPONENT_SET" }, set: { name: "Controls/Button" } },
      { kind: "create", entityKind: "node", entityType: "COMPONENT", opRef: "default", properties: { name: "State=Default" } },
      { kind: "create", entityKind: "node", entityType: "COMPONENT", opRef: "pressed", properties: { name: "State=Pressed" } },
    ];
    const localPlan = await applyDocument({ action: "apply_entity_patch", patches: local, dryRun: true, resultMode: "receipt" }) as any;
    expect(localPlan.plan.executionOrder).toEqual([2, 3, 0, 1]);
    const localResult = await applyDocument({ action: "apply_entity_patch", patches: localPlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: localPlan.plan.planHash, resultMode: "receipt" }) as any;
    expect(localResult.changedEntities[0]).toMatchObject({ opRef: "buttonSet", type: "COMPONENT_SET", componentSetMemberCount: 2 });
    expect(localResult.changedEntities[1]).toMatchObject({ type: "COMPONENT_SET", name: "Controls/Button" });

    const rectangle = fixture.makeNode("RECTANGLE", { name: "Not a component" });
    fixture.page.appendChild(rectangle);
    await expect(applyDocument({
      action: "apply_entity_patch",
      patches: [{ kind: "component_command", entityKind: "node", command: "combine_variants", members: [{ nodeId: rectangle.id }], payload: {} }],
      dryRun: true,
    })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.UNSUPPORTED_PROPERTY } });
  });

  it("builds a variable graph with local collection refs, modes, aliases, code syntax, and opt-in detail evidence", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;

    const patches = [
      { kind: "create", entityKind: "variable_collection", opRef: "tokens", controlId: "tokens-theme", properties: { name: "Theme" } },
      { kind: "variable_command", entityKind: "variable_collection", target: { opRef: "tokens" }, command: "rename_mode", payload: { defaultMode: true, name: "Light" } },
      { kind: "variable_command", entityKind: "variable_collection", target: { opRef: "tokens" }, command: "add_mode", payload: { name: "Dark" } },
      { kind: "create", entityKind: "variable", opRef: "primitive", collection: { opRef: "tokens" }, properties: { name: "color/blue/600", resolvedType: "COLOR", description: "Brand blue", scopes: ["ALL_FILLS"], hiddenFromPublishing: false } },
      { kind: "variable_command", entityKind: "variable", target: { opRef: "primitive" }, command: "set_value", payload: { modeName: "Light", value: { r: 0.1, g: 0.2, b: 0.8, a: 1 } } },
      { kind: "variable_command", entityKind: "variable", target: { opRef: "primitive" }, command: "set_value", payload: { modeName: "Dark", value: { r: 0.3, g: 0.5, b: 1, a: 1 } } },
      { kind: "variable_command", entityKind: "variable", target: { opRef: "primitive" }, command: "set_code_syntax", payload: { platform: "WEB", value: "--color-blue-600" } },
      { kind: "create", entityKind: "variable", opRef: "semantic", collection: { opRef: "tokens" }, properties: { name: "color/action/primary", resolvedType: "COLOR", scopes: ["ALL_FILLS"] } },
      { kind: "variable_command", entityKind: "variable", target: { opRef: "semantic" }, alias: { opRef: "primitive" }, command: "set_value", payload: { defaultMode: true } },
    ];
    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true, resultMode: "receipt" }) as any;
    expect(plan.plan.executionOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const committed = await applyDocument({ action: "apply_entity_patch", patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash, resultMode: "receipt" }) as any;
    expect(committed.state).toBe("COMMITTED");
    expect(committed.changedEntities[0]).toMatchObject({ opRef: "tokens", entityKind: "variable_collection" });
    expect(committed.changedEntities[3]).toMatchObject({ opRef: "primitive", entityKind: "variable", collectionId: committed.changedEntities[0].id });
    expect(committed.changedEntities[8]).toMatchObject({ entityKind: "variable", aliasedVariableId: committed.changedEntities[3].id });

    const compact = await queryDocument({ kind: "entity_graph", scope: "variables", entityKind: "variable", limit: 20 }) as any;
    const compactPrimitive = compact.facts.items.find((item: any) => item.id === committed.changedEntities[3].id);
    expect(compactPrimitive.valuesByMode).toBeUndefined();
    expect(compactPrimitive.codeSyntax).toBeUndefined();

    const detailed = await queryDocument({ kind: "entity_graph", scope: "variables", projection: ["variable_details"], limit: 20 }) as any;
    const primitive = detailed.facts.items.find((item: any) => item.id === committed.changedEntities[3].id);
    const semantic = detailed.facts.items.find((item: any) => item.id === committed.changedEntities[7].id);
    expect(primitive).toMatchObject({ description: "Brand blue", scopes: ["ALL_FILLS"], codeSyntax: { WEB: "--color-blue-600" } });
    expect(Object.keys(primitive.valuesByMode)).toHaveLength(2);
    expect(Object.values(semantic.valuesByMode)).toEqual(expect.arrayContaining([expect.objectContaining({ type: "VARIABLE_ALIAS", id: committed.changedEntities[3].id })]));

    await expect(applyDocument({ action: "apply_entity_patch", patches: [{ kind: "variable_command", entityKind: "variable", target: { variableId: committed.changedEntities[3].id }, command: "set_value", payload: { modeName: "Missing", value: 1 } }], dryRun: true })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.TARGET_NOT_FOUND } });
  });

  it("binds and unbinds direct fields and SolidPaint consumers through modeled variable refs", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const surface = fixture.makeNode("RECTANGLE", {
      name: "Token surface",
      fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 }],
      strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 1 }],
    });
    fixture.page.appendChild(surface);

    const patches = [
      { kind: "create", entityKind: "variable_collection", opRef: "tokens", properties: { name: "Theme" } },
      { kind: "create", entityKind: "variable", opRef: "opacity", collection: { opRef: "tokens" }, properties: { name: "opacity/default", resolvedType: "FLOAT" } },
      { kind: "create", entityKind: "variable", opRef: "color", collection: { opRef: "tokens" }, properties: { name: "color/surface", resolvedType: "COLOR" } },
      { kind: "set_bindings", entityKind: "node", target: { nodeId: surface.id }, variable: { opRef: "opacity" }, payload: { binding: { kind: "node", field: "opacity" } } },
      { kind: "set_bindings", entityKind: "node", target: { nodeId: surface.id }, variable: { opRef: "color" }, payload: { binding: { kind: "paint", property: "fills", index: 0, field: "color" } } },
    ];
    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true, resultMode: "receipt" }) as any;
    const committed = await applyDocument({ action: "apply_entity_patch", patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash, resultMode: "receipt" }) as any;
    expect(committed.state).toBe("COMMITTED");
    expect(surface.boundVariables.opacity.id).toBe(committed.changedEntities[1].id);
    expect(surface.fills[0].boundVariables.color.id).toBe(committed.changedEntities[2].id);

    const evidence = await queryDocument({ kind: "entity_graph", scope: "node", nodeId: surface.id, projection: ["bindings"], limit: 10 }) as any;
    expect(evidence.facts.items[0].boundVariables.opacity.id).toBe(committed.changedEntities[1].id);
    expect(evidence.facts.items[0].fills[0].boundVariables.color.id).toBe(committed.changedEntities[2].id);

    const unbindPlan = await applyDocument({ action: "apply_entity_patch", patches: [
      { kind: "set_bindings", entityKind: "node", target: { nodeId: surface.id }, payload: { binding: { kind: "node", field: "opacity", unbind: true } } },
      { kind: "set_bindings", entityKind: "node", target: { nodeId: surface.id }, payload: { binding: { kind: "paint", property: "fills", index: 0, field: "color", unbind: true } } },
    ], dryRun: true, resultMode: "receipt" }) as any;
    await applyDocument({ action: "apply_entity_patch", patches: unbindPlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: unbindPlan.plan.planHash, resultMode: "receipt" });
    expect(surface.boundVariables.opacity).toBeUndefined();
    expect(surface.fills[0].boundVariables?.color).toBeUndefined();

    const floatVariableId = committed.changedEntities[1].id;
    await expect(applyDocument({ action: "apply_entity_patch", patches: [{ kind: "set_bindings", entityKind: "node", target: { nodeId: surface.id }, variable: { variableId: floatVariableId }, payload: { binding: { kind: "paint", property: "fills", index: 0, field: "color" } } }], dryRun: true })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.UNSUPPORTED_PROPERTY } });
  });

  it("configures a Grid and places a transaction-local child with bounded layout evidence", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const patches = [
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "grid", properties: { name: "Metrics" } },
      { kind: "layout_command", entityKind: "node", target: { opRef: "grid" }, command: "configure_grid", payload: { rowCount: 2, columnCount: 3, rowGap: 12, columnGap: 16, gridAutoTracks: "ROWS", gridItemsPositioning: "MANUAL" } },
      { kind: "create", entityKind: "node", entityType: "RECTANGLE", opRef: "card", parent: { opRef: "grid" }, properties: { name: "Metric" } },
      { kind: "layout_command", entityKind: "node", target: { opRef: "card" }, command: "place_grid_child", payload: { rowIndex: 1, columnIndex: 1, rowSpan: 1, columnSpan: 2, horizontalAlign: "MAX", verticalAlign: "CENTER" } },
    ];
    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true, resultMode: "receipt" }) as any;
    const committed = await applyDocument({ action: "apply_entity_patch", patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash, resultMode: "receipt" }) as any;
    expect(committed.state).toBe("COMMITTED");
    const gridId = committed.changedEntities[0].id;
    const childId = committed.changedEntities[2].id;

    const gridEvidence = await queryDocument({ kind: "entity_graph", scope: "node", nodeId: gridId, projection: ["layout"], limit: 10 }) as any;
    expect(gridEvidence.facts.items[0]).toMatchObject({ layoutMode: "GRID", gridRowCount: 2, gridColumnCount: 3, gridRowGap: 12, gridColumnGap: 16, gridAutoTracks: "ROWS", gridItemsPositioning: "MANUAL" });
    const childEvidence = await queryDocument({ kind: "entity_graph", scope: "node", nodeId: childId, projection: ["layout"], limit: 10 }) as any;
    expect(childEvidence.facts.items[0]).toMatchObject({ gridRowAnchorIndex: 1, gridColumnAnchorIndex: 1, gridRowSpan: 1, gridColumnSpan: 2, gridChildHorizontalAlign: "MAX", gridChildVerticalAlign: "CENTER" });

    const movePlan = await applyDocument({ action: "apply_entity_patch", patches: [{ kind: "layout_command", entityKind: "node", target: { nodeId: childId }, command: "place_grid_child", payload: { rowIndex: 0, columnIndex: 2, rowSpan: 1, columnSpan: 1 } }], dryRun: true, resultMode: "receipt" }) as any;
    await applyDocument({ action: "apply_entity_patch", patches: movePlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: movePlan.plan.planHash, resultMode: "receipt" });
    expect((await queryDocument({ kind: "entity_graph", scope: "node", nodeId: childId, projection: ["layout"], limit: 10 }) as any).facts.items[0]).toMatchObject({ gridRowAnchorIndex: 0, gridColumnAnchorIndex: 2, gridColumnSpan: 1 });

    const child = await fixture.figma.getNodeByIdAsync(childId);
    const grid = await fixture.figma.getNodeByIdAsync(gridId);
    grid.gridItemsPositioning = "ROW_AUTO_FLOW";
    await expect(applyDocument({ action: "apply_entity_patch", patches: [{ kind: "layout_command", entityKind: "node", target: { nodeId: childId }, command: "place_grid_child", payload: { rowIndex: 0, columnIndex: 0 } }], dryRun: true })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.UNSUPPORTED_PROPERTY } });
    grid.gridItemsPositioning = "MANUAL";
    await expect(applyDocument({ action: "apply_entity_patch", patches: [{ kind: "layout_command", entityKind: "node", target: { nodeId: childId }, command: "place_grid_child", payload: { rowIndex: 9, columnIndex: 0 } }], dryRun: true })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.INVALID_PARAMS } });
    child.setGridChildPosition = undefined;
    await expect(applyDocument({ action: "apply_entity_patch", patches: [{ kind: "layout_command", entityKind: "node", target: { nodeId: childId }, command: "place_grid_child", payload: { rowIndex: 0, columnIndex: 0 } }], dryRun: true })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.FEATURE_GATED } });
  });

  it("applies typed manual motion tracks through the native mutation API and feature-gates unsupported nodes", async () => {
    const fixture = makeFixture();
    (globalThis as Record<string, unknown>).figma = fixture.figma;
    const animated = fixture.makeNode("FRAME", { name: "Animated" });
    fixture.page.appendChild(animated);
    const track = {
      baseValue: { type: "FLOAT", value: 0 },
      keyframes: [
        { timelinePosition: 0, value: { type: "FLOAT", value: 0 } },
        { timelinePosition: 0.3, value: { type: "FLOAT", value: 1 } },
      ],
    };
    const patches = [{
      kind: "motion_command",
      entityKind: "node",
      target: { nodeId: animated.id },
      command: "set_tracks",
      payload: { tracks: [{ field: { type: "PROPERTY", name: "OPACITY" }, track }] },
    }];

    const plan = await applyDocument({ action: "apply_entity_patch", patches, dryRun: true }) as any;
    const committed = await applyDocument({ action: "apply_entity_patch", patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash }) as any;

    expect(committed.state).toBe("COMMITTED");
    expect(animated.applyManualKeyframeTrack).toHaveBeenCalledWith({ type: "PROPERTY", name: "OPACITY" }, track);
    expect(animated.manualKeyframeTracks.OPACITY).toEqual(track);

    const unsupported = fixture.makeNode("FRAME", { name: "Unsupported motion" });
    unsupported.applyManualKeyframeTrack = undefined;
    fixture.page.appendChild(unsupported);
    await expect(applyDocument({
      action: "apply_entity_patch",
      patches: [{ ...patches[0], target: { nodeId: unsupported.id } }],
      dryRun: true,
    })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.FEATURE_GATED } });
  });
});

function makeFixture() {
  let nextId = 1;
  const registry = new Map<string, string>();
  const page: any = {
    id: "page:sync",
    name: "Control Sync Lab",
    type: "PAGE",
    children: [],
    async loadAsync() {},
    on: vi.fn(),
    appendChild(node: any) { if (node.parent && node.parent.children) node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = this; this.children.push(node); },
    insertChild(index: number, node: any) { this.children.splice(this.children.indexOf(node), 1); this.children.splice(Math.max(0, index), 0, node); node.parent = this; },
    findAll(callback: (node: any) => boolean) { return flatten(this.children).filter(callback); },
    findAllWithCriteria(criteria: any) {
      return flatten(this.children).filter((node) => {
        if (Array.isArray(criteria.types) && !criteria.types.includes(node.type)) return false;
        if (criteria.sharedPluginData) return criteria.sharedPluginData.namespace === "figmaplugin" && criteria.sharedPluginData.keys.includes("control") && node.getSharedPluginData("figmaplugin", "control");
        return true;
      });
    },
  };
  const makeNode = (type: string, source?: any): any => {
    const node: any = {
      id: source?.id ?? `node:${nextId++}`,
      type,
      name: source?.name ?? type,
      parent: null,
      children: [],
      x: source?.x ?? 0,
      y: source?.y ?? 0,
      width: source?.width ?? 100,
      height: source?.height ?? 100,
      visible: true,
      locked: false,
      opacity: source?.opacity ?? 1,
      rotation: 0,
      clipsContent: false,
      layoutMode: "NONE",
      primaryAxisSizingMode: "AUTO",
      counterAxisSizingMode: "AUTO",
      primaryAxisAlignItems: "MIN",
      counterAxisAlignItems: "MIN",
      itemSpacing: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      gridRowGap: source?.gridRowGap ?? 0,
      gridColumnGap: source?.gridColumnGap ?? 0,
      gridItemsPositioning: source?.gridItemsPositioning ?? "MANUAL",
      gridRowSizes: source?.gridRowSizes ?? [{ type: "FLEX" }],
      gridColumnSizes: source?.gridColumnSizes ?? [{ type: "FLEX" }],
      gridRowAnchorIndex: source?.gridRowAnchorIndex ?? 0,
      gridColumnAnchorIndex: source?.gridColumnAnchorIndex ?? 0,
      gridRowSpan: source?.gridRowSpan ?? 1,
      gridColumnSpan: source?.gridColumnSpan ?? 1,
      gridChildHorizontalAlign: source?.gridChildHorizontalAlign ?? "AUTO",
      gridChildVerticalAlign: source?.gridChildVerticalAlign ?? "AUTO",
      fills: source?.fills ?? [],
      strokes: source?.strokes ?? [],
      reactions: source?.reactions ?? [],
      animations: source?.animations ?? [],
      animationStyles: source?.animationStyles ?? [],
      manualKeyframeTracks: source?.manualKeyframeTracks ?? {},
      key: source?.key ?? "",
      remote: source?.remote ?? false,
      componentPropertyDefinitions: source?.componentPropertyDefinitions ?? {},
      componentProperties: source?.componentProperties ?? {},
      getSharedPluginData(namespace: string, key: string) { return namespace === "figmaplugin" && key === "control" ? registry.get(this.id) ?? "" : ""; },
      setSharedPluginData(namespace: string, key: string, value: string) { if (namespace === "figmaplugin" && key === "control") registry.set(this.id, value); },
      appendChild(child: any) { child.parent = this; this.children.push(child); },
      insertChild(index: number, child: any) { this.children.splice(this.children.indexOf(child), 1); this.children.splice(index, 0, child); child.parent = this; },
      findAll(callback: (child: any) => boolean) { return flatten(this.children).filter(callback); },
      resize(width: number, height: number) { this.width = width; this.height = height; },
      remove() { if (this.parent?.children) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
      clone() { const copy = makeNode(this.type, this); copy.children = []; this.parent?.appendChild(copy); return copy; },
      boundVariables: source?.boundVariables ? { ...source.boundVariables } : {},
      setBoundVariable: vi.fn((field: string, variable: any | null) => { if (variable) node.boundVariables[field] = { type: "VARIABLE_ALIAS", id: variable.id }; else delete node.boundVariables[field]; }),
      setReactionsAsync: vi.fn(async (value: any[]) => { node.reactions = value; }),
      applyManualKeyframeTrack: vi.fn((field: any, track: any) => {
        if (field?.type === "PROPERTY" && typeof field.name === "string") node.manualKeyframeTracks[field.name] = track;
      }),
      setGridChildPosition: vi.fn((rowIndex: number, columnIndex: number) => {
        const parent = node.parent;
        if (!parent || parent.layoutMode !== "GRID") throw new Error("Parent is not GRID");
        if (parent.gridItemsPositioning === "ROW_AUTO_FLOW") throw new Error("ROW_AUTO_FLOW manages child positions");
        if (rowIndex < 0 || columnIndex < 0 || rowIndex >= parent.gridRowCount || columnIndex >= parent.gridColumnCount) throw new Error("Grid position out of bounds");
        node.gridRowAnchorIndex = rowIndex;
        node.gridColumnAnchorIndex = columnIndex;
      }),
    };
    let gridAutoTracks = source?.gridAutoTracks ?? "NONE";
    let gridRowCount = source?.gridRowCount ?? 1;
    let gridColumnCount = source?.gridColumnCount ?? 1;
    Object.defineProperty(node, "gridAutoTracks", { enumerable: true, configurable: true, get: () => gridAutoTracks, set: (value) => { gridAutoTracks = value; } });
    Object.defineProperty(node, "gridRowCount", { enumerable: true, configurable: true, get: () => gridRowCount, set: (value) => { if (gridAutoTracks === "ROWS") throw new Error("gridRowCount is auto-managed"); gridRowCount = value; node.gridRowSizes = Array.from({ length: value }, (_, index) => node.gridRowSizes[index] ?? { type: "FLEX" }); } });
    Object.defineProperty(node, "gridColumnCount", { enumerable: true, configurable: true, get: () => gridColumnCount, set: (value) => { gridColumnCount = value; node.gridColumnSizes = Array.from({ length: value }, (_, index) => node.gridColumnSizes[index] ?? { type: "FLEX" }); } });
    return node;
  };
  const makeComponent = (name = "Component"): any => {
    const component = makeNode("COMPONENT", { name });
    let propertyCounter = 1;
    component.addComponentProperty = vi.fn((propertyName: string, propertyType: string, defaultValue: any, options: any = {}) => {
      const key = propertyType === "VARIANT" ? propertyName : `${propertyName}#${propertyCounter++}:1`;
      component.componentPropertyDefinitions[key] = { type: propertyType, defaultValue, ...options };
      return key;
    });
    component.editComponentProperty = vi.fn((propertyKey: string, changes: any) => {
      const current = component.componentPropertyDefinitions[propertyKey];
      if (!current) throw new Error(`Unknown property ${propertyKey}`);
      let nextKey = propertyKey;
      if (typeof changes?.name === "string" && changes.name) {
        const suffix = propertyKey.includes("#") ? propertyKey.slice(propertyKey.indexOf("#")) : "";
        nextKey = `${changes.name}${suffix}`;
      }
      const next = { ...current, ...changes };
      delete next.name;
      delete component.componentPropertyDefinitions[propertyKey];
      component.componentPropertyDefinitions[nextKey] = next;
      return nextKey;
    });
    component.deleteComponentProperty = vi.fn((propertyKey: string) => { delete component.componentPropertyDefinitions[propertyKey]; });
    component.createSlot = vi.fn(() => {
      const slot = makeNode("SLOT", { name: "Slot" });
      slot.limitViolations = [];
      slot.resetSlot = vi.fn();
      component.appendChild(slot);
      const key = component.addComponentProperty("Slot", "SLOT", "", {});
      slot.componentPropertyReferences = { children: key };
      return slot;
    });
    return component;
  };
  let nextCollectionId = 1;
  let nextVariableId = 1;
  let nextModeId = 1;
  const variableCollections: any[] = [];
  const localVariables: any[] = [];
  const makeVariableCollection = (name = "Collection"): any => {
    const defaultModeId = `mode:${nextModeId++}`;
    const collection: any = {
      id: `collection:${nextCollectionId++}`, key: `collection-key-${nextCollectionId}`, name, remote: false, hiddenFromPublishing: false,
      defaultModeId, modes: [{ modeId: defaultModeId, name: "Mode 1" }], variableIds: [],
      addMode: vi.fn((modeName: string) => { const modeId = `mode:${nextModeId++}`; collection.modes.push({ modeId, name: modeName }); return modeId; }),
      renameMode: vi.fn((modeId: string, modeName: string) => { const mode = collection.modes.find((item: any) => item.modeId === modeId); if (!mode) throw new Error(`Unknown mode ${modeId}`); mode.name = modeName; }),
      removeMode: vi.fn((modeId: string) => { const index = collection.modes.findIndex((item: any) => item.modeId === modeId); if (index < 0) throw new Error(`Unknown mode ${modeId}`); collection.modes.splice(index, 1); }),
      remove: vi.fn(() => { const index = variableCollections.indexOf(collection); if (index >= 0) variableCollections.splice(index, 1); }),
    };
    variableCollections.push(collection);
    return collection;
  };
  const makeVariable = (name: string, collection: any, resolvedType: string): any => {
    const variable: any = {
      id: `VariableID:${nextVariableId++}`, key: `variable-key-${nextVariableId}`, name, resolvedType, variableCollectionId: collection.id,
      remote: false, description: "", hiddenFromPublishing: false, scopes: [], codeSyntax: {}, valuesByMode: {},
      setValueForMode: vi.fn((modeId: string, value: any) => { variable.valuesByMode[modeId] = value; }),
      setVariableCodeSyntax: vi.fn((platform: string, value: string) => { variable.codeSyntax[platform] = value; }),
      removeVariableCodeSyntax: vi.fn((platform: string) => { delete variable.codeSyntax[platform]; }),
      remove: vi.fn(() => { const index = localVariables.indexOf(variable); if (index >= 0) localVariables.splice(index, 1); const member = collection.variableIds.indexOf(variable.id); if (member >= 0) collection.variableIds.splice(member, 1); }),
    };
    localVariables.push(variable);
    collection.variableIds.push(variable.id);
    return variable;
  };
  const root: any = {
    name: "Typed CRUD Test File",
    children: [page],
    getSharedPluginData(_namespace: string, key: string) { return key === "entity-registry" ? (root.registryValue ?? "") : ""; },
    setSharedPluginData(_namespace: string, key: string, value: string) { if (key === "entity-registry") root.registryValue = value; },
  };
  const find = (id: string): any => flatten(root.children).find((node) => node.id === id) ?? null;
  const figma: any = {
    editorType: "figma",
    root,
    currentPage: page,
    mixed: Symbol("mixed"),
    async loadAllPagesAsync() {},
    on: vi.fn(),
    async getNodeByIdAsync(id: string) { return find(id); },
    createFrame() { return makeNode("FRAME"); },
    createSection() { return makeNode("SECTION"); },
    createRectangle() { return makeNode("RECTANGLE"); },
    createEllipse() { return makeNode("ELLIPSE"); },
    createLine() { return makeNode("LINE"); },
    createPolygon() { return makeNode("POLYGON"); },
    createStar() { return makeNode("STAR"); },
    createText() { return makeNode("TEXT"); },
    createComponent() { return makeComponent(); },
    combineAsVariants: vi.fn((components: any[], parent: any, index?: number) => {
      if (!Array.isArray(components) || components.length === 0 || components.some((node) => node.type !== "COMPONENT")) throw new Error("combineAsVariants requires COMPONENT members");
      const set = makeNode("COMPONENT_SET", { name: "Component set" });
      set.componentPropertyDefinitions = { State: { type: "VARIANT", defaultValue: "Default", variantOptions: components.map((node) => node.name.split("=").pop() ?? node.name) } };
      parent.appendChild(set);
      if (typeof index === "number" && index < parent.children.length) parent.insertChild(index, set);
      for (const component of components) {
        if (component.parent?.children) component.parent.children.splice(component.parent.children.indexOf(component), 1);
        set.appendChild(component);
      }
      return set;
    }),
    getLocalPaintStylesAsync: async () => [],
    getLocalTextStylesAsync: async () => [],
    getLocalEffectStylesAsync: async () => [],
    getLocalGridStylesAsync: async () => [],
    variables: { getLocalVariableCollectionsAsync: async () => [...variableCollections], getLocalVariablesAsync: async () => [...localVariables], getVariableByIdAsync: async (id: string) => localVariables.find((item) => item.id === id) ?? null, getVariableCollectionByIdAsync: async (id: string) => variableCollections.find((item) => item.id === id) ?? null, createVariableCollection: (name: string) => makeVariableCollection(name), createVariable: (name: string, collection: any, resolvedType: string) => makeVariable(name, collection, resolvedType), createVariableAlias: (variable: any) => ({ type: "VARIABLE_ALIAS", id: variable.id }), setBoundVariableForPaint: (paint: any, field: string, variable: any | null) => { const next = { ...paint, boundVariables: { ...(paint.boundVariables ?? {}) } }; if (variable) next.boundVariables[field] = { type: "VARIABLE_ALIAS", id: variable.id }; else delete next.boundVariables[field]; return next; } },
    commitUndo: vi.fn(),
    triggerUndo: vi.fn(),
  };
  return { figma, page, makeNode, makeComponent };
}

function flatten(nodes: any[]): any[] {
  return nodes.flatMap((node) => [node, ...(Array.isArray(node.children) ? flatten(node.children) : [])]);
}
