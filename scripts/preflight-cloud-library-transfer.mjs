import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-transfer-preflight" });
const sourceInstanceId = process.argv.find((arg) => arg.startsWith("--source-instance-id="))?.slice("--source-instance-id=".length);
const targetInstanceId = process.argv.find((arg) => arg.startsWith("--target-instance-id="))?.slice("--target-instance-id=".length);
const sourceFileKey = process.argv.find((arg) => arg.startsWith("--source-file-key="))?.slice("--source-file-key=".length) || null;
const targetFileKey = process.argv.find((arg) => arg.startsWith("--target-file-key="))?.slice("--target-file-key=".length) || null;

const sourceCode = String.raw`
await figma.currentPage.loadAsync();
const page = figma.currentPage;
const set = page.findOne((node) => node.type === "COMPONENT_SET" && node.name === "Work Card / Default");
if (!set) throw new Error("Source component set Work Card / Default not found.");
const variants = set.children.map((variant) => ({ id: variant.id, name: variant.name, key: variant.key, remote: variant.remote }));
return {
  fileName: figma.root.name,
  fileKey: figma.fileKey ?? null,
  page: { id: page.id, name: page.name },
  componentSet: { id: set.id, key: set.key, name: set.name, remote: set.remote, publishStatus: await set.getPublishStatusAsync(), variantCount: variants.length, variants },
};
`;

const targetCode = String.raw`
await figma.currentPage.loadAsync();
const page = figma.currentPage;
const existing = page.findAll((node) => node.type === "INSTANCE" && node.name === "Imported / Work Card / Featured");
return { fileName: figma.root.name, fileKey: figma.fileKey ?? null, page: { id: page.id, name: page.name }, existingTargetInstances: existing.map((node) => ({ id: node.id, name: node.name })) };
`;

async function read(instance, code, stepId, label) {
  return runtime.call("figma_exec", {
    code,
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-design-to-design",
    traceId: `tri-brand-cloud-library-transfer-preflight:${Date.now()}:${stepId}`,
    attempt: 1,
    operation: {
      label,
      kind: "read",
      phase: "inspect",
      planId: "tri-brand-cross-file-library",
      stepId,
      representation: "typed-graph",
      target: `${instance.fileName} / ${instance.pageName}`,
      postconditions: ["Exact instance and file identity are bound", "No write is performed during preflight"],
    },
  }, 60_000);
}

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const source = status.instances.find((item) => item.instanceId === sourceInstanceId);
  const target = status.instances.find((item) => item.instanceId === targetInstanceId);
  if (!source || !target) throw new Error("Both source and target instances are required.");
  const sourceRead = await read(source, sourceCode, "P0.source", "Preflight source library publish status");
  const targetRead = await read(target, targetCode, "P0.target", "Preflight target consumer state");
  const sourceData = sourceRead?.result ?? sourceRead;
  const targetData = targetRead?.result ?? targetRead;
  const publishStatus = sourceData.componentSet?.publishStatus ?? null;
  const sourceReady = publishStatus === "CURRENT" && sourceData.componentSet?.remote === true;
  const targetReady = Array.isArray(targetData.existingTargetInstances) && targetData.existingTargetInstances.length === 0;
  const state = sourceReady && targetReady ? "READY_FOR_IMPORT" : publishStatus === "UNPUBLISHED" ? "READY_FOR_PUBLISH" : "BLOCKED_PROVIDER_OR_IDENTITY";
  process.stdout.write(`${JSON.stringify({
    state,
    strategy: "REUSE_REMOTE",
    sourceIdentity: { instanceId: source.instanceId, fileKey: sourceFileKey ?? source.fileKey ?? null, observedPluginFileKey: sourceData.fileKey, fileName: source.fileName, pageId: source.pageId, componentSetId: sourceData.componentSet?.id ?? null, componentSetKey: sourceData.componentSet?.key ?? null },
    targetIdentity: { instanceId: target.instanceId, fileKey: targetFileKey ?? target.fileKey ?? null, observedPluginFileKey: targetData.fileKey, fileName: target.fileName, pageId: target.pageId },
    sourceRead: sourceData,
    targetRead: targetData,
    writePerformed: false,
    nextAction: state === "READY_FOR_IMPORT" ? "Run import-cloud-library-component.mjs" : state === "READY_FOR_PUBLISH" ? "Publish the component set in Figma UI, then rerun this preflight" : "Resolve provider/identity boundary before any write",
  }, null, 2)}\n`);
} finally {
  await runtime.close();
}
