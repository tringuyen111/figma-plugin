import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const COMPACT_ARRAY_LIMIT = 12;
const COMPACT_STRING_LIMIT = 320;
const COMPACT_DEPTH_LIMIT = 5;
const AFFECTED_ID_LIMIT = 16;
const REDACTED_KEYS = new Set(["bytes", "base64"]);
const DATA_URL_PREFIX = /^data:[^;,]+;base64,/i;

export function serializedJsonBytes(value) {
  const source = JSON.stringify(value);
  return Buffer.byteLength(source === undefined ? "null" : source, "utf8");
}

export function stablePayloadHash(value) {
  const canonical = canonicalize(value);
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function sanitizeEvidenceValue(value, depth = 0) {
  if (depth > 32) return { redacted: true, reason: "max-depth" };
  if (value === null || value === undefined || typeof value === "boolean") return value ?? null;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (typeof value === "string") {
    if (DATA_URL_PREFIX.test(value)) return { redacted: true, kind: "base64-data-url", chars: value.length };
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { redacted: true, kind: "binary", bytes: value.byteLength };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeEvidenceValue(item, depth + 1));
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (REDACTED_KEYS.has(key)) {
        output[key] = redactOpaque(item, key);
      } else {
        output[key] = sanitizeEvidenceValue(item, depth + 1);
      }
    }
    return output;
  }
  return String(value);
}

