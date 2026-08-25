import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTrajectoryRecorder } from "./lib/trajectory-evidence.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const temp = await mkdtemp(join(tmpdir(), "figma-trajectory-gate-"));
try {
  const recorder = createTrajectoryRecorder({
    runId: "capability-gate",
    caseId: "fixture",
    compactPath: join(temp, "compact.jsonl"),
    rawPath: join(temp, "raw.jsonl"),
    provenance: {
      candidate: { archiveSha256: "fixture" },
      runner: { name: "check-trajectory-evidence", version: "1" },
      model: { state: "NOT_RUN", id: null },
      runtime: { state: "NOT_RUN", bundleRevision: null },
    },
  });
  await recorder.writeTool("query", "OBSERVED", {
    tool: "figma_query",
    arguments: { kind: "structure", traceId: "gate:query", operation: { planId: "gate", stepId: "query", representation: "tree" } },
    result: { status: "success", result: { facts: { items: [{ id: "1:2" }] }, base64: "redact-me" } },
    elapsedMs: 1,
  });
  const snapshot = recorder.snapshot();
  if (snapshot.toolCalls !== 1 || snapshot.queryCalls !== 1 || snapshot.rawExecEscapes !== 0 || snapshot.provenance.model.state !== "NOT_RUN") {
    throw new Error(`Trajectory summary fixture is invalid: ${JSON.stringify(snapshot)}`);
  }

  const compact = await readFile(join(temp, "compact.jsonl"), "utf8");
  const raw = await readFile(join(temp, "raw.jsonl"), "utf8");
  if (!compact.includes('"kind":"AgentTrajectoryEntry"') || compact.includes("redact-me")) throw new Error("Compact trajectory is not bounded/redacted.");
  if (!raw.includes('"kind":"AgentTrajectoryRawEntry"') || !raw.includes('"redacted":true')) throw new Error("Raw sidecar is not inspectably sanitized.");

  const contractDoc = await readFile(resolve(root, "docs/TRAJECTORY-EVIDENCE.md"), "utf8");
  for (const marker of ["--candidate-sha256", "--bundle-revision", "does not qualify an exact candidate", "behavioral claims remain `NOT_RUN`"]) {
    if (!contractDoc.includes(marker)) throw new Error(`Trajectory evidence contract is missing truth/provenance marker: ${marker}`);
  }
  const agentExecution = JSON.parse(await readFile(resolve(root, "evals/agent-execution.json"), "utf8"));
  if (agentExecution.claims?.observableTrajectoryEvidence !== "IMPLEMENTED_TESTED_LOCAL" || agentExecution.claims?.behavioralSkillComparison !== "NOT_RUN") {
    throw new Error("Agent execution eval must mark trajectory infrastructure local-tested while behavioral Skill comparison remains NOT_RUN.");
  }
  for (const evidencePath of ["tests/agent/trajectory-evidence.node.test.mjs", "scripts/check-trajectory-evidence.mjs"]) {
    if (!agentExecution.mechanismEvidence?.includes(evidencePath)) throw new Error(`Agent execution eval is missing P3-Q1 mechanism evidence: ${evidencePath}`);
  }

  process.stdout.write(`${JSON.stringify({ status: "PASS", recorder: "compact+raw", behavioralComparison: "NOT_RUN" })}\n`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
