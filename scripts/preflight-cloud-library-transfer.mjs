import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-transfer-preflight" });
const sourceInstanceId = process.argv.find((arg) => arg.startsWith("--source-instance-id="))?.slice("--source-instance-id=".length);
const targetInstanceId = process.argv.find((arg) => arg.startsWith("--target-instance-id="))?.slice("--target-instance-id=".length);
const sourceFileKey = process.argv.find((arg) => arg.startsWith("--source-file-key="))?.slice("--source-file-key=".length) || null;
const targetFileKey = process.argv.find((arg) => arg.startsWith("--target-file-key="))?.slice("--target-file-key=".length) || null;

async function readLibrary(instance, stepId, label) {
  return runtime.call("figma_query", {
    kind: "library_inventory",
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
  const sourceData = await readLibrary(source, "P0.source", "Preflight source library identity and publish status");
  const targetData = await readLibrary(target, "P0.target", "Preflight target library identity and consumer state");
  const sourceSet = sourceData.local?.components?.find((asset) => asset.type === "COMPONENT_SET" && asset.name === "Work Card / Default") ?? null;
  const targetInstances = targetData.local?.instances ?? [];
  const existingTarget = targetInstances.find((asset) => asset.name === "Imported / Work Card / Featured") ?? null;
  const publishStatus = sourceSet?.publishStatus ?? null;
  const sourceReady = publishStatus === "CURRENT" && sourceSet?.remote === true;
  const targetReady = !existingTarget;
  const state = sourceReady && targetReady
    ? "READY_FOR_IMPORT"
    : publishStatus === "UNPUBLISHED" || publishStatus === "CHANGED"
      ? "READY_FOR_PUBLISH"
      : "BLOCKED_PROVIDER_OR_IDENTITY";
  process.stdout.write(`${JSON.stringify({
    state,
    strategy: "REUSE_REMOTE",
    sourceIdentity: { instanceId: source.instanceId, fileKey: sourceFileKey ?? source.fileKey ?? null, observedPluginFileKey: sourceData.fileKey, fileName: source.fileName, pageId: source.pageId, componentSetId: sourceSet?.id ?? null, componentSetKey: sourceSet?.key ?? null, publishStatus, remote: sourceSet?.remote ?? null },
    targetIdentity: { instanceId: target.instanceId, fileKey: targetFileKey ?? target.fileKey ?? null, observedPluginFileKey: targetData.fileKey, fileName: target.fileName, pageId: target.pageId, existingTarget },
    sourceRead: { file: { fileName: sourceData.fileName, fileKey: sourceData.fileKey }, componentSet: sourceSet, publicationAuthority: sourceData.publicationAuthority },
    targetRead: { file: { fileName: targetData.fileName, fileKey: targetData.fileKey }, instances: targetInstances },
    writePerformed: false,
    nextAction: state === "READY_FOR_IMPORT"
      ? "Run import-cloud-library-component.mjs through typed figma_apply, then read back mainComponentKey and properties."
      : state === "READY_FOR_PUBLISH"
        ? "Publish the component set through Figma authority, then rerun this typed preflight."
        : "Resolve provider/identity boundary before any write",
  }, null, 2)}\n`);
} finally {
  await runtime.close();
}
