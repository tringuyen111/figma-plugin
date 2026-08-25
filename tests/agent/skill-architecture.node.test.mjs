import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as workPlanModule from "../../skills/figma-design-authoring/scripts/work-plan.mjs";

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const readText = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const template = readJson("../../skills/figma-design-authoring/templates/work-plan.json");
const schema = readJson("../../skills/figma-design-authoring/schemas/work-plan.schema.json");
const blockedPlan = readJson("../../evals/fixtures/work-plan.blocked.json");
const evals = readJson("../../evals/agent-execution.json");
const capabilityGate = readText("../../scripts/check-capabilities.mjs");

function assertNoRoutingFields(value, label) {
  const serialized = JSON.stringify(value);
  for (const forbidden of ["maxActiveDeepResources", "representationPolicy", '"owner"', '"specialists"']) {
    assert.equal(serialized.includes(forbidden), false, `${label} must not encode ${forbidden}`);
  }
}

test("work-plan v3 persists work truth without Skill routing or cognition policy", () => {
  assert.equal(template.schemaVersion, 3);
  assert.match(schema.$id, /figma-work-plan-v3/);
  assert.equal(workPlanModule.selectRepresentation, undefined);
  assertNoRoutingFields(schema, "schema");
  assertNoRoutingFields(template, "template");
  assert.deepEqual(workPlanModule.validateWorkPlan(template), []);
});

test("frozen work-plan fixtures preserve semantic state without Skill-route fields", () => {
  for (const [label, plan] of [["template", template], ["blocked", blockedPlan]]) {
    assert.equal(plan.schemaVersion, 3, `${label} plan schemaVersion`);
    assertNoRoutingFields(plan, `${label} plan`);
    assert.deepEqual(workPlanModule.validateWorkPlan(plan), []);
  }
});

test("behavioral eval observes outcomes instead of prescribing Skill activation", () => {
  assert.equal(evals.invariants.maxActiveDeepResources, undefined);
  assert.equal(evals.selectionPolicy, "AGENT_SELECTED_OBSERVED_NOT_INJECTED");
  for (const item of evals.cases) {
    const expected = item.expected ?? {};
    assert.equal("primaryOwner" in expected, false, `${item.id} primaryOwner must not be prescribed`);
    assert.equal("activateJustInTime" in expected, false, `${item.id} activation list must not be prescribed`);
    assert.ok(Array.isArray(expected.outcomeInvariants) && expected.outcomeInvariants.length > 0, `${item.id} needs outcome invariants`);
  }
});

test("capability gate does not lock Skill prose with literal content assertions", () => {
  const forbidden = [
    "just-in-time specialist activation",
    "representation compiler",
    "compose `figma-layout`",
    "compose `figma-tokens`",
    "compose `figma-typography`",
    "## Decision advantage",
    "## Skill I/O contract",
    "proofMarkers ?? []",
  ];
  for (const marker of forbidden) assert.equal(capabilityGate.includes(marker), false, `prompt literal gate remains: ${marker}`);
});
