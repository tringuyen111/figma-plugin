export const FIGMA_EDITORS = ["figma", "figjam", "slides"] as const;
export type FigmaEditor = (typeof FIGMA_EDITORS)[number];

export const EVIDENCE_DIMENSIONS = [
  "runtime",
  "structure",
  "system-reuse",
  "visual",
  "interaction",
  "temporal",
  "accessibility",
  "translation-parity",
] as const;
export type EvidenceDimension = (typeof EVIDENCE_DIMENSIONS)[number];

export interface EvidencePolicy {
  /** Minimum evidence normally required for this capability's accountable claim. */
  required: readonly EvidenceDimension[];
  /** Evidence that becomes required only when the requested claim reaches that dimension. */
  conditional?: readonly EvidenceDimension[];
  /** Verification is claim-scoped: only inspected dimensions may receive a verdict. */
  claimScoped?: boolean;
}

export interface FigmaSkillDefinition {
  id: string;
  accountableOutcome: string;
  owner: "runtime" | "design" | "system" | "translation" | "verification";
  /** Editors for which ControlMux ships deep methodology, not merely low-level runtime support. */
  editors: readonly FigmaEditor[];
  evidence: EvidencePolicy;
}

/**
 * Canonical package-level Skill topology.
 *
 * This registry owns installed capability identity, deep editor scope, and
 * evidence obligations. It deliberately does not mirror Figma provider tools
 * or Plugin API operations, which evolve independently and must be revalidated
 * at execution time.
 */
export const FIGMA_SKILLS = [
  { id: "figma-native", accountableOutcome: "Native Figma execution, targeting, and returned evidence", owner: "runtime", editors: ["figma", "figjam", "slides"], evidence: { required: ["runtime"], conditional: ["structure"] } },
  { id: "figma-scene", accountableOutcome: "Scene structure, plane/depth, clipping, and surface ownership", owner: "design", editors: ["figma"], evidence: { required: ["structure"], conditional: ["visual"] } },
  { id: "figma-layout", accountableOutcome: "Auto Layout, grid, sizing, constraints, and responsive geometry", owner: "design", editors: ["figma"], evidence: { required: ["structure"], conditional: ["visual", "accessibility"] } },
  { id: "figma-tokens", accountableOutcome: "Variables, modes, aliases, scopes, code syntax, and token reuse", owner: "system", editors: ["figma"], evidence: { required: ["system-reuse"], conditional: ["structure", "translation-parity"] } },
  { id: "figma-typography", accountableOutcome: "Typography roles, font geometry, Text Styles, and text pressure", owner: "system", editors: ["figma"], evidence: { required: ["system-reuse"], conditional: ["visual", "accessibility"] } },
  { id: "figma-visual-system", accountableOutcome: "Color, material, shape, effects, and perceptual depth", owner: "system", editors: ["figma"], evidence: { required: ["visual"], conditional: ["system-reuse", "accessibility"] } },
  { id: "figma-components", accountableOutcome: "Reusable component anatomy, properties, variants, slots, instances, and state vocabulary", owner: "system", editors: ["figma"], evidence: { required: ["structure", "system-reuse"], conditional: ["visual", "interaction"] } },
  { id: "figma-prototype", accountableOutcome: "Prototype state progression, reactions, actions, variables, conditions, navigation, and overlays", owner: "design", editors: ["figma"], evidence: { required: ["interaction"], conditional: ["structure", "visual", "accessibility"] } },
  { id: "figma-motion", accountableOutcome: "Motion timelines, keyframes, timing/easing, animation styles, and temporal continuity", owner: "design", editors: ["figma"], evidence: { required: ["temporal"], conditional: ["visual", "accessibility"] } },
  { id: "figma-design-system", accountableOutcome: "Coherent reusable Figma system, libraries, naming, and propagation", owner: "system", editors: ["figma"], evidence: { required: ["system-reuse", "structure"], conditional: ["visual", "translation-parity"] } },
  { id: "figma-design-authoring", accountableOutcome: "Approved Product Design truth compiled into coherent Figma views", owner: "design", editors: ["figma"], evidence: { required: ["structure", "visual"], conditional: ["system-reuse", "interaction", "temporal", "accessibility"] } },
  { id: "figma-verification", accountableOutcome: "Bounded evidence-backed verdict on a fixed Figma artifact without redesigning it", owner: "verification", editors: ["figma"], evidence: { required: [], conditional: ["runtime", "structure", "system-reuse", "visual", "interaction", "temporal", "accessibility", "translation-parity"], claimScoped: true } },
  { id: "figma-code-connect", accountableOutcome: "Verified Figma component to code component mapping", owner: "translation", editors: ["figma"], evidence: { required: ["translation-parity"], conditional: ["structure", "system-reuse"] } },
  { id: "figma-code-to-design", accountableOutcome: "Production design semantics reconciled into native reusable Figma truth", owner: "translation", editors: ["figma"], evidence: { required: ["translation-parity", "system-reuse"], conditional: ["structure", "visual"] } },
  { id: "figma-design-to-design", accountableOutcome: "Design assets transferred, reused, migrated, or synchronized across Figma files with the intended identity and update path", owner: "system", editors: ["figma"], evidence: { required: ["system-reuse", "structure"], conditional: ["interaction", "visual", "translation-parity"] } },
  { id: "figma-design-to-code", accountableOutcome: "Figma design context translated into the real production codebase or an implementation-ready handoff packet", owner: "translation", editors: ["figma"], evidence: { required: ["translation-parity"], conditional: ["runtime", "visual", "temporal", "accessibility"] } },
] as const satisfies readonly FigmaSkillDefinition[];

export type FigmaSkillId = (typeof FIGMA_SKILLS)[number]["id"];
export const FIGMA_SKILL_IDS = FIGMA_SKILLS.map((skill) => skill.id) as readonly FigmaSkillId[];


const FIGMA_SKILL_ID_SET = new Set<string>(FIGMA_SKILL_IDS);

export function isFigmaSkillId(value: unknown): value is FigmaSkillId {
  return typeof value === "string" && FIGMA_SKILL_ID_SET.has(value);
}
