import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const evals = JSON.parse(readFileSync(new URL("../../evals/agent-execution.json", import.meta.url), "utf8"));

describe("agent execution upgrade eval contract", () => {
  it("keeps mechanism proof separate from behavioral uplift", () => {
    expect(evals.status).toBe("MECHANISM_TESTED_BEHAVIORAL_COMPARISON_NOT_RUN");
    expect(evals.claims.behavioralSkillComparison).toBe("NOT_RUN");
    expect(evals.claims.obligationLedgerMechanism).toBe("IMPLEMENTED_TESTED_V3");
    expect(evals.claims.progressiveContextMechanism).toBe("PROMPT_METHOD_DEFINED_BEHAVIORAL_NOT_RUN");
    expect(evals.claims.representationSelectionMechanism).toBe("AGENT_JUDGMENT_BEHAVIORAL_NOT_RUN");
    expect(evals.claims.accountableMcpContext).toBe("IMPLEMENTED_TESTED_LOCAL");
    expect(evals.claims.liveRuntimeSdkExecution).toBe("EXECUTED_PASS_V2");
    expect(evals.claims.devResourceWrite).toBe("BLOCKED_BY_PROVIDER_403");
  });

  it("does not inject Skill routing, context-count, or representation-selection policy", () => {
    expect(evals.selectionPolicy).toBe("AGENT_SELECTED_OBSERVED_NOT_INJECTED");
    expect(evals.invariants.maxActiveDeepResources).toBeUndefined();
    expect(evals.invariants.skillSelectionMayBeInjectedByHarness).toBe(false);
    expect(evals.invariants.contextDepthMayBeNumericallyCappedByPlan).toBe(false);
    expect(evals.invariants.representationMayBeChosenByPlanScript).toBe(false);
    const serialized = JSON.stringify(evals.cases);
    expect(serialized).not.toContain("primaryOwner");
    expect(serialized).not.toContain("activateJustInTime");
  });

  it("freezes falsifiable outcome/process cases without prescribing capability selection", () => {
    const ids = new Set(evals.cases.map((item) => item.id));
    for (const required of ["multi-skill-dashboard", "small-direct-edit", "context-overload-recovery", "process-not-paragraph", "quantitative-progress", "dynamic-page-style-binding", "timeout-recovery", "cross-file-reuse", "required-obligation-closure", "mutation-context-omission", "iterative-grid-dashboard-edit"]) {
      expect(ids.has(required)).toBe(true);
    }
    for (const item of evals.cases) {
      expect(item.status).toBe("FROZEN_NOT_RUN");
      expect(item.failureSignals.length).toBeGreaterThanOrEqual(3);
      expect(item.expected.outcomeInvariants.length).toBeGreaterThan(0);
    }
  });
});
