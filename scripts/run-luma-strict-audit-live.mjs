import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RuntimeClient, assert } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "luma-strict-audit-live" });
const traceRoot = `luma-strict-live:${Date.now()}`;
const evidenceDir = resolve("output/figma-evidence");
const factsPath = resolve(evidenceDir, `luma-strict-facts-${Date.now()}.json`);
const reportPath = resolve(evidenceDir, `luma-strict-audit-report-${Date.now()}.json`);
const profilePath = resolve("evals/fixtures/luma-bank-strict-audit.profile.json");
const profile = JSON.parse(await readFile(profilePath, "utf8"));

function operation(label, stepId) {
  return { label, kind: "read", phase: "verify", planId: "luma-strict-live", stepId, representation: "typed-graph", target: "Luma Bank / exact live snapshot", postconditions: ["Facts are read from the exact connected file and bundle"] };
}

async function query(kind, stepId, extra = {}) {
  return runtime.call("figma_query", { kind, ...extra, instanceId: instance.instanceId, pageId: instance.pageId, capability: "figma-verification", traceId: `${traceRoot}:${stepId}`, operation: operation(`Luma strict fact query: ${kind}`, stepId) });
}

let instance;
try {
  await runtime.connect();
  const status = await runtime.status(true);
  instance = runtime.resolveSingleInstance(status);
  assert(instance.bundleRevision === status.bundleRevision, "Companion/server bundle mismatch.");
  const manifest = await query("artifact_manifest", "manifest", { refresh: true });
  const facts = { manifest, componentIntegrity: await query("component_integrity", "components"), bindingInventory: await query("binding_inventory", "bindings"), prototypeGraph: await query("prototype_graph", "prototype"), motionSnapshot: await query("motion_snapshot", "motion"), accessibilityFacts: await query("accessibility_design_facts", "accessibility") };
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(factsPath, JSON.stringify(facts, null, 2));
  const factsHash = createHash("sha256").update(await readFile(factsPath)).digest("hex");
  const snapshotId = manifest.target.snapshotId;
  const observedAt = manifest.observedAt;
  const evidenceRef = { tool: "figma_query", observedAt, snapshotId, path: factsPath, sha256: factsHash };
  const claims = [
    { claimId: "T0", dimension: "runtime", applicability: "REQUIRED", required: true, status: "PASS", evidenceRefs: [evidenceRef], finding: { note: "Exact file/page/bundle/snapshot and full manifest coverage were read." } },
    { claimId: "C2", dimension: "system-reuse", applicability: "REQUIRED", required: true, status: "NOT_RUN", evidenceRefs: [], finding: { note: "Component facts were collected, but no independent reuse/publication acceptance was inferred." } },
    { claimId: "V3", dimension: "system-reuse", applicability: "REQUIRED", required: true, status: "NOT_RUN", evidenceRefs: [], finding: { note: "Binding facts were collected; drift/consumer acceptance is not issued by runtime." } },
    { claimId: "P5", dimension: "interaction", applicability: "REQUIRED", required: true, status: "NOT_RUN", evidenceRefs: [], finding: { note: "Prototype graph facts do not prove playback or user path execution." } },
    { claimId: "M6", dimension: "temporal", applicability: "REQUIRED", required: true, status: "NOT_RUN", evidenceRefs: [], finding: { note: "Motion snapshot facts do not prove rendered phase review." } },
    { claimId: "A8", dimension: "accessibility", applicability: "REQUIRED", required: true, status: "NOT_RUN", evidenceRefs: [], finding: { note: "Design facts do not prove keyboard, screen-reader, or AT runtime behavior." } },
    { claimId: "Q11", dimension: "strict-evidence", applicability: "REQUIRED", required: true, status: "PASS", evidenceRefs: [evidenceRef], finding: { note: "The report is bound to an exact target/snapshot and hashed evidence package." } },
  ];
  const report = {
    schemaVersion: 1,
    kind: "AuditReport",
    target: { instanceId: instance.instanceId, fileKey: manifest.target.fileKey ?? null, fileName: manifest.target.fileName, pageIds: manifest.facts.pages.map((page) => page.id), bundleRevision: manifest.target.bundleRevision, snapshotId, observedAt },
    expectedTruth: profile.expectedTruth,
    claims,
    dimensions: { runtime: "PASS", structure: "NOT_RUN", "system-reuse": "NOT_RUN", visual: "NOT_RUN", interaction: "NOT_RUN", temporal: "NOT_RUN", accessibility: "NOT_RUN" },
    boundedVerdict: "NOT_RUN",
    limitations: ["No Figma UI edit was automated; live UI behavior, AT, playback, publication and UAT remain NOT_RUN.", "This is an executed AuditReport, not the AuditProfile/checklist itself."],
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify({ status: "LUMA_AUDIT_REPORT_WRITTEN", factsPath, reportPath, target: report.target, boundedVerdict: report.boundedVerdict })}\n`);
} finally {
  await runtime.close();
}
