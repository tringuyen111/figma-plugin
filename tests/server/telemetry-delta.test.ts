import { describe, expect, it } from "vitest";
import { createTelemetryDelta } from "../../src/server/telemetry-delta.js";
import { RuntimeTelemetry } from "../../src/server/runtime-telemetry.js";
import type { BridgeRequest } from "../../src/shared/protocol.js";

function request(id: string): BridgeRequest {
  return {
    id,
    op: "execute_js",
    params: { code: "// @controlmux read Inspect telemetry delta\nreturn 1" },
  };
}

describe("telemetry delta wire projection", () => {
  it("keeps a steady-state update smaller than replaying the retained history", () => {
    const telemetry = new RuntimeTelemetry();
    for (let index = 0; index < 16; index++) {
      const timing = telemetry.begin(request(`request-${index}`));
      telemetry.markRunning(timing, timing.enqueuedAt + 1);
      telemetry.complete(timing, "success", 12);
    }
    telemetry.resetChanges();
    telemetry.begin(request("request-new"));
    const current = telemetry.snapshot();
    const changes = telemetry.consumeChanges()!;
    const delta = createTelemetryDelta("instance-window-a", 17, { queueLength: 0, pendingCount: 1, inFlight: 0 }, changes);

    expect(delta.seq).toBe(17);
    expect(delta.runtime).toEqual({ queueLength: 0, pendingCount: 1, inFlight: 0 });
    expect(delta.requests).toHaveLength(1);
    expect(delta.operations).toHaveLength(1);
    expect(JSON.stringify(delta).length).toBeLessThan(JSON.stringify(current).length);
  });

  it("marks explicit history clearing so the UI can remove retained rows", () => {
    const telemetry = new RuntimeTelemetry();
    const timing = telemetry.begin(request("request-clear"));
    telemetry.complete(timing, "success", 12);
    telemetry.resetChanges();
    telemetry.clearHistory();
    const delta = createTelemetryDelta(
      "instance-window-a",
      2,
      { queueLength: 0, pendingCount: 0, inFlight: 0 },
      telemetry.consumeChanges()!,
    );

    expect(delta.clearHistory).toBe(true);
    expect(delta.requestIdsRemoved).toEqual(["request-clear"]);
    expect(delta.operationIdsRemoved).toEqual(["request-clear"]);
  });
});
