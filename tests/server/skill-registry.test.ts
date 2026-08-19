import { describe, expect, it } from "vitest";
import { EVIDENCE_DIMENSIONS, FIGMA_SKILLS, FIGMA_SKILL_IDS } from "../../src/capabilities/skill-registry.js";
import { FIGMA_PROVIDER_EVIDENCE } from "../../src/capabilities/provider-evidence.js";

describe("Figma Skill registry", () => {
  it("has one unique canonical identity per installed capability", () => {
    expect(FIGMA_SKILL_IDS).toHaveLength(16);
    expect(new Set(FIGMA_SKILL_IDS).size).toBe(FIGMA_SKILL_IDS.length);
    expect(FIGMA_SKILLS.every((skill) => skill.accountableOutcome.length > 20)).toBe(true);
    expect(FIGMA_SKILLS.every((skill) => skill.editors.length > 0)).toBe(true);
  });

  it("distinguishes runtime editor support from deep Figma Design methodology", () => {
    expect(FIGMA_SKILLS.find((skill) => skill.id === "figma-native")?.editors).toEqual(["figma", "figjam", "slides"]);
    expect(FIGMA_SKILLS.find((skill) => skill.id === "figma-layout")?.editors).toEqual(["figma"]);
  });

  it("declares only known evidence dimensions", () => {
    const valid = new Set(EVIDENCE_DIMENSIONS);
    for (const skill of FIGMA_SKILLS) {
      for (const dimension of [...skill.evidence.required, ...(skill.evidence.conditional ?? [])]) {
        expect(valid.has(dimension)).toBe(true);
      }
    }
  });

  it("keeps provider tool names out of package capability identity", () => {
    const ids = FIGMA_SKILL_IDS.join(",");
    expect(ids).not.toContain("use_figma");
    expect(ids).not.toContain("get_design_context");
    expect(ids).not.toContain("figma_exec");
  });

  it("keeps provider surfaces as a revalidated evidence snapshot", () => {
    expect(FIGMA_PROVIDER_EVIDENCE.source).toBe("connected-tool-schema");
    expect(FIGMA_PROVIDER_EVIDENCE.runtimeRevalidationRequired).toBe(true);
    expect(FIGMA_PROVIDER_EVIDENCE.surfaces.some((surface) => surface.id === "export_video")).toBe(true);
    expect(FIGMA_PROVIDER_EVIDENCE.surfaces.some((surface) => surface.id === "download_assets")).toBe(true);
    expect(FIGMA_PROVIDER_EVIDENCE.surfaces.some((surface) => surface.id === "upload_assets")).toBe(true);
  });
});
