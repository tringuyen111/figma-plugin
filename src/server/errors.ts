import { ErrorCode, type BridgeError } from "../shared/protocol.js";

/** Error shape used by the local runtime and exposed to MCP callers. */
export class OpError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "OpError";
  }

  asWire(): BridgeError {
    return {
      code: this.code,
      message: this.message,
      ...(this.hint ? { hint: this.hint } : {}),
    };
  }
}

export function toBridgeError(
  value: unknown,
  fallbackCode: ErrorCode = ErrorCode.INTERNAL,
  fallbackHint?: string,
): BridgeError {
  if (value instanceof OpError) return value.asWire();
  const message = value instanceof Error ? value.message : String(value);
  return {
    code: fallbackCode,
    message,
    ...(fallbackHint ? { hint: fallbackHint } : {}),
  };
}

export interface McpErrorDisposition {
  retryable: boolean;
  retryAfterMs?: number;
  possiblyCommitted: boolean;
  providerStateUnknown: boolean;
}

const MUTATION_CAPABLE_TOOLS = new Set(["figma_apply", "figma_exec", "figma_export"]);
const READ_ONLY_TOOLS = new Set(["figma_status", "figma_query"]);

/**
 * Caller guidance for retry and lost-response ambiguity at the MCP boundary.
 * This is deliberately conservative: a timed-out/disconnected mutation must be
 * inspected before another attempt, even when reconnecting is possible.
 */
export function mcpErrorDisposition(code: ErrorCode, toolName?: string): McpErrorDisposition {
  const mutationCapable = toolName ? MUTATION_CAPABLE_TOOLS.has(toolName) : true;
  const readOnly = toolName ? READ_ONLY_TOOLS.has(toolName) : false;
  const providerStateUnknown = mutationCapable && [
    ErrorCode.PLUGIN_TIMEOUT,
    ErrorCode.CONNECTION_LOST,
    ErrorCode.SANDBOX_ERROR,
    ErrorCode.OUTPUT_TOO_LARGE,
    ErrorCode.INTERNAL,
  ].includes(code);

  if (code === ErrorCode.NOT_CONNECTED) {
    return { retryable: true, retryAfterMs: 1_000, possiblyCommitted: false, providerStateUnknown: false };
  }
  if (code === ErrorCode.QUEUE_FULL) {
    return { retryable: true, retryAfterMs: 250, possiblyCommitted: false, providerStateUnknown: false };
  }
  if (code === ErrorCode.CANCELLED) {
    return { retryable: true, retryAfterMs: 500, possiblyCommitted: false, providerStateUnknown: false };
  }
  if (readOnly && [ErrorCode.PLUGIN_TIMEOUT, ErrorCode.CONNECTION_LOST].includes(code)) {
    return { retryable: true, retryAfterMs: 500, possiblyCommitted: false, providerStateUnknown: false };
  }
  return {
    retryable: false,
    possiblyCommitted: providerStateUnknown,
    providerStateUnknown,
  };
}

export { ErrorCode };
export type { BridgeError };
