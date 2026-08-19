import { describe, expect, it } from "vitest";
import { decodeRpcResult, encodeRpcResult } from "../../src/server/rpc-wire.js";

describe("leader/follower RPC result wire format", () => {
  it("round-trips a top-level binary image result without changing metadata", () => {
    const input = { format: "PNG", nodeId: "1:2", bytes: new Uint8Array([0, 1, 2, 127, 255]) };
    const wire = encodeRpcResult(input);
    const output = decodeRpcResult(wire) as typeof input;

    expect(output.format).toBe("PNG");
    expect(output.nodeId).toBe("1:2");
    expect(Array.from(output.bytes)).toEqual([0, 1, 2, 127, 255]);
  });

  it("leaves ordinary JSON results unchanged", () => {
    const input = { ok: true, values: [1, 2, 3] };
    expect(decodeRpcResult(encodeRpcResult(input))).toEqual(input);
  });
  it("keeps durable export descriptors JSON-only so artifact bytes never cross follower RPC", () => {
    const input = {
      artifact: {
        path: "/tmp/controlmux-figma/exports/frame.pdf",
        uri: "file:///tmp/controlmux-figma/exports/frame.pdf",
        filename: "frame.pdf",
        format: "PDF",
        byteLength: 32 * 1024 * 1024,
      },
    };
    const wire = encodeRpcResult(input);
    expect(wire).toEqual(input);
    expect(JSON.stringify(wire)).not.toContain("__wireType");
    expect(JSON.stringify(wire)).not.toContain("base64");
  });

});
