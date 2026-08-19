import { afterEach, describe, expect, it } from "vitest";
import { exportNode } from "../../src/plugin/handlers/export-node.js";

afterEach(() => { delete (globalThis as { figma?: unknown }).figma; });

describe("exportNode", () => {
  it("maps JSON to JSON_REST_V1 and returns UTF-8 artifact bytes", async () => {
    let received: unknown;
    (globalThis as { figma?: unknown }).figma = {
      editorType: "figma",
      getNodeByIdAsync: async () => ({
        id: "1:2", name: "Data", type: "FRAME",
        exportAsync: async (settings: unknown) => { received = settings; return { name: "Data", type: "FRAME" }; },
      }),
    };
    const result = await exportNode({ nodeId: "1:2", format: "JSON" });
    expect(received).toEqual({ format: "JSON_REST_V1" });
    expect(result.format).toBe("JSON");
    expect(JSON.parse(String.fromCharCode(...result.bytes))).toMatchObject({ name: "Data" });
  });

  it("validates video scale and fps before calling Figma", async () => {
    let called = false;
    (globalThis as { figma?: unknown }).figma = {
      editorType: "figma",
      getNodeByIdAsync: async () => ({ name: "Motion", type: "FRAME", exportAsync: async () => { called = true; return new Uint8Array(); } }),
    };
    await expect(exportNode({ nodeId: "1:2", format: "MP4", fps: 25 })).rejects.toMatchObject({ bridgeError: { code: "INVALID_PARAMS" } });
    expect(called).toBe(false);
  });

  it("encodes SVG text as compact UTF-8 without the old number-array expansion", async () => {
    (globalThis as { figma?: unknown }).figma = {
      editorType: "figma",
      getNodeByIdAsync: async () => ({
        id: "1:2", name: "Unicode", type: "FRAME",
        exportAsync: async () => "Trí 😀",
      }),
    };
    const result = await exportNode({ nodeId: "1:2", format: "SVG" });
    expect(Array.from(result.bytes)).toEqual([84, 114, 195, 173, 32, 240, 159, 152, 128]);
  });

  it("rejects an impossible byte budget before calling Figma exportAsync", async () => {
    let called = false;
    (globalThis as { figma?: unknown }).figma = {
      editorType: "figma",
      getNodeByIdAsync: async () => ({
        id: "1:2", name: "Frame", type: "FRAME",
        exportAsync: async () => { called = true; return new Uint8Array([1]); },
      }),
    };
    await expect(exportNode({ nodeId: "1:2", format: "PNG", maxBytes: Number.MAX_SAFE_INTEGER })).rejects.toMatchObject({
      bridgeError: { code: "INVALID_PARAMS" },
    });
    expect(called).toBe(false);
  });

});
