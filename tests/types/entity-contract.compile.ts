import type { EntityPatchWire } from "../../src/shared/entity-contract.js";

export const validSlotProducer = {
  kind: "component_command",
  entityKind: "node",
  target: { nodeId: "1:2" },
  command: "create_slot",
  opRef: "content-slot",
  payload: { name: "Content" },
} satisfies EntityPatchWire;

export const validVariableAlias = {
  kind: "variable_command",
  entityKind: "variable",
  target: { variableId: "VariableID:1" },
  command: "set_value",
  alias: { variableId: "VariableID:2" },
  payload: { defaultMode: true },
} satisfies EntityPatchWire;

// @ts-expect-error members belong only to component_command:combine_variants.
export const invalidSlotMembers: EntityPatchWire = { kind: "component_command", entityKind: "node", target: { nodeId: "1:2" }, command: "create_slot", members: [{ nodeId: "2:3" }] };

// @ts-expect-error alias is not part of a code-syntax command.
export const invalidCodeSyntaxAlias: EntityPatchWire = { kind: "variable_command", entityKind: "variable", target: { variableId: "VariableID:1" }, command: "set_code_syntax", alias: { variableId: "VariableID:2" }, payload: { platform: "WEB", value: "--token" } };

// @ts-expect-error set_value must choose either alias or a literal payload value.
export const invalidAliasAndLiteral: EntityPatchWire = { kind: "variable_command", entityKind: "variable", target: { variableId: "VariableID:1" }, command: "set_value", alias: { variableId: "VariableID:2" }, payload: { defaultMode: true, value: 12 } };

// @ts-expect-error set_bindings must choose either a variable or unbind=true.
export const invalidBindAndUnbind: EntityPatchWire = { kind: "set_bindings", entityKind: "node", target: { nodeId: "1:2" }, variable: { variableId: "VariableID:1" }, payload: { binding: { kind: "node", field: "opacity", unbind: true } } };

// @ts-expect-error motion tracks require the typed set_tracks payload.
export const invalidMotionPayload: EntityPatchWire = { kind: "motion_command", entityKind: "node", target: { nodeId: "1:2" }, command: "set_tracks", payload: {} };
