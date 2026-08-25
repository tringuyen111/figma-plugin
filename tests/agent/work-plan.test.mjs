import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderWorkPlanSvg, validateWorkPlan } from "../../skills/figma-design-authoring/scripts/work-plan.mjs";

const readJson = (relativePath) => JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
const plan = readJson("../../skills/figma-design-authoring/templates/work-plan.json");
const schema = readJson("../../skills/figma-design-authoring/schemas/work-plan.schema.json");
const blockedPlan = readJson("../../evals/fixtures/work-plan.blocked.json");

describe("semantic Figma work plan", () => {
  it("validates v3 obligation state without routing or cognition policy", () => {
    expect(validateWorkPlan(plan)).toEqual([]);
    expect(schema.$id).toContain("figma-work-plan-v3");
    expect(plan.schemaVersion).toBe(3);
    expect(JSON.stringify(plan)).not.toContain("maxActiveDeepResources");
    expect(JSON.stringify(plan)).not.toContain("representationPolicy");
    expect(JSON.stringify(plan)).not.toContain('"specialists"');
    expect(JSON.stringify(plan)).not.toContain('"owner"');
    expect(plan.obligations[0]).toMatchObject({
      id: "req-first-packet",
      required: true,
      proofRequired: true,
      status: "ACTIVE",
    });
    expect(plan.nodes[0].obligationIds).toEqual(["req-first-packet"]);
    expect(plan.frontier).toEqual(["first-packet"]);
  });

  it("migrates a plan without an obligation ledger without inventing historical evidence", () => {
    expect(blockedPlan.schemaVersion).toBe(3);
    expect(blockedPlan.obligations).toBeUndefined();
    expect(validateWorkPlan(blockedPlan)).toEqual([]);
    expect(blockedPlan.state).toBe("BLOCKED");
    expect(blockedPlan.frontier).toEqual([]);
  });

  it("rejects machine routing fields, dependency cycles, and a false ready frontier", () => {
    const invalid = structuredClone(blockedPlan);
    invalid.state = "ACTIVE";
    invalid.maxActiveDeepResources = 2;
    const foundation = invalid.nodes.find((node) => node.id === "foundation");
    const frontier = invalid.nodes.find((node) => node.id === "blocked-frontier");
    foundation.owner = "figma-design-authoring";
    foundation.dependsOn = ["blocked-frontier"];
    frontier.status = "ACTIVE";
    invalid.frontier = ["blocked-frontier"];
    expect(validateWorkPlan(invalid)).toEqual(expect.arrayContaining([
      "plan contains unsupported field maxActiveDeepResources",
      "node foundation contains unsupported field owner",
      "dependency graph contains a cycle",
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

  it("rejects PASS claims without evidence references when the obligation ledger is active", () => {
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

  it("renders an inspectable work graph without Skill owner or numeric context policy", () => {
    const svg = renderWorkPlanSvg(blockedPlan);
    expect(svg).toContain("<svg");
    expect(svg).toContain("BLOCKS_TRUTH");
    expect(svg).toContain("Established foundation");
    expect(svg).toContain("Current frontier: none (BLOCKED)");
    expect(svg).toContain("semantic work state / evidence graph");
    expect(svg).not.toContain("max 2 deep resources");
  });
});
