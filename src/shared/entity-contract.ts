import {
  ENTITY_KINDS,
  PATCH_CONFLICT_POLICIES,
  PATCH_OPERATION_KINDS,
  type EntityKind,
  type PatchConflictPolicy,
  type PatchOperationKind,
} from "./protocol.js";

export type { EntityKind } from "./protocol.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface EntityRefWire {
  opRef?: string;
  controlId?: string;
  nodeId?: string;
  styleId?: string;
  variableId?: string;
  collectionId?: string;
  expectedType?: string;
}

export interface EntityPreconditionWire {
  snapshotId?: string;
  entityRevision?: string;
  propertyHashes?: Record<string, string>;
  parentControlId?: string | null;
  expectedExists?: boolean;
}

export interface CreateEntityPatchWire {
  kind: "create";
  entityKind: EntityKind;
  opRef?: string;
  controlId?: string;
  parent?: EntityRefWire;
  /** Modeled owning collection identity for create entityKind=variable. */
  collection?: EntityRefWire;
  index?: number;
  entityType?: string;
  properties?: Record<string, JsonValue>;
}

export interface UpdateEntityPatchWire {
  kind: "update";
  entityKind: EntityKind;
  target: EntityRefWire;
  precondition?: EntityPreconditionWire;
  set?: Record<string, JsonValue>;
  unset?: string[];
}

export interface MoveEntityPatchWire {
  kind: "move";
  entityKind: "node";
  target: EntityRefWire;
  parent: EntityRefWire;
  index?: number;
  precondition?: EntityPreconditionWire;
}

export interface CloneEntityPatchWire {
  kind: "clone";
  entityKind: "node";
  target: EntityRefWire;
  opRef?: string;
  controlId?: string;
  parent?: EntityRefWire;
  index?: number;
  precondition?: EntityPreconditionWire;
}

export interface DeleteEntityPatchWire {
  kind: "delete";
  entityKind: EntityKind;
  target: EntityRefWire;
  precondition?: EntityPreconditionWire;
  allowDelete?: boolean;
}

type CommandPatchOperationKind = Exclude<PatchOperationKind, "create" | "update" | "move" | "clone" | "delete">;

interface CommandEntityPatchFieldsWire {
  entityKind: EntityKind;
  /** Transaction-local output identity for commands that explicitly produce an entity. */
  opRef?: string;
  target?: EntityRefWire;
  /** Modeled multi-identity input edge for commands such as component_command:combine_variants. */
  members?: EntityRefWire[];
  /** Optional modeled destination parent; combine_variants defaults to the current page when omitted. */
  parent?: EntityRefWire;
  /** Modeled alias-variable identity used only by variable_command:set_value. */
  alias?: EntityRefWire;
  /** Modeled consumer-variable identity used only by set_bindings. */
  variable?: EntityRefWire;
  index?: number;
  precondition?: EntityPreconditionWire;
  command?: string;
  payload?: Record<string, JsonValue>;
}

/** Keep command patches distributive so narrowing on `kind` remains type-safe. */
export type CommandEntityPatchWire = {
  [Kind in CommandPatchOperationKind]: CommandEntityPatchFieldsWire & { kind: Kind };
}[CommandPatchOperationKind];

export type EntityPatchWire =
  | CreateEntityPatchWire
  | UpdateEntityPatchWire
  | MoveEntityPatchWire
  | CloneEntityPatchWire
  | DeleteEntityPatchWire
  | CommandEntityPatchWire;

export type EntityPatchResultMode = "full" | "receipt";

export interface EntityPatchRequestWire {
  patches: EntityPatchWire[];
  dryRun?: boolean;
  confirm?: boolean;
  allowDelete?: boolean;
  expectedPlanHash?: string;
  conflictPolicy?: PatchConflictPolicy;
  maxOperations?: number;
  resultMode?: EntityPatchResultMode;
}

