import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { selectRepresentation } from "../../skills/figma-design-authoring/scripts/work-plan.mjs";

const evals = JSON.parse(readFileSync(new URL("../../evals/agent-execution.json", import.meta.url), "utf8"));
const plan = JSON.parse(readFileSync(new URL("../../work/agent-capability-upgrade/plan.json", import.meta.url), "utf8"));

describe("agent execution upgrade eval contract", () => {
  it("keeps mechanism proof separate from behavioral uplift", () => {
    expect(evals.status).toBe("MECHANISM_TESTED_BEHAVIORAL_COMPARISON_NOT_RUN");
    expect(evals.claims.behavioralSkillComparison).toBe("NOT_RUN");
    expect(evals.claims.liveRuntimeSdkExecution).toBe("EXECUTED_PASS_V2");
    expect(evals.claims.devResourceWrite).toBe("BLOCKED_BY_PROVIDER_403");
    expect(evals.invariants.maxActiveDeepResources).toBe(2);
  });

  it("freezes planning, overload, representation, recovery, and reuse cases", () => {
    const ids = new Set(evals.cases.map((item) => item.id));
    for (const required of ["multi-skill-dashboard", "small-direct-edit", "context-overload-recovery", "process-not-paragraph", "quantitative-progress", "dynamic-page-style-binding", "timeout-recovery", "cross-file-reuse"]) {
      expect(ids.has(required)).toBe(true);
    }
    for (const item of evals.cases) {
      expect(item.status).toBe("FROZEN_NOT_RUN");
      expect(item.failureSignals.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("aligns frozen representation expectations with the deterministic selector", () => {
    const shapeByCase = {
      "process-not-paragraph": "sequence",
      "quantitative-progress": "progress",
      "timeout-recovery": "state",
      "cross-file-reuse": "reusable-contract",
      "small-direct-edit": "local-fact"
    };
    for (const [id, shape] of Object.entries(shapeByCase)) {
      const item = evals.cases.find((candidate) => candidate.id === id);
      expect(selectRepresentation(plan, shape)).toBe(item.expected.representation);
    }
  });
});
