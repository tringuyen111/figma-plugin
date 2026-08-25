import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RuntimeClient, assert, textPayload } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "figma-typed-crud-live" });
const traceRoot = `typed-crud-live:${Date.now()}`;
const rootControlId = `crud-lab-root-${Date.now().toString(36)}`;
const textControlId = `crud-lab-text-${Date.now().toString(36)}`;
const cloneControlId = `crud-lab-clone-${Date.now().toString(36)}`;
const evidenceDir = resolve("output/figma-evidence");
const evidencePath = resolve(evidenceDir, `typed-crud-live-${Date.now()}.json`);
const imagePath = resolve(evidenceDir, `typed-crud-live-${Date.now()}.png`);
const evidence = { kind: "TypedCrudLiveEvidence", schemaVersion: 1, target: null, bundleRevision: null, uiEdit: { status: "NOT_RUN", reason: "Requires an actual user edit in the Figma canvas; no desktop input automation is used." }, steps: [], cleanup: null };
let instance;
let rootNodeId;

function targetLabel() { return evidence.target ? `${evidence.target.fileName} / ${evidence.target.pageName}` : "Figma current target"; }
function targetArgs(extra = {}) { return { instanceId: instance.instanceId, pageId: instance.pageId, ...extra }; }
function op(label, kind, phase, stepId, representation = "typed-graph") {
  return { label, kind, phase, planId: "typed-crud-live", stepId, representation, target: targetLabel(), postconditions: ["Exact target is read back from the Figma document"] };
}

async function query(kind, stepId, extra = {}) {
  const result = await runtime.call("figma_query", { kind, ...targetArgs(extra), capability: "figma-verification", traceId: `${traceRoot}:${stepId}`, operation: op(`Typed CRUD live query: ${kind}`, "read", "verify", stepId) });
  evidence.steps.push({ stepId, result });
  return result;
}

async function typedApply(patches, stepId, conflictPolicy = "merge_non_overlapping") {
  const base = { action: "apply_entity_patch", patches, conflictPolicy, ...targetArgs(), capability: "figma-native", traceId: `${traceRoot}:${stepId}`, attempt: 1 };
  const plan = await runtime.call("figma_apply", { ...base, dryRun: true, operation: op(`Plan ${stepId}`, "write", "plan", `${stepId}-plan`) });
  const raw = await runtime.callRaw("figma_apply", { ...base, patches: plan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: plan.plan.planHash, resultMode: "receipt", operation: op(`Execute ${stepId}`, "write", "execute", stepId) });
  if (raw.isError === true) throw new Error(`Typed apply ${stepId} failed: ${JSON.stringify(textPayload(raw))}`);
  const result = textPayload(raw);
  evidence.steps.push({ stepId, plan: plan.plan, result });
  return result;
}

async function deleteOwned(controlId, stepId) {
  const result = await typedApply([{ kind: "delete", entityKind: "node", target: { controlId }, allowDelete: true }], stepId, "reject");
  return result;
}

