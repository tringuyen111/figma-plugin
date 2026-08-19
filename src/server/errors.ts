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

export { ErrorCode };
export type { BridgeError };