export function createTrajectoryRecorder({ runId, caseId = null, compactPath, rawPath, provenance = {} }) {
  requireNonEmpty(runId, "runId");
  requireNonEmpty(compactPath, "compactPath");
  requireNonEmpty(rawPath, "rawPath");
  if (compactPath === rawPath) throw new TypeError("compactPath and rawPath must be different files.");

  let sequence = 0;
  const counters = {
    toolCalls: 0,
    queryCalls: 0,
    applyCalls: 0,
    execCalls: 0,
    exportCalls: 0,
    statusCalls: 0,
    rawExecEscapes: 0,
    retryCalls: 0,
    requeryCalls: 0,
    requestBytes: 0,
    responseBytes: 0,
    stateCounts: {},
    toolCounts: {},
  };
  let currentProvenance = normalizeProvenance(provenance);

  async function append(path, entry) {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(entry)}\n`, { encoding: "utf8", flag: "a" });
  }

  async function write(stepId, state, data = null) {
    requireNonEmpty(stepId, "stepId");
    requireNonEmpty(state, "state");
    sequence += 1;
    countState(counters.stateCounts, state);
    const sanitized = sanitizeEvidenceValue(data);
    const dataHash = stablePayloadHash(sanitized);
    const rawEntry = {
      schemaVersion: 1,
      kind: "AgentTrajectoryRawEntry",
      runId,
      caseId,
      sequence,
      observedAt: new Date().toISOString(),
      eventKind: "event",
      stepId,
      state,
      dataHash,
      data: sanitized,
    };
    const compactEntry = {
      schemaVersion: 1,
      kind: "AgentTrajectoryEntry",
      runId,
      caseId,
      sequence,
      observedAt: rawEntry.observedAt,
      eventKind: "event",
      stepId,
      state,
      dataHash,
      summary: compactValue(sanitized),
    };
    await append(rawPath, rawEntry);
    await append(compactPath, compactEntry);
    return compactEntry;
  }

  async function writeTool(stepId, state, { tool, arguments: arguments_ = {}, result = null, elapsedMs = null, tags = {} }) {
    requireNonEmpty(stepId, "stepId");
    requireNonEmpty(state, "state");
    requireNonEmpty(tool, "tool");
    sequence += 1;
    countState(counters.stateCounts, state);
    counters.toolCalls += 1;
    counters.toolCounts[tool] = (counters.toolCounts[tool] ?? 0) + 1;
    if (tool === "figma_query") counters.queryCalls += 1;
    if (tool === "figma_apply") counters.applyCalls += 1;
    if (tool === "figma_exec") {
      counters.execCalls += 1;
      counters.rawExecEscapes += 1;
    }
    if (tool === "figma_export") counters.exportCalls += 1;
    if (tool === "figma_status") counters.statusCalls += 1;
    if (tags?.retry === true) counters.retryCalls += 1;
    if (tags?.requery === true) counters.requeryCalls += 1;

    const requestBytes = serializedJsonBytes(arguments_);
    const responseBytes = serializedJsonBytes(result);
    counters.requestBytes += requestBytes;
    counters.responseBytes += responseBytes;

    const sanitizedArguments = sanitizeEvidenceValue(arguments_);
    const sanitizedResult = sanitizeEvidenceValue(result);
    const requestHash = stablePayloadHash(sanitizedArguments);
    const responseHash = stablePayloadHash(sanitizedResult);
    const observedAt = new Date().toISOString();
    const normalizedElapsed = typeof elapsedMs === "number" && Number.isFinite(elapsedMs) && elapsedMs >= 0 ? elapsedMs : null;
    const operation = compactOperation(arguments_?.operation);
    const traceId = typeof arguments_?.traceId === "string" ? arguments_.traceId : null;
    const affectedIds = collectAffectedIds(result);

    const rawEntry = {
      schemaVersion: 1,
      kind: "AgentTrajectoryRawEntry",
      runId,
      caseId,
      sequence,
      observedAt,
      eventKind: "tool",
      stepId,
      state,
      tool,
      elapsedMs: normalizedElapsed,
      tags: normalizeTags(tags),
      request: { bytes: requestBytes, hash: requestHash, arguments: sanitizedArguments },
      response: { bytes: responseBytes, hash: responseHash, result: sanitizedResult },
    };
    const compactEntry = {
      schemaVersion: 1,
      kind: "AgentTrajectoryEntry",
      runId,
      caseId,
      sequence,
      observedAt,
      eventKind: "tool",
      stepId,
      state,
      tool,
      queryKind: tool === "figma_query" && typeof arguments_?.kind === "string" ? arguments_.kind : null,
      applyAction: tool === "figma_apply" && typeof arguments_?.action === "string" ? arguments_.action : null,
      traceId,
      operation,
      elapsedMs: normalizedElapsed,
      requestBytes,
      responseBytes,
      requestHash,
      responseHash,
      tags: normalizeTags(tags),
      affectedIds,
      result: compactToolResult(result),
    };
    await append(rawPath, rawEntry);
    await append(compactPath, compactEntry);
    return compactEntry;
  }

  function observeProvenance(partial) {
    currentProvenance = deepMerge(currentProvenance, sanitizeEvidenceValue(partial ?? {}));
    return structuredClone(currentProvenance);
  }

  function snapshot() {
    return {
      schemaVersion: 1,
      kind: "AgentTrajectorySummary",
      runId,
      caseId,
      sequence,
      compactPath,
      rawPath,
      ...structuredClone(counters),
      provenance: structuredClone(currentProvenance),
      counterBasis: {
        retryCalls: "explicit tags.retry=true only",
        requeryCalls: "explicit tags.requery=true only",
        rawExecEscapes: "observed figma_exec calls only",
        requestResponseBytes: "JSON UTF-8 bytes at recipe/client payload boundary",
      },
    };
  }

  return { write, writeTool, observeProvenance, snapshot };
}

function normalizeProvenance(value) {
  const sanitized = sanitizeEvidenceValue(value ?? {});
  return {
    candidate: sanitized.candidate ?? { archiveSha256: null, sourceRevision: null },
    runner: sanitized.runner ?? { name: null, version: null },
    model: sanitized.model ?? { state: "NOT_RUN", id: null },
    runtime: sanitized.runtime ?? { state: "NOT_RUN", bundleRevision: null, protocolVersion: null, instanceId: null },
    ...sanitized,
  };
}

function deepMerge(left, right) {
  if (!isPlainObject(left) || !isPlainObject(right)) return structuredClone(right);
  const output = structuredClone(left);
  for (const [key, value] of Object.entries(right)) {
    output[key] = isPlainObject(output[key]) && isPlainObject(value) ? deepMerge(output[key], value) : structuredClone(value);
  }
  return output;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value) && !(value instanceof Uint8Array);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function redactOpaque(value, key) {
  let size = null;
  if (typeof value === "string") size = value.length;
  else if (Buffer.isBuffer(value) || value instanceof Uint8Array) size = value.byteLength;
  else if (Array.isArray(value)) size = value.length;
  return { redacted: true, kind: key, size };
}

function compactValue(value, depth = 0) {
  if (depth > COMPACT_DEPTH_LIMIT) return "[MaxDepth]";
  if (value === null || value === undefined || typeof value === "boolean" || typeof value === "number") return value ?? null;
  if (typeof value === "string") return value.length <= COMPACT_STRING_LIMIT ? value : `${value.slice(0, COMPACT_STRING_LIMIT)}…`;
  if (Array.isArray(value)) {
    const limited = value.slice(0, COMPACT_ARRAY_LIMIT).map((item) => compactValue(item, depth + 1));
    if (value.length > COMPACT_ARRAY_LIMIT) limited.push({ truncated: true, omitted: value.length - COMPACT_ARRAY_LIMIT });
    return limited;
  }
  if (typeof value === "object") {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = compactValue(item, depth + 1);
    return output;
  }
  return String(value);
}

function compactOperation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const output = {};
  for (const key of ["planId", "stepId", "label", "kind", "phase", "target", "representation"]) {
    const item = value[key];
    if (typeof item === "string") output[key] = item.length <= COMPACT_STRING_LIMIT ? item : `${item.slice(0, COMPACT_STRING_LIMIT)}…`;
  }
  if (Array.isArray(value.postconditions)) output.postconditionCount = value.postconditions.length;
  return Object.keys(output).length ? output : null;
}

function compactToolResult(result) {
  if (result === null || result === undefined) return null;
  const payload = result && typeof result === "object" && result.status === "success" && result.result !== undefined ? result.result : result;
  const error = result && typeof result === "object" && result.status === "error" ? result.error ?? result : null;
  const coverage = payload?.coverage ?? payload?.facts?.graphCoverage ?? null;
  return {
    status: typeof result?.status === "string" ? result.status : null,
    code: typeof error?.code === "string" ? error.code : null,
    message: typeof error?.message === "string" ? compactValue(error.message) : null,
    coverage: coverage && typeof coverage === "object" ? compactValue({
      scope: coverage.scope,
      returned: coverage.returned,
      total: coverage.total,
      scanned: coverage.scanned,
      truncated: coverage.truncated,
    }) : null,
  };
}

function collectAffectedIds(value) {
  const ids = [];
  const seen = new Set();
  const visit = (item, depth = 0) => {
    if (ids.length >= AFFECTED_ID_LIMIT || depth > 10 || item === null || item === undefined) return;
    if (Array.isArray(item)) {
      for (const child of item) {
        visit(child, depth + 1);
        if (ids.length >= AFFECTED_ID_LIMIT) break;
      }
      return;
    }
    if (typeof item !== "object") return;
    for (const [key, child] of Object.entries(item)) {
      if (ids.length >= AFFECTED_ID_LIMIT) break;
      if (["id", "nodeId", "controlId", "instanceId", "componentId", "componentSetId"].includes(key) && typeof child === "string" && child.length > 0 && !seen.has(child)) {
        seen.add(child);
        ids.push(child);
      } else if (typeof child === "object" && child !== null) {
        visit(child, depth + 1);
      }
    }
  };
  visit(value);
  return ids;
}

function normalizeTags(tags) {
  return {
    retry: tags?.retry === true,
    requery: tags?.requery === true,
  };
}

function countState(record, state) {
  record[state] = (record[state] ?? 0) + 1;
}

function requireNonEmpty(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${label} must be a non-empty string.`);
}
