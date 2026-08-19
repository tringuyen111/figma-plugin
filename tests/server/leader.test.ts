import { afterEach, describe, expect, it, vi } from "vitest";
import { Follower } from "../../src/server/follower.js";
import { Coordinator } from "../../src/server/leader.js";
import { EXPORT_RPC_TIMEOUT_MS, type LeaderInfo } from "../../src/shared/protocol.js";

const info: LeaderInfo = {
  port: 38470,
  token: "a".repeat(48),
  pid: 1,
  startedAt: 1,
  version: "0.5.6-test",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Coordinator lifecycle", () => {
  it("does not restart after close while a follower health probe is in flight", async () => {
    let releaseHealth!: (healthy: boolean) => void;
    let healthStarted!: () => void;
    const started = new Promise<void>((resolve) => { healthStarted = resolve; });
    vi.spyOn(Follower, "checkHealth").mockImplementation(async () => {
      healthStarted();
      return await new Promise<boolean>((resolve) => { releaseHealth = resolve; });
    });

    const coordinator = new Coordinator({
      runValidated: async () => undefined,
      healthIntervalMs: [1, 1],
    });
    coordinator.role = "follower";
    coordinator.follower = new Follower(info);
    (coordinator as any).stopped = false;
    (coordinator as any).lifecycleGeneration = 1;
    const restart = vi.spyOn(coordinator as any, "startGeneration");

    (coordinator as any).startMonitor();
    await started;
    await coordinator.close();
    releaseHealth(false);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(restart).not.toHaveBeenCalled();
    expect(coordinator.follower).toBeUndefined();
    expect(coordinator.bridge).toBeUndefined();
  });
  it("forwards export metadata with the caller-supplied long operation deadline", async () => {
    const coordinator = new Coordinator({ runValidated: async () => undefined });
    coordinator.role = "follower";
    const follower = new Follower(info);
    const forward = vi.spyOn(follower, "forward").mockResolvedValue({ artifact: { path: "/tmp/export.pdf" } });
    coordinator.follower = follower;

    await coordinator.forward("__export__", { exportParams: { nodeId: "1:2", format: "PDF" } }, "agent-1", "instance-1", "1:2", EXPORT_RPC_TIMEOUT_MS);

    expect(forward).toHaveBeenCalledWith(
      "__export__",
      { exportParams: { nodeId: "1:2", format: "PDF" } },
      "agent-1",
      "instance-1",
      "1:2",
      EXPORT_RPC_TIMEOUT_MS,
    );
  });

});