/** Canonical public names used by the protocol documentation. */
export type EntityRef = EntityRefWire;
export type EntityPatch = EntityPatchWire;
export type CreateEntity = CreateEntityPatchWire;
export type UpdateEntity = UpdateEntityPatchWire;
export type MoveEntity = MoveEntityPatchWire;
export type CloneEntity = CloneEntityPatchWire;
export type DeleteEntity = DeleteEntityPatchWire;
export type SetBindings = Extract<CommandEntityPatchWire, { kind: "set_bindings" }>;
export type SetReactions = Extract<CommandEntityPatchWire, { kind: "set_reactions" }>;
export type ComponentCommand = Extract<CommandEntityPatchWire, { kind: "component_command" }>;
export type StyleCommand = Extract<CommandEntityPatchWire, { kind: "style_command" }>;
export type VariableCommand = Extract<CommandEntityPatchWire, { kind: "variable_command" }>;
export type LayoutCommand = Extract<CommandEntityPatchWire, { kind: "layout_command" }>;
export type MotionCommand = Extract<CommandEntityPatchWire, { kind: "motion_command" }>;

export interface EntityGraphTargetWire {
  instanceId?: string;
  fileKey?: string | null;
  fileName?: string;
  editorType?: string;
  bundleRevision?: string;
  pageId?: string | null;
  nodeId?: string | null;
  snapshotId?: string;
}

export interface EvidenceCoverageWire {
  scope: "document" | "page" | "node" | "styles" | "variables";
  scanned: number;
  total: number | null;
  returned: number;
  truncated: boolean;
  nextCursor?: string;
}

export interface EvidenceEnvelopeWire<TFacts = Record<string, unknown>> {
  schemaVersion: 2;
  kind: string;
  target: EntityGraphTargetWire;
  cursor?: { syncEpoch: string; changeSeq: number };
  coverage?: EvidenceCoverageWire;
  facts: TFacts;
  limitations: Array<{ code: string; message: string; unlock?: string }>;
  observedAt: number;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isJsonValue(value: unknown, depth = 0): value is JsonValue {
  if (depth > 12 || value === null) return value === null;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 10_000 && value.every((item) => isJsonValue(item, depth + 1));
  if (isRecord(value)) return Object.entries(value).length <= 10_000 && Object.entries(value).every(([key, item]) => isStableKey(key) && isJsonValue(item, depth + 1));
  return false;
}

export function isStableKey(value: string): boolean {
  return value.length > 0 && value.length <= 256 && !/[\u0000-\u001f\u007f]/.test(value);
}

export function validateEntityRef(value: unknown, label = "target"): EntityRefWire {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const keys = ["opRef", "controlId", "nodeId", "styleId", "variableId", "collectionId"].filter((key) => typeof value[key] === "string" && value[key]);
  if (keys.length !== 1) throw new Error(`${label} must contain exactly one identity: opRef, controlId, nodeId, styleId, variableId, or collectionId.`);
  for (const key of keys) {
    const item = value[key];
    if (typeof item !== "string" || !isStableKey(item)) throw new Error(`${label}.${key} must be a stable non-empty string.`);
    if (key === "opRef" && !isStableOpRef(item)) throw new Error(`${label}.opRef must be 1-128 characters using letters, numbers, dot, underscore, colon, or hyphen.`);
  }
  if (value.expectedType !== undefined && (typeof value.expectedType !== "string" || !isStableKey(value.expectedType))) throw new Error(`${label}.expectedType must be a stable string.`);
  return value as EntityRefWire;
}

export interface EntityPatchExecutionPlanWire {
  order: number[];
  dependencies: Array<{ patchIndex: number; dependsOn: number[]; opRefs: string[] }>;
  producers: Array<{ opRef: string; patchIndex: number; entityKind: EntityKind }>;
}

export function validateEntityPatches(value: unknown, maxOperations = 100): EntityPatchWire[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxOperations) throw new Error(`patches must contain 1-${maxOperations} operations.`);
  const patches = value.map((item, index) => validateEntityPatch(item, `patches[${index}]`));
  planEntityPatchExecution(patches);
  return patches;
}

