import { RuntimeClient, assert, textPayload } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-component-proof" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const nodeId = process.argv.find((arg) => arg.startsWith("--node-id="))?.slice("--node-id=".length) || "1:16";

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = status.instances.find((item) => item.instanceId === instanceId);
  if (!instance) throw new Error("Cloud library instance not found.");
  const exported = await runtime.callRaw("figma_export", {
    nodeId,
    format: "PNG",
    constraint: { type: "SCALE", value: 2 },
    contentsOnly: true,
    colorProfile: "SRGB",
    maxBytes: 32 * 1024 * 1024,
    filename: "tri-brand-cloud-library-work-card",
    instanceId: instance.instanceId,
    pageId: "1:9",
    capability: "figma-verification",
    traceId: `tri-brand-cloud-library-component-proof:${Date.now()}:export`,
    attempt: 1,
    operation: {
      label: "Export cloud library Work Card component",
      kind: "export",
      phase: "verify",
      planId: "tri-brand-cross-file-library",
      stepId: "P3.g",
      representation: "artifact",
      target: `${instance.fileName} / 02 - Components / ${nodeId}`,
      postconditions: ["Export comes from the exact component master", "Preview and linked master remain inspectable"],
    },
  }, 330_000);
  assert(exported.isError !== true, `figma_export failed: ${JSON.stringify(textPayload(exported))}`);
  process.stdout.write(`${JSON.stringify({ instance: { instanceId: instance.instanceId, fileName: instance.fileName }, nodeId, artifact: exported.structuredContent?.artifact || textPayload(exported).artifact, verdict: "PASS" }, null, 2)}\n`);
} finally {
  await runtime.close();
}
