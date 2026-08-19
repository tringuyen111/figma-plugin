import { describe, expect, it } from "vitest";
import { RuntimeTelemetry } from "../../src/server/runtime-telemetry.js";
import type { BridgeRequest } from "../../src/shared/protocol.js";

function request(id: string, code: string, extra: Record<string, unknown> = {}): BridgeRequest {
  return { id, op: "execute_js", params: { code, ...extra } };
}

describe("RuntimeTelemetry", () => {
  it("owns request classification, attribution, queue metrics, completion metrics, and bounded snapshots", () => {
    const telemetry = new RuntimeTelemetry();
    const timing = telemetry.begin(request(
      "r1",
      "// @controlmux read Inspect selection\nreturn [];",
      { capability: "figma-components", traceId: "component:button", attempt: 1, maxOutputChars: 4096 },
    ), "session-1");
    telemetry.markRunning(timing, timing.enqueuedAt + 7);
    telemetry.complete(timing, "success", 42);

    const snapshot = telemetry.snapshot();
    expect(snapshot.metrics.totalCount).toBe(1);
    expect(snapshot.metrics.successCount).toBe(1);
    expect(snapshot.metrics.requestKinds.read).toBe(1);
    expect(snapshot.metrics.attributedCount).toBe(1);
    expect(snapshot.metrics.retryCount).toBe(0);
    expect(snapshot.metrics.lastQueueMs).toBe(7);
    expect(snapshot.metrics.p95QueueMs).toBe(7);
    expect(snapshot.requests[0]).toMatchObject({
      id: "r1",
      kind: "read",
      label: "Inspect selection",
      status: "success",
      sessionId: "session-1",
      capability: "figma-components",
      traceId: "component:button",
      attempt: 1,
      outputBudgetChars: 4096,
      queueMs: 7,
      responseBytes: 42,
    });
  });

  it("counts explicit retry attempts without confusing sequential calls with retries", () => {
    const telemetry = new RuntimeTelemetry();
    const first = telemetry.begin(request("r1", "return 1", { capability: "figma-layout", traceId: "layout:settings", attempt: 1 }));
    telemetry.markRunning(first, first.enqueuedAt + 2);
    telemetry.complete(first, "failed", 10, "SANDBOX_ERROR");
    const retry = telemetry.begin(request("r2", "return 2", { capability: "figma-layout", traceId: "layout:settings", attempt: 2 }));
    telemetry.markRunning(retry, retry.enqueuedAt + 4);
    telemetry.complete(retry, "success", 11);
    expect(telemetry.metrics()).toMatchObject({ attributedCount: 2, retryCount: 1, p95QueueMs: 4 });
    expect(telemetry.snapshot().operations).toEqual([
      expect.objectContaining({
        id: "layout:settings",
        status: "success",
        requestCount: 2,
        attemptCount: 2,
        requestIds: ["r2", "r1"],
      }),
    ]);
  });

  it("summarizes structured intent and retries as one accountable logical operation", () => {
    const telemetry = new RuntimeTelemetry();
    const operation = {
      label: "Reuse primary Button",
      kind: "write",
      phase: "execute",
      planId: "checkout-refresh",
      stepId: "reuse-primary-button",
      representation: "component-specimen",
      target: "Checkout / Primary action",
      postconditions: ["Node is an instance", "Main component key matches registry"],
    };
    const first = telemetry.begin(request("op-1", "return 1", {
      capability: "figma-components",
      traceId: "checkout:primary-button",
      attempt: 1,
      operation,
    }));
    telemetry.markRunning(first, first.enqueuedAt + 2);
    telemetry.complete(first, "failed", 15, "SANDBOX_ERROR");
    const retry = telemetry.begin(request("op-2", "return 2", {
      capability: "figma-components",
      traceId: "checkout:primary-button",
      attempt: 2,
      operation: { ...operation, phase: "verify" },
    }));
    telemetry.markRunning(retry, retry.enqueuedAt + 3);
    telemetry.complete(retry, "success", 18);

    expect(telemetry.snapshot().operations).toEqual([
      expect.objectContaining({
        id: "checkout:primary-button",
        label: "Reuse primary Button",
        kind: "write",
        status: "success",
        capability: "figma-components",
        phase: "verify",
        planId: "checkout-refresh",
        stepId: "reuse-primary-button",
        representation: "component-specimen",
        target: "Checkout / Primary action",
        postconditions: ["Node is an instance", "Main component key matches registry"],
        requestCount: 2,
        attemptCount: 2,
        requestIds: ["op-2", "op-1"],
      }),
    ]);
  });

  it("keeps untraced calls as separate operations", () => {
    const telemetry = new RuntimeTelemetry();
    telemetry.begin(request("single-1", "return 1"));
    telemetry.begin(request("single-2", "return 2"));
    expect(telemetry.snapshot().operations.map((item) => item.id)).toEqual(["single-2", "single-1"]);
  });

  it("labels unannotated execution explicitly instead of hiding it as generic Figma execution", () => {
    const telemetry = new RuntimeTelemetry();
    const timing = telemetry.begin(request("unlabeled", "return figma.currentPage.name;"));
    telemetry.complete(timing, "success", 12);
    expect(telemetry.snapshot().requests[0]).toMatchObject({
      kind: "other",
      label: "Unlabeled figma_exec",
    });
  });

  it("classifies typed exports without relying on code annotations", () => {
    const telemetry = new RuntimeTelemetry();
    const timing = telemetry.begin({
      id: "export-1",
      op: "export_node",
      params: { nodeId: "1:2", format: "PDF", maxBytes: 1024, capability: "figma-design-to-design", traceId: "handoff:pdf", attempt: 1 },
    });
    telemetry.markRunning(timing, timing.enqueuedAt + 3);
    telemetry.complete(timing, "success", 900);
    expect(telemetry.snapshot().requests[0]).toMatchObject({
      kind: "export",
      label: "Export PDF from Figma",
      artifactBudgetBytes: 1024,
      capability: "figma-design-to-design",
      responseBytes: 900,
    });
  });

  it("can reclassify binary work and preserve late-response accounting after timeout", () => {
    const telemetry = new RuntimeTelemetry();
    const timing = telemetry.begin(request("r2", "return new Uint8Array();"));
    telemetry.markRunning(timing, timing.enqueuedAt + 1);
    telemetry.reclassify(timing.event, "export");
    telemetry.complete(timing, "timeout", 0, "PLUGIN_TIMEOUT");
    telemetry.noteLateResponse("r2", 128);

    const snapshot = telemetry.snapshot();
    expect(snapshot.metrics.timeoutCount).toBe(1);
    expect(snapshot.metrics.requestKinds.export).toBe(1);
    expect(snapshot.metrics.responseBytes).toBe(128);
    expect(snapshot.requests[0]?.responseBytes).toBe(128);
  });

  it("clears retained history without erasing cumulative metrics", () => {
    const telemetry = new RuntimeTelemetry();
    const timing = telemetry.begin(request("r3", "// @controlmux write Create node\nreturn {};"));
    telemetry.complete(timing, "cancelled", 0, "CANCELLED", { sample: false });
    expect(telemetry.clearHistory()).toBe(1);
    expect(telemetry.snapshot().requests).toEqual([]);
    expect(telemetry.metrics()).toMatchObject({ totalCount: 1, cancelledCount: 1 });
  });
});
