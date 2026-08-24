import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderWorkPlanSvg, selectRepresentation, validateWorkPlan } from "../../skills/figma-design-authoring/scripts/work-plan.mjs";

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
const plan = readJson("../../skills/figma-design-authoring/templates/work-plan.json");
const schema = readJson("../../skills/figma-design-authoring/schemas/work-plan.schema.json");
const legacyPlan = readJson("../../work/agent-capability-upgrade/plan.json");

describe("progressive Figma work plan", () => {
  it("validates the v2 obligation ledger and constrains deep context", () => {
    expect(validateWorkPlan(plan)).toEqual([]);
    expect(schema.$id).toContain("figma-work-plan-v2");
    expect(plan.schemaVersion).toBe(2);
    expect(plan.contextPolicy.maxActiveDeepResources).toBeLessThanOrEqual(2);
    expect(plan.obligations[0]).toMatchObject({
      id: "req-first-packet",
      required: true,
      proofRequired: true,
      status: "ACTIVE",
    });
    expect(plan.nodes[0].obligationIds).toEqual(["req-first-packet"]);
    expect(plan.frontier).toEqual(["first-packet"]);
  });

  it("keeps the historical v1 canonical plan readable during migration", () => {
    expect(validateWorkPlan(legacyPlan)).toEqual([]);
    expect(legacyPlan.state).toBe("BLOCKED");
    expect(legacyPlan.frontier).toEqual([]);
  });

  it("selects a faithful visual representation from reasoning shape", () => {
    expect(selectRepresentation(plan, "sequence")).toBe("flow");
    expect(selectRepresentation(plan, "ownership")).toBe("typed-graph");
    expect(selectRepresentation(plan, "progress")).toBe("bar");
    expect(selectRepresentation(plan, "local-fact")).toBe("text");
    expect(selectRepresentation(plan, "unknown-shape")).toBe("text");
  });

  it("rejects context overload, dependency cycles, and a false ready frontier", () => {
    const invalid = structuredClone(legacyPlan);
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

  it("rejects a required user obligation omitted from all plan nodes", () => {
    const invalid = structuredClone(plan);
    invalid.nodes[0].obligationIds = [];
    expect(validateWorkPlan(invalid)).toEqual(expect.arrayContaining([
      "node first-packet obligationIds are invalid",
      "required obligation req-first-packet is not covered by any node",
    ]));
  });

  it("rejects a false terminal PASS while a required obligation is unresolved", () => {
    const invalid = structuredClone(plan);
    invalid.state = "PASS";
    invalid.frontier = [];
    invalid.nodes[0].status = "PASS";
    invalid.nodes[0].evidenceRefs = ["evidence/node-proof.json"];
    expect(validateWorkPlan(invalid)).toContain("PASS plan has unresolved required obligation req-first-packet");
  });

  it("rejects non-canonical obligation and node owners", () => {
    const invalid = structuredClone(plan);
    invalid.obligations[0].owner = "generic-agent";
    invalid.nodes[0].owner = "generic-agent";
    expect(validateWorkPlan(invalid)).toEqual(expect.arrayContaining([
      "obligation req-first-packet owner is not canonical",
      "node first-packet owner is not canonical",
    ]));
  });

  it("rejects multiple ACTIVE nodes", () => {
    const invalid = structuredClone(plan);
    const second = structuredClone(invalid.nodes[0]);
    second.id = "second-packet";
    second.label = "Second accountable packet";
    invalid.nodes.push(second);
    invalid.frontier.push(second.id);
    expect(validateWorkPlan(invalid)).toContain("at most one node may be ACTIVE");
  });

  it("rejects BLOCKED truth without an explicit blocker", () => {
    const invalid = structuredClone(plan);
    invalid.state = "BLOCKED";
    invalid.frontier = [];
    invalid.obligations[0].status = "BLOCKED";
    invalid.obligations[0].blocker = "";
    invalid.nodes[0].status = "BLOCKED";
    invalid.nodes[0].blocker = "Waiting for required external authority.";
    expect(validateWorkPlan(invalid)).toContain("blocked obligation req-first-packet requires blocker");
  });

  it("rejects PASS claims without evidence references", () => {
    const invalid = structuredClone(plan);
    invalid.state = "PASS";
    invalid.frontier = [];
    invalid.obligations[0].status = "PASS";
    invalid.nodes[0].status = "PASS";
    expect(validateWorkPlan(invalid)).toEqual(expect.arrayContaining([
      "passed obligation req-first-packet requires evidenceRefs",
      "passed node first-packet requires evidenceRefs",
    ]));
  });

  it("rejects PASS claims whose evidence references do not exist", () => {
    const invalid = structuredClone(plan);
    invalid.state = "PASS";
    invalid.frontier = [];
    invalid.obligations[0].status = "PASS";
    invalid.obligations[0].evidenceRefs = ["does/not/exist.json"];
    invalid.nodes[0].status = "PASS";
    invalid.nodes[0].evidenceRefs = ["does/not/exist.json"];
    expect(validateWorkPlan(invalid)).toEqual(expect.arrayContaining([
      "passed obligation req-first-packet evidenceRef does not exist: does/not/exist.json",
      "passed node first-packet evidenceRef does not exist: does/not/exist.json",
    ]));
  });

  it("renders an inspectable typed work graph instead of another prose plan", () => {
    const svg = renderWorkPlanSvg(legacyPlan);
    expect(svg).toContain("<svg");
    expect(svg).toContain("BLOCKS_TRUTH");
    expect(svg).toContain("Progressive execution contract");
    expect(svg).toContain("Current frontier: none (BLOCKED)");
  });
});