export function planEntityPatchExecution(patches: EntityPatchWire[]): EntityPatchExecutionPlanWire {
  const producerByRef = new Map<string, { patchIndex: number; entityKind: EntityKind }>();
  for (const [patchIndex, patch] of patches.entries()) {
    const opRef = producerOpRef(patch);
    if (!opRef) continue;
    const prior = producerByRef.get(opRef);
    if (prior) throw new Error(`duplicate opRef producer "${opRef}" at patches[${prior.patchIndex}] and patches[${patchIndex}].`);
    producerByRef.set(opRef, { patchIndex, entityKind: patch.entityKind });
  }

  const dependencies = patches.map((patch, patchIndex) => {
    const refs = localDependencyRefs(patch);
    const dependencyIndexes: number[] = [];
    const opRefs: string[] = [];
    for (const ref of refs) {
      const producer = producerByRef.get(ref.opRef);
      if (!producer) throw new Error(`missing opRef producer "${ref.opRef}" referenced by patches[${patchIndex}].${ref.edge}.`);
      if (producer.entityKind !== ref.expectedEntityKind) {
        throw new Error(`opRef entityKind mismatch for "${ref.opRef}": producer is ${producer.entityKind}, patches[${patchIndex}].${ref.edge} requires ${ref.expectedEntityKind}.`);
      }
      if (!dependencyIndexes.includes(producer.patchIndex)) dependencyIndexes.push(producer.patchIndex);
      if (!opRefs.includes(ref.opRef)) opRefs.push(ref.opRef);
    }
    dependencyIndexes.sort((a, b) => a - b);
    return { patchIndex, dependsOn: dependencyIndexes, opRefs };
  });

  const indegree = dependencies.map((item) => item.dependsOn.length);
  const consumers = patches.map(() => [] as number[]);
  for (const item of dependencies) {
    for (const dependency of item.dependsOn) {
      const dependencyConsumers = consumers[dependency];
      if (!dependencyConsumers) throw new Error(`invalid dependency patch index ${dependency}.`);
      dependencyConsumers.push(item.patchIndex);
    }
  }
  const ready = indegree.map((count, index) => count === 0 ? index : -1).filter((index) => index >= 0).sort((a, b) => a - b);
  const order: number[] = [];
  while (ready.length) {
    const patchIndex = ready.shift() as number;
    order.push(patchIndex);
    const patchConsumers = consumers[patchIndex];
    if (!patchConsumers) throw new Error(`invalid ready patch index ${patchIndex}.`);
    for (const consumer of patchConsumers.sort((a, b) => a - b)) {
      const consumerIndegree = indegree[consumer];
      if (consumerIndegree === undefined) throw new Error(`invalid consumer patch index ${consumer}.`);
      indegree[consumer] = consumerIndegree - 1;
      if (indegree[consumer] === 0) {
        ready.push(consumer);
        ready.sort((a, b) => a - b);
      }
    }
  }
  if (order.length !== patches.length) {
    const blocked = indegree.map((count, index) => count > 0 ? index : -1).filter((index) => index >= 0);
    throw new Error(`transaction-local dependency cycle detected across patches: ${blocked.join(", ")}.`);
  }

  const producers = [...producerByRef.entries()]
    .map(([opRef, producer]) => ({ opRef, ...producer }))
    .sort((a, b) => a.patchIndex - b.patchIndex);
  return { order, dependencies, producers };
}

