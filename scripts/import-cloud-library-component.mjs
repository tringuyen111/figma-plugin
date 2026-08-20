import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-import" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const sourceKey = process.argv.find((arg) => arg.startsWith("--component-set-key="))?.slice("--component-set-key=".length)
  || process.argv.find((arg) => arg.startsWith("--component-key="))?.slice("--component-key=".length)
  || "edfe507b7a980545361a9bd7ef2dfa3aede08154";
const confirmed = process.argv.includes("--confirm");

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = status.instances.find((item) => item.instanceId === instanceId);
  if (!instance) throw new Error("Consumer instance not found.");
  const result = await runtime.call("figma_apply", {
    action: "import_library_asset",
    assetType: "component_set",
    key: sourceKey,
    dryRun: !confirmed,
    ...(confirmed ? { confirm: true } : {}),
    instanceName: "Imported / Work Card / Featured",
    x: 80,
    y: 80,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-design-to-design",
    traceId: `tri-brand-cloud-library-import:${Date.now()}`,
    attempt: 1,
    operation: {
      label: confirmed ? "Import Tri Brand Work Card into consumer file" : "Plan Tri Brand Work Card import into consumer file",
      kind: "write",
      phase: confirmed ? "execute" : "plan",
      planId: "tri-brand-cross-file-library",
      stepId: "P4.import",
      representation: "component-specimen",
      target: `${instance.fileName} / ${instance.pageName}`,
      postconditions: confirmed ? ["Target instance links to the source component key", "Target properties are configurable"] : ["Exact published key and target page are planned", "No write is performed"],
    },
  }, confirmed ? 180_000 : 90_000);
  process.stdout.write(`${JSON.stringify({ confirmed, result }, null, 2)}\n`);
} finally {
  await runtime.close();
}
