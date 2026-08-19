import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderWorkPlanSvg, selectRepresentation, validateWorkPlan } from "../../skills/figma-design-authoring/scripts/work-plan.mjs";

const plan = JSON.parse(readFileSync(new URL("../../work/agent-capability-upgrade/plan.json", import.meta.url), "utf8"));

describe("progressive Figma work plan", () => {
  it("validates the canonical graph and constrains deep context", () => {
    expect(validateWorkPlan(plan)).toEqual([]);
    expect(plan.contextPolicy.maxActiveDeepResources).toBeLessThanOrEqual(2);
    expect(plan.state).toBe("BLOCKED");
    expect(plan.frontier).toEqual([]);
  });

  it("selects a faithful visual representation from reasoning shape", () => {
    expect(selectRepresentation(plan, "sequence")).toBe("flow");
    expect(selectRepresentation(plan, "ownership")).toBe("typed-graph");
    expect(selectRepresentation(plan, "progress")).toBe("bar");
    expect(selectRepresentation(plan, "local-fact")).toBe("text");
    expect(selectRepresentation(plan, "unknown-shape")).toBe("text");
  });

  it("rejects context overload, dependency cycles, and a false ready frontier", () => {
    const invalid = structuredClone(plan);
    invalid.state = "ACTIVE";
    invalid.contextPolicy.maxActiveDeepResources = 10;
    const foundation = invalid.nodes.find((node) => node.id === "execution-contract");
    foundation.status = "PENDING";
    foundation.dependsOn = ["runtime-sdk"];
    invalid.frontier = ["runtime-sdk"];
    expect(validateWorkPlan(invalid)).toEqual(expect.arrayContaining([
      "maxActiveDeepResources must be 1-2",
      "dependency graph contains a cycle",
      "frontier node runtime-sdk has incomplete dependency execution-contract",
    ]));
  });

  it("renders an inspectable typed work graph instead of another prose plan", () => {
    const svg = renderWorkPlanSvg(plan);
    expect(svg).toContain("<svg");
    expect(svg).toContain("BLOCKS_TRUTH");
    expect(svg).toContain("Progressive execution contract");
    expect(svg).toContain("Current frontier: none (BLOCKED)");
  });
});
