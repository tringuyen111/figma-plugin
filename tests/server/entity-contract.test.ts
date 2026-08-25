import { describe, expect, it } from "vitest";
import { fingerprint, planEntityPatchExecution, validateEntityPatch, validateEntityPatches, validateEntityRef } from "../../src/shared/entity-contract.js";

describe("typed entity contract", () => {
  it("requires exactly one stable target identity", () => {
    expect(validateEntityRef({ nodeId: "1:2", expectedType: "FRAME" })).toEqual({ nodeId: "1:2", expectedType: "FRAME" });
    expect(() => validateEntityRef({ nodeId: "1:2", styleId: "S:1" })).toThrow(/exactly one identity/);
    expect(() => validateEntityRef({ nodeId: "" })).toThrow(/exactly one identity/);
  });

  it("validates bounded CRUD patches and rejects unsupported patch kinds", () => {
    expect(validateEntityPatch({ kind: "create", entityKind: "node", entityType: "FRAME", properties: { name: "Sync Lab", width: 320 } })).toMatchObject({ kind: "create", entityKind: "node" });
    expect(validateEntityPatch({ kind: "update", entityKind: "node", target: { nodeId: "1:2" }, set: { visible: false } })).toMatchObject({ kind: "update" });
    expect(validateEntityPatches([{ kind: "delete", entityKind: "node", target: { controlId: "entity-12345678" }, allowDelete: true }])).toHaveLength(1);
    expect(() => validateEntityPatch({ kind: "unknown", entityKind: "node" })).toThrow(/kind must be one of/);
  });

  it("plans forward transaction-local refs by dependency instead of request order", () => {
    expect(validateEntityRef({ opRef: "root" })).toEqual({ opRef: "root" });
    expect(() => validateEntityRef({ opRef: "root", nodeId: "1:2" })).toThrow(/exactly one identity/);

    const patches = validateEntityPatches([
      { kind: "create", entityKind: "node", entityType: "RECTANGLE", opRef: "child", parent: { opRef: "root" }, properties: { name: "Child" } },
      { kind: "update", entityKind: "node", target: { opRef: "child" }, set: { x: 24 } },
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "root", properties: { name: "Root" } },
    ]);
    const plan = planEntityPatchExecution(patches);
    expect(plan.order).toEqual([2, 0, 1]);
    expect(plan.dependencies).toEqual([
      { patchIndex: 0, dependsOn: [2], opRefs: ["root"] },
      { patchIndex: 1, dependsOn: [0], opRefs: ["child"] },
      { patchIndex: 2, dependsOn: [], opRefs: [] },
    ]);
  });

  it("rejects invalid transaction-local ref graphs before mutation", () => {
    expect(() => validateEntityPatches([
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "same" },
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "same" },
    ])).toThrow(/duplicate opRef/i);

    expect(() => validateEntityPatches([
      { kind: "create", entityKind: "node", entityType: "FRAME", parent: { opRef: "missing" } },
    ])).toThrow(/missing opRef producer/i);

    expect(() => validateEntityPatches([
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "a", parent: { opRef: "b" } },
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "b", parent: { opRef: "a" } },
    ])).toThrow(/dependency cycle/i);

    expect(() => validateEntityPatches([
      { kind: "create", entityKind: "style", opRef: "paint", properties: { styleType: "PAINT", name: "Paint" } },
      { kind: "update", entityKind: "node", target: { opRef: "paint" }, set: { visible: false } },
    ])).toThrow(/entityKind mismatch/i);

    expect(() => validateEntityPatch({ kind: "update", entityKind: "node", opRef: "illegal", target: { nodeId: "1:2" }, set: { visible: false } })).toThrow(/opRef.*create or clone/i);
  });

  it("plans typed component Slot producers and rejects opRef on non-producing commands", () => {
    const patches = validateEntityPatches([
      { kind: "create", entityKind: "node", entityType: "COMPONENT", opRef: "card" },
      { kind: "component_command", entityKind: "node", target: { opRef: "card" }, command: "create_slot", opRef: "content", payload: { name: "Content", slotSettings: { minChildren: 0, maxChildren: 2 } } },
      { kind: "update", entityKind: "node", target: { opRef: "content" }, set: { name: "contentSlot" } },
    ]);
    const plan = planEntityPatchExecution(patches);
    expect(plan.order).toEqual([0, 1, 2]);
    expect(plan.producers).toEqual([
      { opRef: "card", patchIndex: 0, entityKind: "node" },
      { opRef: "content", patchIndex: 1, entityKind: "node" },
    ]);
    expect(plan.dependencies).toEqual([
      { patchIndex: 0, dependsOn: [], opRefs: [] },
      { patchIndex: 1, dependsOn: [0], opRefs: ["card"] },
      { patchIndex: 2, dependsOn: [1], opRefs: ["content"] },
    ]);

    expect(() => validateEntityPatch({
      kind: "component_command",
      entityKind: "node",
      target: { nodeId: "1:2" },
      command: "edit_property",
      opRef: "illegal",
      payload: { propertyKey: "Label#1:2", changes: { name: "Text" } },
    })).toThrow(/opRef.*create_slot/i);
  });

  it("plans modeled variant members and the produced component set without payload ref interpolation", () => {
    const patches = validateEntityPatches([
      {
        kind: "component_command",
        entityKind: "node",
        command: "combine_variants",
        opRef: "buttonSet",
        members: [{ opRef: "default", expectedType: "COMPONENT" }, { opRef: "hover", expectedType: "COMPONENT" }],
        parent: { opRef: "library" },
        payload: {},
      },
      { kind: "update", entityKind: "node", target: { opRef: "buttonSet", expectedType: "COMPONENT_SET" }, set: { name: "Controls/Button" } },
      { kind: "create", entityKind: "node", entityType: "COMPONENT", opRef: "default", properties: { name: "State=Default" } },
      { kind: "create", entityKind: "node", entityType: "SECTION", opRef: "library", properties: { name: "Library" } },
      { kind: "create", entityKind: "node", entityType: "COMPONENT", opRef: "hover", properties: { name: "State=Hover" } },
    ]);
    const plan = planEntityPatchExecution(patches);
    expect(plan.order).toEqual([2, 3, 4, 0, 1]);
    expect(plan.producers).toEqual(expect.arrayContaining([
      { opRef: "buttonSet", patchIndex: 0, entityKind: "node" },
      { opRef: "default", patchIndex: 2, entityKind: "node" },
      { opRef: "library", patchIndex: 3, entityKind: "node" },
      { opRef: "hover", patchIndex: 4, entityKind: "node" },
    ]));
    expect(plan.dependencies[0]).toEqual({ patchIndex: 0, dependsOn: [2, 3, 4], opRefs: ["default", "hover", "library"] });
    expect(plan.dependencies[1]).toEqual({ patchIndex: 1, dependsOn: [0], opRefs: ["buttonSet"] });

    expect(() => validateEntityPatch({
      kind: "component_command",
      entityKind: "node",
      command: "combine_variants",
      members: [],
      payload: {},
    })).toThrow(/members/i);
    expect(() => validateEntityPatch({
      kind: "component_command",
      entityKind: "node",
      command: "combine_variants",
      members: [{ nodeId: "1:2" }, { nodeId: "1:2" }],
      payload: {},
    })).toThrow(/duplicate.*member/i);
    expect(() => validateEntityPatches([{
      kind: "component_command",
      entityKind: "node",
      command: "combine_variants",
      members: [{ opRef: "missing", expectedType: "COMPONENT" }],
      payload: {},
    }])).toThrow(/missing opRef producer/i);
    expect(() => validateEntityPatch({
      kind: "component_command",
      entityKind: "node",
      target: { nodeId: "1:2" },
      command: "create_slot",
      members: [{ nodeId: "2:3" }],
      payload: {},
    })).toThrow(/members.*combine_variants/i);
  });

  it("plans variable collection and alias identity edges without payload interpolation", () => {
    const patches = validateEntityPatches([
      { kind: "create", entityKind: "variable", opRef: "primitive", collection: { opRef: "tokens" }, properties: { name: "color/blue/600", resolvedType: "COLOR" } },
      { kind: "create", entityKind: "variable", opRef: "semantic", collection: { opRef: "tokens" }, properties: { name: "color/action/primary", resolvedType: "COLOR" } },
      { kind: "variable_command", entityKind: "variable", target: { opRef: "semantic" }, alias: { opRef: "primitive" }, command: "set_value", payload: { defaultMode: true } },
      { kind: "create", entityKind: "variable_collection", opRef: "tokens", properties: { name: "Theme" } },
    ]);
    const plan = planEntityPatchExecution(patches);
    expect(plan.order).toEqual([3, 0, 1, 2]);
    expect(plan.dependencies[0]).toEqual({ patchIndex: 0, dependsOn: [3], opRefs: ["tokens"] });
    expect(plan.dependencies[2]).toEqual({ patchIndex: 2, dependsOn: [0, 1], opRefs: ["semantic", "primitive"] });

    expect(() => validateEntityPatch({
      kind: "create", entityKind: "variable", collection: { collectionId: "collection:1" }, properties: { collectionId: "collection:legacy", name: "x", resolvedType: "FLOAT" },
    })).toThrow(/collection.*collectionId/i);
    expect(() => validateEntityPatch({ kind: "create", entityKind: "node", entityType: "FRAME", collection: { collectionId: "collection:1" } })).toThrow(/collection.*variable/i);
    expect(() => validateEntityPatch({ kind: "variable_command", entityKind: "variable", target: { variableId: "VariableID:1" }, alias: { variableId: "VariableID:2" }, command: "set_code_syntax", payload: { platform: "WEB", value: "--x" } })).toThrow(/alias.*set_value/i);
    expect(() => validateEntityPatches([
      { kind: "create", entityKind: "variable_collection", opRef: "tokens", properties: { name: "Theme" } },
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "notVariable" },
      { kind: "variable_command", entityKind: "variable", target: { variableId: "VariableID:1" }, alias: { opRef: "notVariable" }, command: "set_value", payload: { defaultMode: true } },
    ])).toThrow(/entityKind mismatch/i);
  });

  it("validates bounded variable mode and code-syntax command shapes", () => {
    expect(validateEntityPatch({ kind: "variable_command", entityKind: "variable_collection", target: { collectionId: "collection:1" }, command: "add_mode", payload: { name: "Dark" } })).toMatchObject({ command: "add_mode" });
    expect(validateEntityPatch({ kind: "variable_command", entityKind: "variable_collection", target: { collectionId: "collection:1" }, command: "rename_mode", payload: { modeName: "Mode 1", name: "Light" } })).toMatchObject({ command: "rename_mode" });
    expect(validateEntityPatch({ kind: "variable_command", entityKind: "variable", target: { variableId: "VariableID:1" }, command: "set_value", payload: { modeName: "Dark", value: 12 } })).toMatchObject({ command: "set_value" });
    expect(() => validateEntityPatch({ kind: "variable_command", entityKind: "variable", target: { variableId: "VariableID:1" }, command: "set_value", payload: { modeId: "1:0", modeName: "Dark", value: 12 } })).toThrow(/exactly one mode selector/i);
    expect(() => validateEntityPatch({ kind: "variable_command", entityKind: "variable", target: { variableId: "VariableID:1" }, command: "set_code_syntax", payload: { platform: "DESKTOP", value: "x" } })).toThrow(/WEB.*ANDROID.*iOS/i);
    expect(() => validateEntityPatch({ kind: "variable_command", entityKind: "variable", target: { variableId: "VariableID:1" }, command: "mystery", payload: {} })).toThrow(/variable_command command must be/i);
  });

  it("rejects unknown command families at the shared wire boundary", () => {
    expect(() => validateEntityPatch({ kind: "component_command", entityKind: "node", target: { nodeId: "1:2" }, command: "mystery", payload: {} })).toThrow(/component_command command must be/i);
    expect(() => validateEntityPatch({ kind: "style_command", entityKind: "style", target: { styleId: "S:1" }, command: "mystery", payload: {} })).toThrow(/style_command command must be rename/i);
    expect(() => validateEntityPatch({ kind: "motion_command", entityKind: "node", target: { nodeId: "1:2" }, command: "mystery", payload: {} })).toThrow(/motion_command command must be set_tracks/i);
  });

  it("produces stable plan fingerprints independent of object key order", () => {
    expect(fingerprint({ b: 2, a: 1 })).toBe(fingerprint({ a: 1, b: 2 }));
    expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
  });
  it("plans modeled variable consumer bindings and rejects ambiguous shapes", () => {
    const patches = validateEntityPatches([
      { kind: "set_bindings", entityKind: "node", target: { opRef: "surface" }, variable: { opRef: "opacity" }, payload: { binding: { kind: "node", field: "opacity" } } },
      { kind: "create", entityKind: "node", entityType: "RECTANGLE", opRef: "surface", properties: { name: "Surface" } },
      { kind: "create", entityKind: "variable", opRef: "opacity", collection: { opRef: "tokens" }, properties: { name: "opacity/default", resolvedType: "FLOAT" } },
      { kind: "create", entityKind: "variable_collection", opRef: "tokens", properties: { name: "Theme" } },
    ]);
    const plan = planEntityPatchExecution(patches);
    expect(plan.order).toEqual([1, 3, 2, 0]);
    expect(plan.dependencies[0]).toEqual({ patchIndex: 0, dependsOn: [1, 2], opRefs: ["surface", "opacity"] });

    expect(validateEntityPatch({ kind: "set_bindings", entityKind: "node", target: { nodeId: "1:2" }, payload: { binding: { kind: "node", field: "opacity", unbind: true } } })).toMatchObject({ kind: "set_bindings" });
    expect(validateEntityPatch({ kind: "set_bindings", entityKind: "node", target: { nodeId: "1:2" }, variable: { variableId: "VariableID:1" }, payload: { binding: { kind: "paint", property: "fills", index: 0, field: "color" } } })).toMatchObject({ kind: "set_bindings" });

    expect(() => validateEntityPatch({ kind: "set_bindings", entityKind: "node", target: { nodeId: "1:2" }, variable: { variableId: "VariableID:1" }, payload: { binding: { kind: "node", field: "opacity", unbind: true } } })).toThrow(/exactly one.*variable.*unbind/i);
    expect(() => validateEntityPatch({ kind: "set_bindings", entityKind: "node", target: { nodeId: "1:2" }, payload: { binding: { kind: "node", field: "opacity" } } })).toThrow(/exactly one.*variable.*unbind/i);
    expect(() => validateEntityPatch({ kind: "set_bindings", entityKind: "node", target: { nodeId: "1:2" }, variable: { variableId: "VariableID:1" }, payload: { binding: { kind: "paint", property: "effects", index: 0, field: "color" } } })).toThrow(/fills.*strokes/i);
    expect(() => validateEntityPatch({ kind: "update", entityKind: "node", target: { nodeId: "1:2" }, variable: { variableId: "VariableID:1" }, set: { opacity: 0.5 } })).toThrow(/variable.*set_bindings/i);
    expect(() => validateEntityPatches([
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "notVariable" },
      { kind: "set_bindings", entityKind: "node", target: { nodeId: "1:2" }, variable: { opRef: "notVariable" }, payload: { binding: { kind: "node", field: "opacity" } } },
    ])).toThrow(/entityKind mismatch/i);
  });


  it("plans bounded Grid core commands and rejects invalid Grid shapes", () => {
    const patches = validateEntityPatches([
      { kind: "create", entityKind: "node", entityType: "FRAME", opRef: "grid", properties: { name: "Metrics" } },
      { kind: "layout_command", entityKind: "node", target: { opRef: "grid" }, command: "configure_grid", payload: { rowCount: 2, columnCount: 3, rowGap: 12, columnGap: 16, gridAutoTracks: "NONE", gridItemsPositioning: "MANUAL" } },
      { kind: "create", entityKind: "node", entityType: "RECTANGLE", opRef: "card", parent: { opRef: "grid" }, properties: { name: "Metric" } },
      { kind: "layout_command", entityKind: "node", target: { opRef: "card" }, command: "place_grid_child", payload: { rowIndex: 1, columnIndex: 1, rowSpan: 1, columnSpan: 2, horizontalAlign: "MAX", verticalAlign: "CENTER" } },
    ]);
    const plan = planEntityPatchExecution(patches);
    expect(plan.order).toEqual([0, 1, 2, 3]);
    expect(plan.dependencies[1]).toEqual({ patchIndex: 1, dependsOn: [0], opRefs: ["grid"] });
    expect(plan.dependencies[3]).toEqual({ patchIndex: 3, dependsOn: [2], opRefs: ["card"] });

    expect(() => validateEntityPatch({ kind: "layout_command", entityKind: "variable", target: { variableId: "VariableID:1" }, command: "configure_grid", payload: { columnCount: 2 } })).toThrow(/layout_command.*node/i);
    expect(() => validateEntityPatch({ kind: "layout_command", entityKind: "node", target: { nodeId: "1:2" }, command: "configure_grid", payload: { rowCount: 0 } })).toThrow(/rowCount/i);
    expect(() => validateEntityPatch({ kind: "layout_command", entityKind: "node", target: { nodeId: "1:2" }, command: "place_grid_child", payload: { rowIndex: -1, columnIndex: 0 } })).toThrow(/rowIndex/i);
    expect(() => validateEntityPatch({ kind: "layout_command", entityKind: "node", target: { nodeId: "1:2" }, command: "configure_grid", payload: { columnCount: 2, mystery: true } })).toThrow(/mystery/i);
  });

});
