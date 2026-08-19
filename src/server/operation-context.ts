import { OPERATION_PHASES, OPERATION_REPRESENTATIONS, REQUEST_KINDS, type OperationContextWire, type RequestKind } from "../shared/protocol.js";
import { ErrorCode, OpError } from "./errors.js";

const OPERATION_KEYS = new Set(["label", "kind", "phase", "planId", "stepId", "representation", "target", "postconditions"]);
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const STABLE_ID = /^[A-Za-z0-9._:-]+$/;

export function validateOperationContext(
  value: unknown,
  traceId: unknown,
  expectedKind?: RequestKind,
): OperationContextWire | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "operation must be an object.");
  }
  if (typeof traceId !== "string" || traceId.length === 0) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "operation requires traceId so retries and phases share one stable identity.");
  }

  const record = value as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !OPERATION_KEYS.has(key));
  if (unknown.length) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `operation contains unsupported field(s): ${unknown.join(", ")}.`);
  }

  const label = boundedText(record["label"], "operation.label", 96, true)!;
  const kind = record["kind"];
  if (typeof kind !== "string" || !(REQUEST_KINDS as readonly string[]).includes(kind)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `operation.kind must be one of: ${REQUEST_KINDS.join(", ")}.`);
  }
  if (expectedKind && kind !== expectedKind) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `operation.kind must be "${expectedKind}" for this tool.`);
  }

  const phase = record["phase"];
  if (phase !== undefined && (typeof phase !== "string" || !(OPERATION_PHASES as readonly string[]).includes(phase))) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `operation.phase must be one of: ${OPERATION_PHASES.join(", ")}.`);
  }
  const planId = boundedStableId(record["planId"], "operation.planId");
  const stepId = boundedStableId(record["stepId"], "operation.stepId");
  if ((planId && !stepId) || (!planId && stepId)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "operation.planId and operation.stepId must be provided together.");
  }
  const representation = record["representation"];
  if (representation !== undefined && (typeof representation !== "string" || !(OPERATION_REPRESENTATIONS as readonly string[]).includes(representation))) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `operation.representation must be one of: ${OPERATION_REPRESENTATIONS.join(", ")}.`);
  }
  const target = boundedText(record["target"], "operation.target", 160, false);
  const postconditions = boundedPostconditions(record["postconditions"]);

  return {
    label,
    kind: kind as RequestKind,
    ...(typeof phase === "string" ? { phase: phase as OperationContextWire["phase"] } : {}),
    ...(planId ? { planId } : {}),
    ...(stepId ? { stepId } : {}),
    ...(typeof representation === "string" ? { representation: representation as OperationContextWire["representation"] } : {}),
    ...(target ? { target } : {}),
    ...(postconditions ? { postconditions } : {}),
  };
}

function boundedStableId(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || !STABLE_ID.test(value)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `${field} must be 1-128 characters using letters, numbers, dot, underscore, colon, or hyphen.`);
  }
  return value;
}

export function readOperationContext(value: unknown): OperationContextWire | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const label = typeof record["label"] === "string" ? record["label"] : "";
  const kind = record["kind"];
  if (!label || typeof kind !== "string" || !(REQUEST_KINDS as readonly string[]).includes(kind)) return undefined;
  return record as unknown as OperationContextWire;
}

function boundedText(value: unknown, field: string, max: number, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > max || CONTROL_CHARS.test(value)) {
    throw new OpError(ErrorCode.INVALID_PARAMS, `${field} must be a non-empty string up to ${max} characters without control characters.`);
  }
  return value.trim();
}

function boundedPostconditions(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) {
    throw new OpError(ErrorCode.INVALID_PARAMS, "operation.postconditions must contain 1-8 strings.");
  }
  const normalized = value.map((item, index) => boundedText(item, `operation.postconditions[${index}]`, 160, true)!);
  return [...new Set(normalized)];
}
