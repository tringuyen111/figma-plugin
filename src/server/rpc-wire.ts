const BINARY_WIRE_TYPE = "controlmux-figma:uint8:v1";

interface BinaryWireEnvelope {
  __wireType: typeof BINARY_WIRE_TYPE;
  base64: string;
  value: Record<string, unknown>;
}

/**
 * Preserve a small top-level Uint8Array result across the leader/follower JSON RPC hop.
 * This is retained for immediate figma_exec raster evidence. Durable figma_export
 * artifacts are persisted by the leader before RPC, so their binary bytes never
 * enter this base64 envelope.
 */
export function encodeRpcResult(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  if (!(record["bytes"] instanceof Uint8Array)) return value;

  const { bytes, ...rest } = record as Record<string, unknown> & { bytes: Uint8Array };
  return {
    __wireType: BINARY_WIRE_TYPE,
    base64: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64"),
    value: rest,
  } satisfies BinaryWireEnvelope;
}

export function decodeRpcResult(value: unknown): unknown {
  if (!isBinaryWireEnvelope(value)) return value;
  const decoded = Buffer.from(value.base64, "base64");
  return {
    ...value.value,
    bytes: new Uint8Array(decoded.buffer, decoded.byteOffset, decoded.byteLength),
  };
}

function isBinaryWireEnvelope(value: unknown): value is BinaryWireEnvelope {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<BinaryWireEnvelope>;
  return record.__wireType === BINARY_WIRE_TYPE
    && typeof record.base64 === "string"
    && !!record.value
    && typeof record.value === "object"
    && !Array.isArray(record.value);
}
