import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
const maintenance = readFileSync(new URL("../../scripts/figma-file-maintenance.mjs", import.meta.url), "utf8");
const benchmark = readFileSync(new URL("../../scripts/benchmark-figma-runtime.mjs", import.meta.url), "utf8");
const liveV2 = readFileSync(new URL("../../scripts/smoke-runtime-sdk-v2-live.mjs", import.meta.url), "utf8");
const client = readFileSync(new URL("../../scripts/lib/runtime-client.mjs", import.meta.url), "utf8");
const typedTools = readFileSync(new URL("../../scripts/smoke-typed-tools-live.mjs", import.meta.url), "utf8");

describe("live Figma runtime utilities", () => {
  it("keeps file maintenance inspect-first and clear-explicit", () => {
    expect(packageJson.scripts["inspect:figma-file"]).toBe("node scripts/figma-file-maintenance.mjs");
    expect(packageJson.scripts["clear:figma-file"]).toContain("--clear");
    expect(maintenance).toContain('const clearRequested = process.argv.includes("--clear")');
    expect(maintenance).toContain('const mode = clearRequested ? "clear" : "inventory"');
    expect(maintenance).toContain('runtimeSdk: "v2"');
    expect(maintenance).toContain("commitUndoCheckpoint");
    expect(maintenance).toContain("Clear left");
    expect(maintenance).toContain("RuntimeClient");
    expect(benchmark).toContain("RuntimeClient");
    expect(liveV2).toContain("RuntimeClient");
    expect(client).toContain("resolveSingleInstance");
    expect(client).toContain("callRaw");
  });

  it("benchmarks bounded read-only samples and verifies queue recovery", () => {
    expect(packageJson.scripts["benchmark:figma"]).toBe("node scripts/benchmark-figma-runtime.mjs");
    expect(benchmark).toContain('runtimeSdk: "v2"');
    expect(benchmark).toContain('kind: "read"');
    expect(benchmark).toContain("sequentialCount");
    expect(benchmark).toContain("concurrentCount");
    expect(benchmark).toContain("instanceQueueLength");
    expect(benchmark).toContain("instanceInFlight");
  });

  it("keeps the v2 live fixture temporary and verifies provider evidence", () => {
    expect(packageJson.scripts["test:runtime-sdk-v2-live"]).toBe("node scripts/smoke-runtime-sdk-v2-live.mjs");
    expect(packageJson.scripts["test:runtime-sdk-v2-provider-live"]).toContain("--provider-probes");
    expect(liveV2).toContain('runtimeSdk: "v2"');
    expect(liveV2).toContain("bindStyle");
    expect(liveV2).toContain("bindVariable");
    expect(liveV2).toContain("inspectHandoff");
    expect(liveV2).toContain("finally");
    expect(liveV2).toContain("fixture.remove()");
    expect(liveV2).toContain("variableCollection.remove()");
    expect(liveV2).toContain("RETRYABLE_PROVIDER_ERROR");
    expect(liveV2).toContain("assertCleanInventory");
    expect(liveV2).toContain("attempt,");
    expect(liveV2).toContain('process.argv.includes("--provider-probes")');
    expect(liveV2).toContain("publishStatus: providerProbes");
  });

  it("uses typed query/apply for common live work", () => {
    expect(packageJson.scripts["test:typed-tools-live"]).toBe("node scripts/smoke-typed-tools-live.mjs");
    expect(typedTools).toContain('runtime.call("figma_query"');
    expect(typedTools).toContain('runtime.call("figma_apply"');
    expect(typedTools).toContain("dryRun: true");
    expect(typedTools).toContain("bundleRevision");
  });
});
