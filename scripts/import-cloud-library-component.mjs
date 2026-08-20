import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-import" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const sourceKey = process.argv.find((arg) => arg.startsWith("--component-key="))?.slice("--component-key=".length) || "bbefd58e46e99ee136d5ff8541ff6963c51c5db4";
const code = String.raw`
await figma.currentPage.loadAsync();
const page = figma.currentPage;
const existing = page.findOne((node) => node.type === "INSTANCE" && node.name === "Imported / Work Card / Featured");
if (existing) {
  const master = await existing.getMainComponentAsync();
  return { state: "PASS_ALREADY_IMPORTED", instance: { id: existing.id, name: existing.name, mainComponentId: master?.id ?? null, mainComponentKey: master?.key ?? null } };
}
const importedComponent = await figma.importComponentByKeyAsync("SOURCE_COMPONENT_KEY");
if (!importedComponent) throw new Error("Figma returned no imported component.");
const importedInstance = importedComponent.createInstance();
importedInstance.name = "Imported / Work Card / Featured";
importedInstance.x = 80;
importedInstance.y = 80;
page.appendChild(importedInstance);
const importedProperties = importedInstance.componentProperties;
const propertyKey = (prefix) => Object.keys(importedProperties).find((name) => name.startsWith(prefix));
importedInstance.setProperties({
  State: "Featured",
  [propertyKey("Title#")]: "Imported Work Card",
  [propertyKey("Index#")]: "04",
  [propertyKey("Meta#")]: "LIBRARY  /  IMPORTED",
});
const main = await importedInstance.getMainComponentAsync();
return {
  state: "PASS_CROSS_FILE_COMPONENT_IMPORTED",
  importedComponent: { id: importedComponent.id, key: importedComponent.key, name: importedComponent.name, remote: importedComponent.remote },
  instance: { id: importedInstance.id, name: importedInstance.name, mainComponentId: main?.id ?? null, mainComponentKey: main?.key ?? null, componentProperties: importedInstance.componentProperties }
};
`.replace("SOURCE_COMPONENT_KEY", sourceKey);

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = status.instances.find((item) => item.instanceId === instanceId);
  if (!instance) throw new Error("Consumer instance not found.");
  const result = await runtime.call("figma_exec", {
    code,
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-design-to-design",
    traceId: `tri-brand-cloud-library-import:${Date.now()}`,
    attempt: 1,
    operation: {
      label: "Import Tri Brand Work Card into consumer file",
      kind: "write",
      phase: "execute",
      planId: "tri-brand-cross-file-library",
      stepId: "P4.import",
      representation: "component-specimen",
      target: `${instance.fileName} / ${instance.pageName}`,
      postconditions: ["Target instance links to the source component key", "Target properties are configurable"],
    },
  }, 180_000);
  process.stdout.write(`${JSON.stringify({ result }, null, 2)}\n`);
} finally {
  await runtime.close();
}
