import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-component-set-repair" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const code = String.raw`
await figma.currentPage.loadAsync();
const page = figma.currentPage;
const componentSet = page.findOne((node) => node.type === "COMPONENT_SET" && node.name === "Work Card / Default");
if (!componentSet) throw new Error("Work Card / Default component set not found.");
const namesById = { "1:16": "State=Default", "2:30": "State=Featured", "2:37": "State=Compact" };
const mutatedNodeIds = [];
for (const variant of componentSet.children) {
  const nextName = namesById[variant.id];
  if (!nextName) throw new Error("Unexpected variant id " + variant.id + "; refusing to guess.");
  if (variant.name !== nextName) variant.name = nextName;
  mutatedNodeIds.push(variant.id);
}
let properties = null;
let propertyError = null;
try { properties = componentSet.componentPropertyDefinitions; } catch (error) { propertyError = error instanceof Error ? error.message : String(error); }
return {
  state: propertyError ? "FAIL_COMPONENT_SET_STILL_INVALID" : "PASS_VARIANT_NAMES_REPAIRED",
  componentSet: { id: componentSet.id, name: componentSet.name, properties, propertyError, variants: componentSet.children.map((variant) => ({ id: variant.id, name: variant.name })) },
  mutatedNodeIds,
};
`;

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = status.instances.find((item) => item.instanceId === instanceId);
  if (!instance) throw new Error("Cloud library instance not found.");
  const result = await runtime.call("figma_exec", {
    code,
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: "1:9",
    capability: "figma-components",
    traceId: `tri-brand-cloud-library-component-set-repair:${Date.now()}`,
    attempt: 1,
    operation: {
      label: "Repair Work Card variant names in place",
      kind: "write",
      phase: "recover",
      planId: "tri-brand-cross-file-library",
      stepId: "P3.repair-variant-names",
      representation: "component-specimen",
      target: `${instance.fileName} / 02 - Components / Work Card / Default`,
      postconditions: ["Variant names are unique", "Component set property definitions read without errors"],
    },
  }, 180_000);
  process.stdout.write(`${JSON.stringify({ result }, null, 2)}\n`);
} finally {
  await runtime.close();
}