export function validateEntityPatch(value: unknown, label = "patch"): EntityPatchWire {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const kind = value.kind;
  if (typeof kind !== "string" || !(PATCH_OPERATION_KINDS as readonly string[]).includes(kind)) throw new Error(`${label}.kind must be one of: ${PATCH_OPERATION_KINDS.join(", ")}.`);
  const entityKind = value.entityKind;
  if (typeof entityKind !== "string" || !(ENTITY_KINDS as readonly string[]).includes(entityKind)) throw new Error(`${label}.entityKind must be one of: ${ENTITY_KINDS.join(", ")}.`);
  const commandProducesEntity = kind === "component_command" && (value.command === "create_slot" || value.command === "combine_variants");
  if (value.variable !== undefined && (kind !== "set_bindings" || entityKind !== "node")) throw new Error(`${label}.variable is only supported by set_bindings on entityKind=node.`);
  if (value.opRef !== undefined && kind !== "create" && kind !== "clone" && !commandProducesEntity) throw new Error(`${label}.opRef may only be declared by create or clone patches, or by component_command:create_slot/combine_variants patches.`);
  if (value.opRef !== undefined && (typeof value.opRef !== "string" || !isStableOpRef(value.opRef))) throw new Error(`${label}.opRef must be 1-128 characters using letters, numbers, dot, underscore, colon, or hyphen.`);
  if (kind === "create") {
    if (entityKind !== "node" && entityKind !== "style" && entityKind !== "variable" && entityKind !== "variable_collection") throw new Error(`${label}.entityKind is unsupported.`);
    if (value.controlId !== undefined && (typeof value.controlId !== "string" || !isStableKey(value.controlId))) throw new Error(`${label}.controlId must be a stable string.`);
    if (value.parent !== undefined) validateEntityRef(value.parent, `${label}.parent`);
    if (value.collection !== undefined) {
      if (entityKind !== "variable") throw new Error(`${label}.collection is only supported by create entityKind=variable.`);
      validateEntityRef(value.collection, `${label}.collection`);
      if (isRecord(value.properties) && typeof value.properties.collectionId === "string") throw new Error(`${label} must not provide both collection and properties.collectionId.`);
    }
    if (value.index !== undefined && (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0)) throw new Error(`${label}.index must be a non-negative integer.`);
    if (value.entityType !== undefined && (typeof value.entityType !== "string" || !isStableKey(value.entityType))) throw new Error(`${label}.entityType must be a stable string.`);
    validateProperties(value.properties, `${label}.properties`);
    return value as unknown as CreateEntityPatchWire;
  }
  if (kind === "move" || kind === "clone") {
    if (entityKind !== "node") throw new Error(`${label}.${kind} only supports entityKind=node.`);
    validateEntityRef(value.target, `${label}.target`);
    if (kind === "move") validateEntityRef(value.parent, `${label}.parent`);
    else if (value.parent !== undefined) validateEntityRef(value.parent, `${label}.parent`);
    if (value.index !== undefined && (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0)) throw new Error(`${label}.index must be a non-negative integer.`);
    if (value.controlId !== undefined && (typeof value.controlId !== "string" || !isStableKey(value.controlId))) throw new Error(`${label}.controlId must be a stable string.`);
    return value as unknown as MoveEntityPatchWire | CloneEntityPatchWire;
  }
  if (kind === "delete") {
    validateEntityRef(value.target, `${label}.target`);
    if (value.allowDelete !== undefined && typeof value.allowDelete !== "boolean") throw new Error(`${label}.allowDelete must be boolean.`);
    return value as unknown as DeleteEntityPatchWire;
  }
  if (kind === "update") {
    validateEntityRef(value.target, `${label}.target`);
    validateProperties(value.set, `${label}.set`);
    if (value.unset !== undefined && (!Array.isArray(value.unset) || !value.unset.every((item) => typeof item === "string" && isStableKey(item)))) throw new Error(`${label}.unset must contain stable property names.`);
    return value as unknown as UpdateEntityPatchWire;
  }
  if (value.command !== undefined && (typeof value.command !== "string" || !isStableKey(value.command))) throw new Error(`${label}.command must be a stable string.`);
  if (kind === "component_command" && value.command === "combine_variants") {
    if (entityKind !== "node") throw new Error(`${label}.component_command:combine_variants only supports entityKind=node.`);
    if (value.target !== undefined) throw new Error(`${label}.target is not used by component_command:combine_variants; use members[] and optional parent.`);
    if (!Array.isArray(value.members) || value.members.length < 1 || value.members.length > 64) throw new Error(`${label}.members must contain 1-64 component entity refs for component_command:combine_variants.`);
    const memberKeys = new Set<string>();
    for (const [index, member] of value.members.entries()) {
      const ref = validateEntityRef(member, `${label}.members[${index}]`);
      const key = entityRefIdentityKey(ref);
      if (memberKeys.has(key)) throw new Error(`${label}.members contains duplicate member identity at index ${index}.`);
      memberKeys.add(key);
    }
    if (value.parent !== undefined) validateEntityRef(value.parent, `${label}.parent`);
    if (value.index !== undefined && (typeof value.index !== "number" || !Number.isInteger(value.index) || value.index < 0)) throw new Error(`${label}.index must be a non-negative integer.`);
    if (value.payload !== undefined && (!isRecord(value.payload) || Object.keys(value.payload).length !== 0)) throw new Error(`${label}.payload must be empty for component_command:combine_variants; configure the produced set through later typed patches.`);
    return value as unknown as CommandEntityPatchWire;
  }
  if (value.members !== undefined) throw new Error(`${label}.members is only supported by component_command:combine_variants.`);
  if (value.parent !== undefined) throw new Error(`${label}.parent is only supported by create/move/clone or component_command:combine_variants.`);
  if (value.collection !== undefined) throw new Error(`${label}.collection is only supported by create entityKind=variable.`);
  if (value.index !== undefined) throw new Error(`${label}.index is only supported by create/move/clone or component_command:combine_variants.`);
  if (value.alias !== undefined) {
    if (kind !== "variable_command" || value.command !== "set_value" || entityKind !== "variable") throw new Error(`${label}.alias is only supported by variable_command:set_value on entityKind=variable.`);
    validateEntityRef(value.alias, `${label}.alias`);
  }
  if (value.variable !== undefined) validateEntityRef(value.variable, `${label}.variable`);
  validateEntityRef(value.target, `${label}.target`);
  validateProperties(value.payload, `${label}.payload`);
  if (kind === "variable_command") validateVariableCommandWire(value, label);
  if (kind === "layout_command") validateLayoutCommandWire(value, label);
  if (kind === "set_bindings") validateSetBindingsWire(value, label);
  if (kind === "component_command") validateComponentCommandWire(value, label);
  if (kind === "style_command") validateStyleCommandWire(value, label);
  if (kind === "motion_command") validateMotionCommandWire(value, label);
  return value as unknown as CommandEntityPatchWire;
}

