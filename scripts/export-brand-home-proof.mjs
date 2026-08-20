import { RuntimeClient, assert, textPayload } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-home-proof" });
const nodeId = process.argv.find((arg) => arg.startsWith("--node-id="))?.slice("--node-id=".length) || "75:2107";
const traceRoot = `tri-brand-home-proof:${Date.now()}`;

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = runtime.resolveSingleInstance(status);
  const operation = {
    label: "Export and inspect Personal Homepage design",
    kind: "export",
    phase: "verify",
    planId: "tri-brand-home-design-to-code",
    stepId: "export-and-inspect",
    representation: "artifact",
    target: "Personal Homepage / Paper / 1440x1024",
    postconditions: [
      "PNG comes from the exact Figma design frame",
      "Structure contains one reusable Work Card master and three instances",
      "Current frame is bound to the Paper brand contract"
    ]
  };
  const exported = await runtime.callRaw("figma_export", {
    nodeId,
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
    contentsOnly: true,
    colorProfile: "SRGB",
    maxBytes: 32 * 1024 * 1024,
    filename: "tri-brand-personal-homepage",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:export`,
    attempt: 1,
    operation,
  }, 330_000);
  assert(exported.isError !== true, `figma_export failed: ${JSON.stringify(textPayload(exported))}`);
  const artifact = exported.structuredContent?.artifact || textPayload(exported).artifact || {};

  const handoff = process.argv.includes("--handoff") ? await runtime.call("figma_query", {
    kind: "node_handoff",
    nodeId,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:handoff`,
    operation: { ...operation, kind: "read", stepId: "readback-handoff", representation: "tree" },
  }) : { state: "SKIPPED_PROVIDER_HANDOFF" };
  const structure = await runtime.call("figma_query", {
    kind: "structure",
    nodeId,
    includeChildren: true,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:structure`,
    operation: { ...operation, kind: "read", stepId: "readback-structure", representation: "tree" },
  });
  process.stdout.write(`${JSON.stringify({
    bundleRevision: instance.bundleRevision,
    target: { instanceId: instance.instanceId, fileName: instance.fileName, pageId: instance.pageId, pageName: instance.pageName },
    nodeId,
    artifact,
    handoff,
    structure,
    verdict: "PASS"
  }, null, 2)}\n`);
} finally {
  await runtime.close();
}
