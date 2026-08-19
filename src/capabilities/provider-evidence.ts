import type { EvidenceDimension, FigmaEditor } from "./skill-registry.js";

export type ProviderSurfaceRole = "execute" | "inspect" | "discover" | "translate" | "render-proof" | "capture" | "transfer-in" | "transfer-out";

export interface ProviderSurfaceEvidence {
  id: string;
  roles: readonly ProviderSurfaceRole[];
  editors: readonly FigmaEditor[];
  evidence: readonly EvidenceDimension[];
  controlMuxPosture: "delegate" | "supplement" | "kernel";
}

/**
 * Observed provider snapshot, not capability ontology.
 *
 * The connected Figma tool schema is stronger evidence than a remembered or
 * static docs list, but this snapshot can still become stale after packaging.
 * Any execution that depends on a provider surface must re-discover/revalidate
 * the live provider schema in that host session.
 */
export const FIGMA_PROVIDER_EVIDENCE = {
  provider: "Figma MCP",
  observedAt: "2026-08-19",
  source: "connected-tool-schema",
  runtimeRevalidationRequired: true,
  surfaces: [
    { id: "use_figma", roles: ["execute", "inspect"], editors: ["figma", "figjam", "slides"], evidence: ["runtime", "structure"], controlMuxPosture: "supplement" },
    { id: "get_design_context", roles: ["inspect", "translate"], editors: ["figma"], evidence: ["structure", "system-reuse", "visual", "translation-parity"], controlMuxPosture: "delegate" },
    { id: "get_metadata", roles: ["inspect"], editors: ["figma"], evidence: ["structure"], controlMuxPosture: "delegate" },
    { id: "get_screenshot", roles: ["render-proof"], editors: ["figma", "figjam", "slides"], evidence: ["visual"], controlMuxPosture: "delegate" },
    { id: "get_variable_defs", roles: ["inspect"], editors: ["figma"], evidence: ["system-reuse", "translation-parity"], controlMuxPosture: "delegate" },
    { id: "get_libraries", roles: ["discover"], editors: ["figma"], evidence: ["system-reuse"], controlMuxPosture: "delegate" },
    { id: "search_design_system", roles: ["discover"], editors: ["figma"], evidence: ["system-reuse"], controlMuxPosture: "delegate" },
    { id: "get_motion_context", roles: ["inspect", "translate"], editors: ["figma"], evidence: ["temporal", "translation-parity"], controlMuxPosture: "delegate" },
    { id: "export_video", roles: ["render-proof"], editors: ["figma", "slides"], evidence: ["temporal", "visual"], controlMuxPosture: "delegate" },
    { id: "generate_figma_design", roles: ["capture"], editors: ["figma"], evidence: ["visual"], controlMuxPosture: "delegate" },
    { id: "download_assets", roles: ["transfer-out", "render-proof"], editors: ["figma", "figjam", "slides"], evidence: ["visual"], controlMuxPosture: "delegate" },
    { id: "upload_assets", roles: ["transfer-in", "execute"], editors: ["figma", "figjam", "slides"], evidence: ["runtime", "visual"], controlMuxPosture: "delegate" },
    { id: "get_context_for_code_connect", roles: ["inspect", "translate"], editors: ["figma"], evidence: ["structure", "translation-parity"], controlMuxPosture: "delegate" },
    { id: "list_file_components_for_code_connect", roles: ["discover", "translate"], editors: ["figma"], evidence: ["system-reuse", "translation-parity"], controlMuxPosture: "delegate" },
    { id: "get_code_connect_suggestions", roles: ["discover", "translate"], editors: ["figma"], evidence: ["translation-parity"], controlMuxPosture: "delegate" },
    { id: "get_code_connect_map", roles: ["inspect", "translate"], editors: ["figma"], evidence: ["translation-parity"], controlMuxPosture: "delegate" },
    { id: "add_code_connect_map", roles: ["translate"], editors: ["figma"], evidence: ["translation-parity"], controlMuxPosture: "delegate" },
    { id: "send_code_connect_mappings", roles: ["translate"], editors: ["figma"], evidence: ["translation-parity"], controlMuxPosture: "delegate" },
  ] as const satisfies readonly ProviderSurfaceEvidence[],
} as const;
