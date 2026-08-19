import type { BridgeRequest, OperationPhase, OperationRepresentation, RequestKind } from "../shared/protocol.js";
import { isFigmaSkillId } from "../capabilities/skill-registry.js";
import { readOperationContext } from "./operation-context.js";

export const METRIC_WINDOW = 100;
export const REQUEST_HISTORY_LIMIT = 100;

export interface RequestAttribution {
  capability?: string;
  traceId?: string;
  attempt?: number;
  outputBudgetChars?: number;
  artifactBudgetBytes?: number;
  operationPhase?: OperationPhase;
  operationPlanId?: string;
  operationStepId?: string;
  operationRepresentation?: OperationRepresentation;
  operationTarget?: string;
  postconditions?: string[];
}

export function requestSemantic(request: BridgeRequest): { kind: RequestKind; label: string } {
  const operation = readOperationContext(request.params["operation"]);
  if (operation) return { kind: operation.kind, label: operation.label };
  if (request.op === "export_node") {
    const format = typeof request.params["format"] === "string" ? request.params["format"] : "artifact";
    return { kind: "export", label: `Export ${format} from Figma`.slice(0, 96) };
  }
  const code = request.params["code"];
  if (typeof code !== "string") return { kind: "other", label: defaultRequestLabel("other") };

  const lines = code.split(/\r?\n/, 6);
  for (const line of lines) {
    const match = /^\s*\/\/\s*@controlmux\s+(read|write|export|other)(?:\s+(.+?))?\s*$/i.exec(line);
    if (!match) continue;
    const kind = match[1]!.toLowerCase() as RequestKind;
    const rawLabel = (match[2] ?? defaultRequestLabel(kind)).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
    return { kind, label: (rawLabel || defaultRequestLabel(kind)).slice(0, 96) };
  }
  return { kind: "other", label: defaultRequestLabel("other") };
}

/** Read optional measurement metadata without making it part of execution semantics. */
export function requestAttribution(request: BridgeRequest): RequestAttribution {
  const capability = request.params["capability"];
  const traceId = request.params["traceId"];
  const attempt = request.params["attempt"];
  const outputBudgetChars = request.params["maxOutputChars"];
  const artifactBudgetBytes = request.params["maxBytes"];
  const operation = readOperationContext(request.params["operation"]);
  return {
    ...(isFigmaSkillId(capability) ? { capability } : {}),
    ...(typeof traceId === "string" && traceId.length > 0 && traceId.length <= 128 ? { traceId } : {}),
    ...(typeof attempt === "number" && Number.isInteger(attempt) && attempt >= 1 ? { attempt } : {}),
    ...(typeof outputBudgetChars === "number" && Number.isInteger(outputBudgetChars) && outputBudgetChars > 0 ? { outputBudgetChars } : {}),
    ...(typeof artifactBudgetBytes === "number" && Number.isInteger(artifactBudgetBytes) && artifactBudgetBytes > 0 ? { artifactBudgetBytes } : {}),
    ...(operation?.phase ? { operationPhase: operation.phase } : {}),
    ...(operation?.planId ? { operationPlanId: operation.planId } : {}),
    ...(operation?.stepId ? { operationStepId: operation.stepId } : {}),
    ...(operation?.representation ? { operationRepresentation: operation.representation } : {}),
    ...(operation?.target ? { operationTarget: operation.target } : {}),
    ...(operation?.postconditions ? { postconditions: [...operation.postconditions] } : {}),
  };
}

export function defaultRequestLabel(kind: RequestKind): string {
  if (kind === "read") return "Read from Figma";
  if (kind === "write") return "Write to Figma";
  if (kind === "export") return "Export from Figma";
  return "Unlabeled figma_exec";
}

export function percentile(values: number[], q: number): number | null {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * q) - 1));
  return values[index] ?? null;
}
