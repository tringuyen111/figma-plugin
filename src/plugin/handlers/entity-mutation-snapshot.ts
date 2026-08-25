/// <reference types="@figma/plugin-typings" />
import { fingerprint, type EntityPatchWire } from "../../shared/entity-contract.js";

export const MUTATION_SNAPSHOT_SCHEMA_VERSION = 1 as const;

const MUTABLE_BASELINE_KEYS = [
  "name",
  "x",
  "y",
  "width",
  "height",
  "visible",
  "locked",
  "opacity",
  "rotation",
  "clipsContent",
  "layoutMode",
  "primaryAxisSizingMode",
  "counterAxisSizingMode",
  "primaryAxisAlignItems",
  "counterAxisAlignItems",
  "layoutWrap",
  "itemSpacing",
  "counterAxisSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "characters",
  "fontName",
  "fontSize",
  "lineHeight",
  "textAutoResize",
  "fills",
  "strokes",
  "effects",
  "reactions",
  "boundVariables",
  "componentProperties",
  "componentPropertyDefinitions",
  "valuesByMode",
  "modes",
  "defaultModeId",
  "description",
  "scopes",
  "codeSyntax",
  "gridRowCount",
  "gridColumnCount",
  "gridRowGap",
  "gridColumnGap",
  "gridRowSizes",
  "gridColumnSizes",
  "gridItemsPositioning",
  "gridRowAnchorIndex",
  "gridColumnAnchorIndex",
  "gridRowSpan",
  "gridColumnSpan",
  "gridChildHorizontalAlign",
  "gridChildVerticalAlign",
  "animations",
  "animationStyles",
  "manualKeyframeTracks",
] as const;

export function mutationSnapshotEntry(
  patch: EntityPatchWire,
  target: BaseNode | BaseStyle | Variable | VariableCollection | undefined,
  evidence: Record<string, unknown>,
  touchedProperties: string[],
): Record<string, unknown> {
  if (!target) {
    return {
      schemaVersion: MUTATION_SNAPSHOT_SCHEMA_VERSION,
      patchKind: patch.kind,
      entityKind: patch.entityKind,
      preflight: stableJson(evidence),
    };
  }

  const dynamic = target as unknown as Record<string, unknown>;
  const entry: Record<string, unknown> = {
    schemaVersion: MUTATION_SNAPSHOT_SCHEMA_VERSION,
    patchKind: patch.kind,
    entityKind: patch.entityKind,
    id: dynamic.id ?? evidence.id ?? null,
    key: dynamic.key ?? evidence.key ?? null,
    type: dynamic.type ?? evidence.type ?? null,
    controlId: evidence.controlId ?? null,
    parentId: evidence.parentId ?? parentId(target),
    index: evidence.index ?? childIndex(target),
  };

  Object.assign(entry, canonicalMutableState(dynamic));
  for (const property of touchedProperties) {
    if (property === "__entity") continue;
    entry[property] = mutationProperty(dynamic, evidence, property);
  }
  return entry;
}

export function mutationSnapshotFingerprint(entries: Array<Record<string, unknown>>): string {
  return fingerprint({ schemaVersion: MUTATION_SNAPSHOT_SCHEMA_VERSION, entries });
}

export function mutationSnapshotsEqual(left: Array<Record<string, unknown>>, right: Array<Record<string, unknown>>): boolean {
  return mutationSnapshotFingerprint(left) === mutationSnapshotFingerprint(right);
}

function canonicalMutableState(dynamic: Record<string, unknown>): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  for (const key of MUTABLE_BASELINE_KEYS) if (key in dynamic) state[key] = stableJson(dynamic[key]);
  if (Array.isArray(dynamic.children)) state.childIds = dynamic.children.map((child) => isRecord(child) && typeof child.id === "string" ? child.id : null);
  return state;
}

function mutationProperty(dynamic: Record<string, unknown>, evidence: Record<string, unknown>, property: string): unknown {
  if (property === "parentId") return evidence.parentId ?? parentId(dynamic as unknown as BaseNode);
  if (property === "index") return evidence.index ?? childIndex(dynamic as unknown as BaseNode);
  if (property === "values") return stableJson(dynamic.valuesByMode ?? evidence.values ?? null);
  if (property === "slotChildCount") return Array.isArray(dynamic.children) ? dynamic.children.length : evidence.slotChildCount ?? null;
  if (property === "slotChildIds") return Array.isArray(dynamic.children)
    ? dynamic.children.map((child) => isRecord(child) && typeof child.id === "string" ? child.id : null)
    : evidence.slotChildIds ?? null;
  if (property === "motion") return stableJson({
    animations: dynamic.animations,
    animationStyles: dynamic.animationStyles,
    manualKeyframeTracks: dynamic.manualKeyframeTracks,
  });
  if (property === "gridAutoTracks") return stableJson({ rows: dynamic.gridRowSizes, columns: dynamic.gridColumnSizes });
  if (property in dynamic) return stableJson(dynamic[property]);
  return stableJson(evidence[property]);
}

function parentId(target: BaseNode | BaseStyle | Variable | VariableCollection): string | null {
  return "parent" in target && target.parent ? target.parent.id : null;
}

function childIndex(target: BaseNode | BaseStyle | Variable | VariableCollection): number | null {
  if (!("parent" in target) || !target.parent || !("children" in target.parent)) return null;
  const index = target.parent.children.indexOf(target as SceneNode);
  return index >= 0 ? index : null;
}

function stableJson(value: unknown): unknown {
  try {
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