function validateComponentCommandWire(value: Record<string, unknown>, label: string): void {
  if (value.entityKind !== "node") throw new Error(`${label}.component_command requires entityKind=node.`);
  const supported = ["set_properties", "add_property", "edit_property", "delete_property", "create_slot", "reset_slot"];
  if (typeof value.command !== "string" || !supported.includes(value.command)) throw new Error(`${label}.component_command command must be one of: ${supported.join(", ")}, combine_variants.`);
}

function validateStyleCommandWire(value: Record<string, unknown>, label: string): void {
  if (value.entityKind !== "style") throw new Error(`${label}.style_command requires entityKind=style.`);
  if (value.command !== "rename") throw new Error(`${label}.style_command command must be rename.`);
  const payload = isRecord(value.payload) ? value.payload : {};
  if (typeof payload.name !== "string" || payload.name.length === 0) throw new Error(`${label}.style_command:rename requires payload.name.`);
}

function validateMotionCommandWire(value: Record<string, unknown>, label: string): void {
  if (value.entityKind !== "node") throw new Error(`${label}.motion_command requires entityKind=node.`);
  if (value.command !== "set_tracks") throw new Error(`${label}.motion_command command must be set_tracks.`);
}

function validateLayoutCommandWire(value: Record<string, unknown>, label: string): void {
  if (value.entityKind !== "node") throw new Error(`${label}.layout_command requires entityKind=node.`);
  const payload = isRecord(value.payload) ? value.payload : {};
  const command = value.command;
  if (command === "configure_grid") {
    const allowed = new Set(["rowCount", "columnCount", "rowGap", "columnGap", "gridAutoTracks", "gridItemsPositioning"]);
    for (const key of Object.keys(payload)) if (!allowed.has(key)) throw new Error(`${label}.payload.${key} is not supported for configure_grid.`);
    if (Object.keys(payload).length === 0) throw new Error(`${label}.layout_command:configure_grid requires at least one Grid property.`);
    for (const key of ["rowCount", "columnCount"] as const) if (payload[key] !== undefined && (typeof payload[key] !== "number" || !Number.isInteger(payload[key]) || payload[key] < 1 || payload[key] > 4096)) throw new Error(`${label}.payload.${key} must be an integer from 1 to 4096.`);
    for (const key of ["rowGap", "columnGap"] as const) if (payload[key] !== undefined && (typeof payload[key] !== "number" || !Number.isFinite(payload[key]) || payload[key] < 0 || payload[key] > 100000)) throw new Error(`${label}.payload.${key} must be a finite number from 0 to 100000.`);
    if (payload.gridAutoTracks !== undefined && payload.gridAutoTracks !== "NONE" && payload.gridAutoTracks !== "ROWS") throw new Error(`${label}.payload.gridAutoTracks must be NONE or ROWS.`);
    if (payload.gridItemsPositioning !== undefined && payload.gridItemsPositioning !== "MANUAL" && payload.gridItemsPositioning !== "ROW_AUTO_FLOW") throw new Error(`${label}.payload.gridItemsPositioning must be MANUAL or ROW_AUTO_FLOW.`);
    return;
  }
  if (command === "place_grid_child") {
    const allowed = new Set(["rowIndex", "columnIndex", "rowSpan", "columnSpan", "horizontalAlign", "verticalAlign"]);
    for (const key of Object.keys(payload)) if (!allowed.has(key)) throw new Error(`${label}.payload.${key} is not supported for place_grid_child.`);
    for (const key of ["rowIndex", "columnIndex"] as const) if (typeof payload[key] !== "number" || !Number.isInteger(payload[key]) || payload[key] < 0 || payload[key] > 4095) throw new Error(`${label}.payload.${key} must be an integer from 0 to 4095.`);
    for (const key of ["rowSpan", "columnSpan"] as const) if (payload[key] !== undefined && (typeof payload[key] !== "number" || !Number.isInteger(payload[key]) || payload[key] < 1 || payload[key] > 4096)) throw new Error(`${label}.payload.${key} must be an integer from 1 to 4096.`);
    const align = new Set(["MIN", "CENTER", "MAX", "AUTO"]);
    for (const key of ["horizontalAlign", "verticalAlign"] as const) if (payload[key] !== undefined && (typeof payload[key] !== "string" || !align.has(payload[key]))) throw new Error(`${label}.payload.${key} must be MIN, CENTER, MAX, or AUTO.`);
    return;
  }
  throw new Error(`${label}.layout_command command must be configure_grid or place_grid_child.`);
}

