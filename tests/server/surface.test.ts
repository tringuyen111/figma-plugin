import { describe, expect, it } from "vitest";
import { resolveStartPort, toolDefinitions, toToolResult } from "../../src/server/index.js";
import { candidatePorts } from "../../src/server/leader.js";
import { validateOperationContext } from "../../src/server/operation-context.js";
import { DEFAULT_PORT, ErrorCode, OPERATIONS, PROTOCOL_VERSION } from "../../src/shared/protocol.js";

describe("native MCP surface", () => {
  it("exposes status, native execution, and typed artifact egress", () => {
    const tools = toolDefinitions();
    expect(tools.map((tool) => tool.name)).toEqual(["figma_status", "figma_query", "figma_apply", "figma_exec", "figma_export"]);
    expect(OPERATIONS).toEqual(["execute_js", "query_document", "apply_document", "export_node"]);
    expect(PROTOCOL_VERSION).toBe(9);
    const exec = tools.find((tool) => tool.name === "figma_exec");
    const props = (exec?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(props).toHaveProperty("capability");
    expect(props).toHaveProperty("traceId");
    expect(props).toHaveProperty("attempt");
    expect(props).toHaveProperty("operation");
    expect(props).toHaveProperty("runtimeSdk");
    const query = tools.find((tool) => tool.name === "figma_query");
    const queryProps = (query?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect((queryProps.kind as { enum?: string[] }).enum).toEqual(["file_inventory", "node_handoff", "structure"]);
    const apply = tools.find((tool) => tool.name === "figma_apply");
    const applyProps = (apply?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect((applyProps.action as { enum?: string[] }).enum).toEqual(["clear_file_owned_assets"]);
    expect((props.runtimeSdk as { enum?: string[] }).enum).toEqual(["v1", "v2"]);
    const operation = props.operation as { required?: string[]; properties?: Record<string, unknown> };
    expect(operation.required).toEqual(["label", "kind"]);
    expect(operation.properties).toHaveProperty("postconditions");
    expect(operation.properties).toHaveProperty("planId");
    expect(operation.properties).toHaveProperty("stepId");
    expect(operation.properties).toHaveProperty("representation");
    const exportTool = tools.find((tool) => tool.name === "figma_export");
    const exportProps = (exportTool?.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
    expect(exportProps).toHaveProperty("format");
    expect(exportProps).toHaveProperty("maxBytes");
    expect(exportProps).toHaveProperty("operation");
  });

  it("validates logical-operation context without changing legacy calls", () => {
    expect(validateOperationContext(undefined, undefined)).toBeUndefined();
    expect(validateOperationContext({
      label: "  Reuse primary Button  ",
      kind: "write",
      phase: "execute",
      planId: "checkout-refresh",
      stepId: "reuse-primary-button",
      representation: "component-specimen",
      target: "Checkout / Primary action",
      postconditions: ["Node is an instance", "Node is an instance"],
    }, "checkout:button")).toEqual({
      label: "Reuse primary Button",
      kind: "write",
      phase: "execute",
      planId: "checkout-refresh",
      stepId: "reuse-primary-button",
      representation: "component-specimen",
      target: "Checkout / Primary action",
      postconditions: ["Node is an instance"],
    });
    expect(() => validateOperationContext({ label: "Missing identity", kind: "read" }, undefined)).toThrow(/requires traceId/);
    expect(() => validateOperationContext({ label: "Wrong export kind", kind: "write" }, "export:1", "export")).toThrow(/must be "export"/);
    expect(() => validateOperationContext({ label: "Unknown field", kind: "read", proof: true }, "read:1")).toThrow(/unsupported field/);
    expect(() => validateOperationContext({ label: "Missing plan", kind: "read", stepId: "inspect" }, "read:2")).toThrow(/planId and operation.stepId/);
  });

  it("uses the ControlMux port environment variable", () => {
    expect(resolveStartPort({})).toBe(DEFAULT_PORT);
    expect(resolveStartPort({ CONTROLMUX_FIGMA_PORT: "38473" })).toBe(38473);
    expect(() => resolveStartPort({ CONTROLMUX_FIGMA_PORT: "abc" })).toThrow(/CONTROLMUX_FIGMA_PORT/);
    expect(() => resolveStartPort({ CONTROLMUX_FIGMA_PORT: "38469" })).toThrow(/38470 and 38479/);
    expect(() => resolveStartPort({ CONTROLMUX_FIGMA_PORT: "38480" })).toThrow(/38470 and 38479/);
  });

  it("keeps every coordinator candidate inside the Figma discovery range", () => {
    expect(candidatePorts(38479)).toEqual([38479, 38470, 38471, 38472, 38473, 38474, 38475, 38476, 38477, 38478]);
    expect(Math.max(...candidatePorts(38479))).toBe(38479);
  });

  it("converts binary bridge output to MCP image content only at the server boundary", () => {
    const result = toToolResult({ format: "PNG", bytes: new Uint8Array([1, 2, 3]), nodeId: "1:2" });
    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[1]).toMatchObject({ type: "image", mimeType: "image/png", data: "AQID" });
  });

  it("returns persisted exports as resource links plus structured metadata", () => {
    const result = toToolResult({
      artifact: {
        path: "/tmp/controlmux-figma/exports/frame.pdf",
        uri: "file:///tmp/controlmux-figma/exports/frame.pdf",
        filename: "frame.pdf",
        mimeType: "application/pdf",
        byteLength: 1234,
        format: "PDF",
        retention: "ephemeral-24h",
      },
    });
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[1]).toMatchObject({
      type: "resource_link",
      uri: "file:///tmp/controlmux-figma/exports/frame.pdf",
      name: "frame.pdf",
      mimeType: "application/pdf",
      size: 1234,
    });
    expect(result.structuredContent).toMatchObject({ artifact: { filename: "frame.pdf", format: "PDF" } });
  });

  it("keeps deterministic routing error codes in the protocol", () => {
    expect(ErrorCode.NOT_CONNECTED).toBe("NOT_CONNECTED");
    expect(ErrorCode.AMBIGUOUS_TARGET).toBe("AMBIGUOUS_TARGET");
    expect(ErrorCode.TARGET_NOT_FOUND).toBe("TARGET_NOT_FOUND");
    expect(ErrorCode.PAGE_NOT_FOUND).toBe("PAGE_NOT_FOUND");
  });
});
