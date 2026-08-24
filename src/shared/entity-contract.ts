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
  controlId?: string;
  parent?: EntityRefWire;
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

export interface CommandEntityPatchWire {
  kind: Exclude<PatchOperationKind, "create" | "update" | "move" | "clone" | "delete">;
  entityKind: EntityKind;
  target?: EntityRefWire;
  precondition?: EntityPreconditionWire;
  command?: string;
  payload?: Record<string, JsonValue>;
}

export type EntityPatchWire =
  | CreateEntityPatchWire
  | UpdateEntityPatchWire
  | MoveEntityPatchWire
  | CloneEntityPatchWire
  | DeleteEntityPatchWire
  | CommandEntityPatchWire;

export interface EntityPatchRequestWire {
  patches: EntityPatchWire[];
  dryRun?: boolean;
  confirm?: boolean;
  allowDelete?: boolean;
  expectedPlanHash?: string;
  conflictPolicy?: PatchConflictPolicy;
  maxOperations?: number;
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
  const keys = ["controlId", "nodeId", "styleId", "variableId", "collectionId"].filter((key) => typeof value[key] === "string" && value[key]);
  if (keys.length !== 1) throw new Error(`${label} must contain exactly one identity: controlId, nodeId, styleId, variableId, or collectionId.`);
  for (const key of keys) {
    const item = value[key];
    if (typeof item !== "string" || !isStableKey(item)) throw new Error(`${label}.${key} must be a stable non-empty string.`);
  }
  if (value.expectedType !== undefined && (typeof value.expectedType !== "string" || !isStableKey(value.expectedType))) throw new Error(`${label}.expectedType must be a stable string.`);
  return value as EntityRefWire;
}

export function validateEntityPatches(value: unknown, maxOperations = 100): EntityPatchWire[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxOperations) throw new Error(`patches must contain 1-${maxOperations} operations.`);
  return value.map((item, index) => validateEntityPatch(item, `patches[${index}]`));
}

export function validateEntityPatch(value: unknown, label = "patch"): EntityPatchWire {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const kind = value.kind;
  if (typeof kind !== "string" || !(PATCH_OPERATION_KINDS as readonly string[]).includes(kind)) throw new Error(`${label}.kind must be one of: ${PATCH_OPERATION_KINDS.join(", ")}.`);
  const entityKind = value.entityKind;
  if (typeof entityKind !== "string" || !(ENTITY_KINDS as readonly string[]).includes(entityKind)) throw new Error(`${label}.entityKind must be one of: ${ENTITY_KINDS.join(", ")}.`);
  if (kind === "create") {
    if (entityKind !== "node" && entityKind !== "style" && entityKind !== "variable" && entityKind !== "variable_collection") throw new Error(`${label}.entityKind is unsupported.`);
    if (value.controlId !== undefined && (typeof value.controlId !== "string" || !isStableKey(value.controlId))) throw new Error(`${label}.controlId must be a stable string.`);
    if (value.parent !== undefined) validateEntityRef(value.parent, `${label}.parent`);
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
  validateEntityRef(value.target, `${label}.target`);
  if (value.command !== undefined && (typeof value.command !== "string" || !isStableKey(value.command))) throw new Error(`${label}.command must be a stable string.`);
  validateProperties(value.payload, `${label}.payload`);
  return value as unknown as CommandEntityPatchWire;
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
