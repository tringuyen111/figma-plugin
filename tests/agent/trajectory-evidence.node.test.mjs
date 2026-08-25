import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createTrajectoryRecorder,
  sanitizeEvidenceValue,
  serializedJsonBytes,
  stablePayloadHash,
} from "../../scripts/lib/trajectory-evidence.mjs";

async function readJsonl(path) {
  const source = await readFile(path, "utf8");
  return source.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

test("trajectory recorder separates bounded compact evidence from inspectable raw evidence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "figma-trajectory-"));
  try {
    const compactPath = join(dir, "run.trajectory.jsonl");
    const rawPath = join(dir, "run.raw.jsonl");
    const recorder = createTrajectoryRecorder({
      runId: "run-1",
      caseId: "iterative-grid-dashboard-edit",
      compactPath,
      rawPath,
      provenance: {
        candidate: { archiveSha256: "sha256:abc", sourceRevision: null },
        runner: { name: "node-test", version: "1" },
        model: { state: "NOT_RUN", id: null },
        runtime: { state: "NOT_RUN", bundleRevision: null, protocolVersion: null, instanceId: null },
      },
    });

    const originalArgs = {
      kind: "entity_graph",
      traceId: "trace:1",
      operation: { planId: "plan-1", stepId: "read-grid", representation: "table", phase: "verify" },
      nested: { base64: "SHOULD_NOT_SURVIVE", keep: "yes" },
    };
    const originalResult = {
      status: "success",
      result: {
        coverage: { returned: 40, total: 40, truncated: false },
        facts: { items: Array.from({ length: 40 }, (_, index) => ({ id: `node-${index + 1}`, name: `Card ${index + 1}` })) },
        bytes: "BINARY_BODY",
      },
    };
    const argsBefore = structuredClone(originalArgs);
    const resultBefore = structuredClone(originalResult);

    await recorder.write("session-start", "OBSERVED", { note: "start" });
    await recorder.writeTool("read-grid", "OBSERVED", {
      tool: "figma_query",
      arguments: originalArgs,
      result: originalResult,
      elapsedMs: 12.5,
    });

    assert.deepEqual(originalArgs, argsBefore, "sanitization must not mutate caller arguments");
    assert.deepEqual(originalResult, resultBefore, "sanitization must not mutate caller results");

    const compact = await readJsonl(compactPath);
    const raw = await readJsonl(rawPath);
    assert.equal(compact.length, 2);
    assert.equal(raw.length, 2);
    assert.equal(compact[1].kind, "AgentTrajectoryEntry");
    assert.equal(raw[1].kind, "AgentTrajectoryRawEntry");
    assert.equal(compact[1].sequence, raw[1].sequence);
    assert.equal(compact[1].tool, "figma_query");
    assert.equal(compact[1].queryKind, "entity_graph");
    assert.equal(compact[1].traceId, "trace:1");
    assert.equal(compact[1].operation.planId, "plan-1");
    assert.equal(compact[1].requestBytes, serializedJsonBytes(originalArgs));
    assert.equal(compact[1].responseBytes, serializedJsonBytes(originalResult));
    assert.equal(compact[1].requestHash, stablePayloadHash(sanitizeEvidenceValue(originalArgs)));
    assert.equal(compact[1].responseHash, stablePayloadHash(sanitizeEvidenceValue(originalResult)));
    assert.equal(raw[1].request.arguments.nested.base64.redacted, true);
    assert.equal(raw[1].response.result.result.bytes.redacted, true);
    assert.ok(JSON.stringify(compact[1]).length < JSON.stringify(raw[1]).length / 2, "compact step should remain materially smaller than raw evidence");
    assert.ok((compact[1].affectedIds ?? []).length <= 16, "compact identity summary must be bounded");
    assert.equal(JSON.stringify(compact[1]).includes("Card 40"), false, "compact evidence must not copy the full result corpus");

    const snapshot = recorder.snapshot();
    assert.equal(snapshot.runId, "run-1");
    assert.equal(snapshot.caseId, "iterative-grid-dashboard-edit");
    assert.equal(snapshot.toolCalls, 1);
    assert.equal(snapshot.queryCalls, 1);
    assert.equal(snapshot.applyCalls, 0);
    assert.equal(snapshot.rawExecEscapes, 0);
    assert.equal(snapshot.requestBytes, serializedJsonBytes(originalArgs));
    assert.equal(snapshot.responseBytes, serializedJsonBytes(originalResult));
    assert.equal(snapshot.provenance.model.state, "NOT_RUN");
    assert.equal(snapshot.provenance.runtime.state, "NOT_RUN");
    assert.equal(snapshot.provenance.candidate.archiveSha256, "sha256:abc");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("trajectory recorder counts explicit retry/requery tags and raw figma_exec escapes only from observed calls", async () => {
  const dir = await mkdtemp(join(tmpdir(), "figma-trajectory-counts-"));
  try {
    const recorder = createTrajectoryRecorder({
      runId: "run-2",
      caseId: null,
      compactPath: join(dir, "compact.jsonl"),
      rawPath: join(dir, "raw.jsonl"),
      provenance: { candidate: { archiveSha256: null }, runner: { name: "node-test", version: "1" } },
    });
    await recorder.writeTool("raw-edit", "OBSERVED", {
      tool: "figma_exec",
      arguments: { code: "return 1", traceId: "trace:exec" },
      result: { ok: true },
      elapsedMs: 2,
      tags: { retry: true },
    });
    await recorder.writeTool("readback", "OBSERVED", {
      tool: "figma_query",
      arguments: { kind: "structure" },
      result: { result: { id: "1:2" } },
      elapsedMs: 3,
      tags: { requery: true },
    });
    const snapshot = recorder.snapshot();
    assert.equal(snapshot.toolCalls, 2);
    assert.equal(snapshot.rawExecEscapes, 1);
    assert.equal(snapshot.retryCalls, 1);
    assert.equal(snapshot.requeryCalls, 1);
    assert.equal(snapshot.queryCalls, 1);
    assert.equal(snapshot.execCalls, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("runtime provenance can be observed later without upgrading the model claim", async () => {
  const dir = await mkdtemp(join(tmpdir(), "figma-trajectory-provenance-"));
  try {
    const recorder = createTrajectoryRecorder({
      runId: "run-3",
      compactPath: join(dir, "compact.jsonl"),
      rawPath: join(dir, "raw.jsonl"),
      provenance: {
        candidate: { archiveSha256: "sha256:current" },
        runner: { name: "live-recipe", version: "1" },
        model: { state: "NOT_RUN", id: null },
        runtime: { state: "NOT_RUN", bundleRevision: "expected" },
      },
    });
    recorder.observeProvenance({ runtime: { state: "OBSERVED", bundleRevision: "expected", protocolVersion: 10, instanceId: "instance-1" } });
    const snapshot = recorder.snapshot();
    assert.equal(snapshot.provenance.runtime.state, "OBSERVED");
    assert.equal(snapshot.provenance.runtime.protocolVersion, 10);
    assert.equal(snapshot.provenance.runtime.instanceId, "instance-1");
    assert.equal(snapshot.provenance.model.state, "NOT_RUN");
    assert.equal(snapshot.provenance.candidate.archiveSha256, "sha256:current");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
