import { describe, expect, it } from "vitest";
import { decodeBinaryFrame, isClientWireMessage } from "../../src/server/bridge-protocol.js";
import { percentile, requestAttribution, requestSemantic } from "../../src/server/request-telemetry.js";
import { MAX_BINARY_ARTIFACT_BYTES, PROTOCOL_VERSION, type BridgeRequest } from "../../src/shared/protocol.js";

function execRequest(code: string, extra: Record<string, unknown> = {}): BridgeRequest {
  return {
    id: "request-12345678",
    op: "execute_js",
    params: { code, ...extra },
  };
}

describe("bridge helper boundaries", () => {
  it("extracts bounded semantic telemetry without guessing unannotated code", () => {
    expect(requestSemantic(execRequest("// @controlmux write Rename selected layer\nreturn 1"))).toEqual({
      kind: "write",
      label: "Rename selected layer",
    });
    expect(requestSemantic(execRequest("return figma.currentPage.name"))).toEqual({
      kind: "other",
      label: "Unlabeled figma_exec",
    });
    expect(requestSemantic(execRequest("// @controlmux read Misleading fallback\nreturn 1", {
      operation: { label: "Reuse primary Button", kind: "write", phase: "execute" },
    }))).toEqual({
      kind: "write",
      label: "Reuse primary Button",
    });
  });

  it("extracts optional measurement attribution without changing execution semantics", () => {
    expect(requestAttribution(execRequest("return 1", {
      capability: "figma-visual-system",
      traceId: "visual:settings",
      attempt: 2,
      maxOutputChars: 5000,
      operation: {
        label: "Apply settings visual system",
        kind: "write",
        phase: "verify",
        planId: "settings-refresh",
        stepId: "apply-visual-system",
        representation: "component-specimen",
        target: "Settings / Main",
        postconditions: ["Existing Button instance remains attached"],
      },
    }))).toEqual({
      capability: "figma-visual-system",
      traceId: "visual:settings",
      attempt: 2,
      outputBudgetChars: 5000,
      operationPhase: "verify",
      operationPlanId: "settings-refresh",
      operationStepId: "apply-visual-system",
      operationRepresentation: "component-specimen",
      operationTarget: "Settings / Main",
      postconditions: ["Existing Button instance remains attached"],
    });
    expect(requestAttribution(execRequest("return 1", { capability: "unknown", traceId: "", attempt: 0 }))).toEqual({});
  });

  it("keeps percentile selection deterministic", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(20);
    expect(percentile([10, 20, 30, 40], 0.95)).toBe(40);
  });

  it("validates client hello protocol and binary response framing at the wire boundary", () => {
    expect(isClientWireMessage({
      type: "hello",
      protocolVersion: PROTOCOL_VERSION,
      pluginVersion: "0.5.6",
      bundleRevision: "dev",
      runtimeSdks: ["v1", "v2"],
      instanceId: "instance-12345678",
      clientId: "client-12345678",
      fileKey: null,
      fileName: "File",
      pageId: "page-12345678",
      pageName: "Page",
      pages: [{ id: "page-12345678", name: "Page" }],
      editorType: "figma",
    })).toBe(true);

    const payload = Buffer.from([1, 2, 3]);
    const header = Buffer.from(JSON.stringify({
      type: "binary_response",
      id: "request-12345678",
      ok: true,
      format: "PNG",
      byteLength: payload.byteLength,
    }), "utf8");
    const frame = Buffer.alloc(4 + header.byteLength + payload.byteLength);
    frame.writeUInt32BE(header.byteLength, 0);
    header.copy(frame, 4);
    payload.copy(frame, 4 + header.byteLength);

    const decoded = decodeBinaryFrame(frame);
    expect(decoded?.header.format).toBe("PNG");
    expect(Array.from(decoded?.bytes ?? [])).toEqual([1, 2, 3]);

    const oversizedHeader = Buffer.from(JSON.stringify({
      type: "binary_response",
      id: "request-oversized",
      ok: true,
      format: "PDF",
      byteLength: MAX_BINARY_ARTIFACT_BYTES + 1,
    }), "utf8");
    const oversizedFrame = Buffer.alloc(4 + oversizedHeader.byteLength);
    oversizedFrame.writeUInt32BE(oversizedHeader.byteLength, 0);
    oversizedHeader.copy(oversizedFrame, 4);
    expect(decodeBinaryFrame(oversizedFrame)).toBeNull();
  });
});
