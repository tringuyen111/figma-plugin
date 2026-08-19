import { performance } from "node:perf_hooks";
import { RuntimeClient, assert, readOption } from "./lib/runtime-client.mjs";

const sequentialCount = integerOption("--sequential", 20, 1, 100);
const concurrentCount = integerOption("--concurrent", 8, 1, 32);
const warmupCount = 3;
const requestedInstanceId = readOption("--instance-id");
const traceRoot = `figma-benchmark:${Date.now()}`;

const runtime = new RuntimeClient({ name: "figma-runtime-benchmark" });

const connectStartedAt = performance.now();
try {
  await runtime.connect();
  const mcpConnectMs = performance.now() - connectStartedAt;
  const statusStartedAt = performance.now();
  const status = await runtime.status(true);
  const statusMs = performance.now() - statusStartedAt;
  const instance = runtime.resolveSingleInstance(status, requestedInstanceId);

  for (let index = 0; index < warmupCount; index += 1) await readProbe(instance, `warmup-${index + 1}`);

  const sequentialSamples = [];
  for (let index = 0; index < sequentialCount; index += 1) {
    const startedAt = performance.now();
    await readProbe(instance, `sequential-${index + 1}`);
    sequentialSamples.push(performance.now() - startedAt);
  }

  const concurrentStartedAt = performance.now();
  const concurrentSamples = await Promise.all(Array.from({ length: concurrentCount }, async (_, index) => {
    const startedAt = performance.now();
    await readProbe(instance, `concurrent-${index + 1}`);
    return performance.now() - startedAt;
  }));
  const concurrentWallMs = performance.now() - concurrentStartedAt;

  const after = await runtime.status(true);
  const afterInstance = Array.isArray(after.instances)
    ? after.instances.find((candidate) => candidate.instanceId === instance.instanceId)
    : undefined;

  process.stdout.write(`${JSON.stringify({
    target: {
      instanceId: instance.instanceId,
      fileName: instance.fileName,
      pageId: instance.pageId,
      pageName: instance.pageName,
      runtimeSdks: instance.runtimeSdks,
    },
    transport: {
      mcpConnectMs: round(mcpConnectMs),
      firstStatusMs: round(statusMs),
    },
    sequential: summarize(sequentialSamples),
    concurrent: {
      count: concurrentCount,
      wallMs: round(concurrentWallMs),
      ...summarize(concurrentSamples),
    },
    finalState: {
      pluginConnected: after.pluginConnected,
      queueLength: after.queueLength,
      pendingCount: after.pendingCount,
      instanceQueueLength: afterInstance?.queueLength ?? null,
      instanceInFlight: afterInstance?.inFlight ?? null,
      metrics: afterInstance?.metrics ?? null,
    },
  })}\n`);
} finally {
  await runtime.close();
}

async function readProbe(instance, suffix) {
  return runtime.call("figma_exec", {
    code: "return { fileName: figma.root.name, pageId: figma.currentPage.id, pageName: figma.currentPage.name, childCount: figma.currentPage.children.length };",
    runtimeSdk: "v2",
    maxOutputChars: 2000,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    traceId: `${traceRoot}:${suffix}`,
    attempt: 1,
    capability: "figma-native",
    operation: {
      label: "Benchmark read-only Figma round trip",
      kind: "read",
      phase: "verify",
      planId: "figma-runtime-benchmark",
      stepId: suffix,
      representation: "metric-cards",
      target: `${instance.fileName || "Figma file"} / ${instance.pageName || "current page"}`,
      postconditions: ["Read returns current page identity without mutation"],
    },
  });
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    minMs: round(sorted[0]),
    medianMs: round(percentile(sorted, 0.5)),
    meanMs: round(total / sorted.length),
    p95Ms: round(percentile(sorted, 0.95)),
    maxMs: round(sorted[sorted.length - 1]),
  };
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function integerOption(name, fallback, min, max) {
  const raw = readOption(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer from ${min} to ${max}.`);
  return value;
}
