import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "figma-typed-sync-readback" });
try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = runtime.resolveSingleInstance(status);
  const result = await runtime.call("figma_exec", {
    code: "return figma.currentPage.findAll(function (node) { return node.type === 'TEXT' && node.name === 'Sync Lab Label'; }).map(function (node) { return { id: node.id, characters: node.characters, parentId: node.parent ? node.parent.id : null }; });",
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    traceId: "readback-sync-text",
    capability: "figma-verification",
    operation: { label: "Read back UI-edited sync text", kind: "read", phase: "verify", target: `${instance.fileName} / ${instance.pageName}`, postconditions: ["Text value is returned from the Figma document"] },
  });
  process.stdout.write(`${JSON.stringify({ result })}\n`);
} finally {
  await runtime.close();
}