try {
  await runtime.connect();
  const status = await runtime.status(true);
  instance = runtime.resolveSingleInstance(status);
  assert(instance.runtimeSdks?.includes("v2"), "Connected companion does not expose Runtime SDK v2.");
  assert(instance.bundleRevision === status.bundleRevision, "Companion and server bundle revisions differ.");
  evidence.target = { instanceId: instance.instanceId, fileName: instance.fileName, pageId: instance.pageId, pageName: instance.pageName };
  evidence.bundleRevision = instance.bundleRevision;

  await query("artifact_manifest", "manifest-before", { refresh: true });
  const root = await typedApply([{ kind: "create", entityKind: "node", entityType: "FRAME", controlId: rootControlId, properties: { name: "Typed CRUD Control Lab", x: 100, y: 100, width: 360, height: 220, layoutMode: "VERTICAL", primaryAxisSizingMode: "FIXED", counterAxisSizingMode: "FIXED", paddingTop: 24, paddingRight: 24, paddingBottom: 24, paddingLeft: 24, itemSpacing: 12 } }], "create-root");
  rootNodeId = root.changedEntities?.[0]?.id;
  assert(rootNodeId && root.changedEntities?.[0]?.controlId === rootControlId, "Root controlId/readback missing.");
  const text = await typedApply([{ kind: "create", entityKind: "node", entityType: "TEXT", controlId: textControlId, parent: { controlId: rootControlId }, properties: { name: "Typed CRUD Label", characters: "MCP Seed Label", fontSize: 24 } }], "create-text");
  assert(text.changedEntities?.[0]?.controlId === textControlId, "Text controlId/readback missing.");
  const graph = await query("entity_graph", "graph-after-create", { logicalId: rootControlId, scope: "node", projection: ["scene", "layout", "text", "metadata"], limit: 200 });
  assert(graph.facts?.items?.some((item) => item.controlId === rootControlId), "Typed graph omitted created root.");

  const geometry = await typedApply([{ kind: "update", entityKind: "node", target: { controlId: rootControlId }, set: { x: 180, y: 140 } }], "update-geometry");
  const afterGeometry = await query("entity_graph", "readback-geometry", { logicalId: rootControlId, scope: "node", projection: ["scene", "text", "metadata"], limit: 20 });
  assert(afterGeometry.facts?.items?.[0]?.x === 180 && afterGeometry.facts?.items?.[0]?.y === 140, "Geometry readback did not match typed update.");
  evidence.steps.push({ stepId: "non-overlap-preservation", result: geometry, textValue: "MCP Seed Label", note: "No UI edit was performed; this proves typed geometry does not target text." });

  const stalePlan = await runtime.call("figma_apply", { action: "apply_entity_patch", patches: [{ kind: "update", entityKind: "node", target: { controlId: rootControlId }, set: { x: 240 } }], dryRun: true, ...targetArgs(), capability: "figma-native", traceId: `${traceRoot}:stale-plan`, operation: op("Plan stale typed conflict", "write", "plan", "stale-plan") });
  await typedApply([{ kind: "update", entityKind: "node", target: { controlId: rootControlId }, set: { x: 260 } }], "intervening-update");
  const conflict = await runtime.callRaw("figma_apply", { action: "apply_entity_patch", patches: stalePlan.plan.patches, dryRun: false, confirm: true, expectedPlanHash: stalePlan.plan.planHash, conflictPolicy: "merge_non_overlapping", ...targetArgs(), capability: "figma-native", traceId: `${traceRoot}:stale-execute`, operation: op("Execute stale typed conflict", "write", "execute", "stale-execute") });
  const conflictPayload = textPayload(conflict);
  assert(conflict.isError === true && conflictPayload.code === "DRIFT_CONFLICT", `Expected DRIFT_CONFLICT, got ${JSON.stringify(conflictPayload)}`);
  evidence.steps.push({ stepId: "stale-conflict", plan: stalePlan.plan, result: conflictPayload, expected: "DRIFT_CONFLICT" });
  await typedApply([{ kind: "update", entityKind: "node", target: { controlId: rootControlId }, set: { x: 240 } }], "replan-after-conflict");

  const clone = await typedApply([{ kind: "clone", entityKind: "node", target: { controlId: rootControlId }, controlId: cloneControlId }], "clone-root");
  assert(clone.changedEntities?.[0]?.controlId !== rootControlId, "Clone controlId was not forked.");
  await typedApply([{ kind: "move", entityKind: "node", target: { controlId: cloneControlId }, parent: { controlId: rootControlId }, index: 0 }], "move-clone");
  await deleteOwned(cloneControlId, "delete-clone");

  const exportRaw = await runtime.callRaw("figma_export", { nodeId: rootNodeId, format: "PNG", constraint: { type: "SCALE", value: 1 }, contentsOnly: true, colorProfile: "SRGB", filename: "typed-crud-live", instanceId: instance.instanceId, pageId: instance.pageId, capability: "figma-verification", traceId: `${traceRoot}:export`, operation: { ...op("Export typed CRUD evidence", "export", "verify", "export", "artifact"), postconditions: ["PNG is persisted from the exact typed root"] } }, 330_000);
  assert(exportRaw.isError !== true, `Export failed: ${JSON.stringify(textPayload(exportRaw))}`);
  const exportPayload = textPayload(exportRaw);
  const artifact = exportRaw.structuredContent?.artifact || exportPayload.artifact;
  if (artifact?.path) { await mkdir(evidenceDir, { recursive: true }); await copyFile(artifact.path, imagePath); }
  evidence.steps.push({ stepId: "export", artifact: { ...artifact, copiedEvidencePath: artifact?.path ? imagePath : null } });
  await deleteOwned(rootControlId, "cleanup-root");
  evidence.cleanup = { status: "COMMITTED", rootControlId, textControlId, cloneControlId };
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  process.stdout.write(`${JSON.stringify({ status: "MCP_TYPED_CRUD_LIVE", evidencePath, imagePath: artifact?.path ? imagePath : null, target: evidence.target, bundleRevision: evidence.bundleRevision })}\n`);
} finally {
  if (instance && rootNodeId && !evidence.cleanup) {
    try { await deleteOwned(rootControlId, "emergency-cleanup-root"); } catch { /* preserve provider evidence; report cleanup state below */ }
  }
  await runtime.close();
}
