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
    const currentActionA = fixture.makeNode("FRAME", { name: "Action / Current A", width: 44, height: 44 });
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
    expect(second.coverage).toMatchObject({ scope: "page", scanned: 3, total: 3, returned: 1, truncated: false });
    expect(second.facts.interactive.map((item: any) => item.id)).toEqual([currentActionB.id]);
    expect(second.facts.interactiveCoverage).toEqual({ returned: 1, alignedTo: "graph_page" });
    expect(explicitOther.coverage).toMatchObject({ scope: "page", scanned: 1, total: 1, returned: 1, truncated: false });
    expect(explicitOther.facts.interactive.map((item: any) => item.id)).toEqual([otherAction.id]);
    expect(explicitOther.facts.interactiveCoverage).toEqual({ returned: 1, alignedTo: "graph_page" });
    expect([...first.facts.interactive, ...second.facts.interactive].map((item: any) => item.id)).not.toContain(otherAction.id);
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
      opacity: 1,
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
      fills: [],
      strokes: [],
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
      setReactionsAsync: vi.fn(async (value: any[]) => { node.reactions = value; }),
    };
    return node;
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
    getLocalPaintStylesAsync: async () => [],
    getLocalTextStylesAsync: async () => [],
    getLocalEffectStylesAsync: async () => [],
    getLocalGridStylesAsync: async () => [],
    variables: { getLocalVariableCollectionsAsync: async () => [], getLocalVariablesAsync: async () => [] },
    commitUndo: vi.fn(),
    triggerUndo: vi.fn(),
  };
  return { figma, page, makeNode };
}

function flatten(nodes: any[]): any[] {
  return nodes.flatMap((node) => [node, ...(Array.isArray(node.children) ? flatten(node.children) : [])]);
}