function validateSetBindingsWire(value: Record<string, unknown>, label: string): void {
  if (value.entityKind !== "node") throw new Error(`${label}.set_bindings requires entityKind=node.`);
  const payload = isRecord(value.payload) ? value.payload : {};
  if (!isRecord(payload.binding)) throw new Error(`${label}.payload.binding must be an object for set_bindings.`);
  const binding = payload.binding;
  const unbind = binding.unbind === true;
  if (binding.unbind !== undefined && binding.unbind !== true) throw new Error(`${label}.payload.binding.unbind must be true when provided.`);
  const hasVariable = value.variable !== undefined;
  if (hasVariable === unbind) throw new Error(`${label}.set_bindings requires exactly one of variable or payload.binding.unbind=true.`);
  const kind = binding.kind;
  if (kind !== "node" && kind !== "paint") throw new Error(`${label}.payload.binding.kind must be node or paint.`);
  if (typeof binding.field !== "string" || !isStableKey(binding.field)) throw new Error(`${label}.payload.binding.field must be a stable string.`);
  if (kind === "node") {
    const allowed = new Set(["kind", "field", "unbind"]);
    for (const key of Object.keys(binding)) if (!allowed.has(key)) throw new Error(`${label}.payload.binding.${key} is not supported for node binding.`);
    return;
  }
  if (binding.property !== "fills" && binding.property !== "strokes") throw new Error(`${label}.payload.binding.property must be fills or strokes for paint binding.`);
  if (typeof binding.index !== "number" || !Number.isInteger(binding.index) || binding.index < 0 || binding.index > 4095) throw new Error(`${label}.payload.binding.index must be an integer from 0 to 4095.`);
  if (binding.field !== "color") throw new Error(`${label}.payload.binding.field must be color for SolidPaint binding.`);
  const allowed = new Set(["kind", "property", "index", "field", "unbind"]);
  for (const key of Object.keys(binding)) if (!allowed.has(key)) throw new Error(`${label}.payload.binding.${key} is not supported for paint binding.`);
}

function validateVariableCommandWire(value: Record<string, unknown>, label: string): void {
  const command = value.command;
  const entityKind = value.entityKind;
  const payload = isRecord(value.payload) ? value.payload : {};
  if (command === "add_mode") {
    if (entityKind !== "variable_collection" || typeof payload.name !== "string" || payload.name.length === 0) throw new Error(`${label}.variable_command:add_mode requires entityKind=variable_collection and payload.name.`);
    return;
  }
  if (command === "rename_mode" || command === "remove_mode") {
    if (entityKind !== "variable_collection") throw new Error(`${label}.variable_command:${String(command)} requires entityKind=variable_collection.`);
    validateModeSelector(payload, `${label}.payload`);
    if (command === "rename_mode" && (typeof payload.name !== "string" || payload.name.length === 0)) throw new Error(`${label}.payload.name is required for rename_mode.`);
    return;
  }
  if (command === "set_value") {
    if (entityKind !== "variable") throw new Error(`${label}.variable_command:set_value requires entityKind=variable.`);
    validateModeSelector(payload, `${label}.payload`);
    const hasAlias = value.alias !== undefined;
    const hasLiteral = Object.prototype.hasOwnProperty.call(payload, "value");
    if (hasAlias === hasLiteral) throw new Error(`${label}.variable_command:set_value requires exactly one of alias or payload.value.`);
    return;
  }
  if (command === "set_code_syntax") {
    if (entityKind !== "variable") throw new Error(`${label}.variable_command:set_code_syntax requires entityKind=variable.`);
    if (!(payload.platform === "WEB" || payload.platform === "ANDROID" || payload.platform === "iOS")) throw new Error(`${label}.payload.platform must be WEB, ANDROID, or iOS.`);
    if (typeof payload.value !== "string") throw new Error(`${label}.payload.value must be a string for set_code_syntax.`);
    return;
  }
  if (command === "remove_code_syntax") {
    if (entityKind !== "variable") throw new Error(`${label}.variable_command:remove_code_syntax requires entityKind=variable.`);
    if (!(payload.platform === "WEB" || payload.platform === "ANDROID" || payload.platform === "iOS")) throw new Error(`${label}.payload.platform must be WEB, ANDROID, or iOS.`);
    return;
  }
  throw new Error(`${label}.variable_command command must be add_mode, rename_mode, remove_mode, set_value, set_code_syntax, or remove_code_syntax.`);
}

function validateModeSelector(payload: Record<string, unknown>, label: string): void {
  if (payload.defaultMode !== undefined && payload.defaultMode !== true) throw new Error(`${label}.defaultMode must be true when provided.`);
  const selectors = [typeof payload.modeId === "string" && payload.modeId.length > 0, typeof payload.modeName === "string" && payload.modeName.length > 0, payload.defaultMode === true].filter(Boolean).length;
  if (selectors !== 1) throw new Error(`${label} requires exactly one mode selector: modeId, modeName, or defaultMode=true.`);
}

function isStableOpRef(value: string): boolean {
  return value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

export function producerOpRef(patch: EntityPatchWire): string | undefined {
  if ((patch.kind === "create" || patch.kind === "clone" || (patch.kind === "component_command" && (patch.command === "create_slot" || patch.command === "combine_variants"))) && typeof patch.opRef === "string") return patch.opRef;
  return undefined;
}

function localDependencyRefs(patch: EntityPatchWire): Array<{ opRef: string; edge: string; expectedEntityKind: EntityKind }> {
  const refs: Array<{ opRef: string; edge: string; expectedEntityKind: EntityKind }> = [];
  if ("target" in patch && patch.target?.opRef) refs.push({ opRef: patch.target.opRef, edge: "target", expectedEntityKind: patch.entityKind });
  if ("collection" in patch && patch.collection?.opRef) refs.push({ opRef: patch.collection.opRef, edge: "collection", expectedEntityKind: "variable_collection" });
  if ("alias" in patch && patch.alias?.opRef) refs.push({ opRef: patch.alias.opRef, edge: "alias", expectedEntityKind: "variable" });
  if ("variable" in patch && patch.variable?.opRef) refs.push({ opRef: patch.variable.opRef, edge: "variable", expectedEntityKind: "variable" });
  if ("members" in patch && Array.isArray(patch.members)) {
    for (const [index, member] of patch.members.entries()) if (member.opRef) refs.push({ opRef: member.opRef, edge: `members[${index}]`, expectedEntityKind: "node" });
  }
  if ("parent" in patch && patch.parent?.opRef) refs.push({ opRef: patch.parent.opRef, edge: "parent", expectedEntityKind: "node" });
  return refs;
}

function entityRefIdentityKey(ref: EntityRefWire): string {
  if (ref.opRef) return `opRef:${ref.opRef}`;
  if (ref.controlId) return `controlId:${ref.controlId}`;
  if (ref.nodeId) return `nodeId:${ref.nodeId}`;
  if (ref.styleId) return `styleId:${ref.styleId}`;
  if (ref.variableId) return `variableId:${ref.variableId}`;
  if (ref.collectionId) return `collectionId:${ref.collectionId}`;
  return "unknown";
}

function validateProperties(value: unknown, label: string): void {
  if (value === undefined) return;
  if (!isRecord(value) || !Object.entries(value).every(([key, item]) => isStableKey(key) && isJsonValue(item))) throw new Error(`${label} must be a JSON object with finite values.`);
}

export function validateConflictPolicy(value: unknown): PatchConflictPolicy {
  if (value === undefined) return "merge_non_overlapping";
  if (typeof value !== "string" || !(PATCH_CONFLICT_POLICIES as readonly string[]).includes(value)) throw new Error(`conflictPolicy must be one of: ${PATCH_CONFLICT_POLICIES.join(", ")}.`);
  return value as PatchConflictPolicy;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Deterministic, non-secret plan identity for optimistic concurrency. */
export function fingerprint(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
