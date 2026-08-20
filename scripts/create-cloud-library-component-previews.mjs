import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-component-previews" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const code = String.raw`
await figma.currentPage.loadAsync();
const page = figma.currentPage;
const componentSet = page.findOne((node) => node.type === "COMPONENT_SET" && node.name === "Work Card / Default");
if (!componentSet) throw new Error("Work Card / Default component set not found.");
const defaultVariant = componentSet.children.find((node) => node.type === "COMPONENT" && node.name === "State=Default");
if (!defaultVariant) throw new Error("State=Default variant not found.");
const definitions = componentSet.componentPropertyDefinitions;
const key = (prefix) => Object.keys(definitions).find((name) => name.startsWith(prefix));
const properties = {
  title: key("Title#"),
  description: key("Description#"),
  meta: key("Meta#"),
  index: key("Index#"),
  showDescription: key("Show Description#"),
  state: "State",
};
if (!properties.title || !properties.description || !properties.meta || !properties.index || !properties.showDescription) throw new Error("Expected component property keys are missing.");

function findInstance(name) { return page.findOne((node) => node.type === "INSTANCE" && node.name === name); }
function makePreview(name, x, y, values) {
  let instance = findInstance(name);
  const created = !instance;
  if (!instance) {
    instance = defaultVariant.createInstance();
    instance.name = name;
    instance.x = x;
    instance.y = y;
    page.appendChild(instance);
  }
  instance.setProperties({
    [properties.title]: values.title,
    [properties.description]: values.description,
    [properties.meta]: values.meta,
    [properties.index]: values.index,
    [properties.showDescription]: values.showDescription,
    [properties.state]: values.state,
  });
  return { id: instance.id, name: instance.name, created, mainComponentId: null, componentProperties: instance.componentProperties };
}

const featured = makePreview("Work Card / Preview / Featured", 520, 360, {
  title: "Rental Manager Neo",
  description: "Operations made visible, calm, and actionable.",
  meta: "PRODUCT  /  OPERATIONS",
  index: "02",
  showDescription: true,
  state: "Featured",
});
const compact = makePreview("Work Card / Preview / Compact", 960, 360, {
  title: "Notes on clarity",
  description: "Working ideas for better product decisions.",
  meta: "WRITING  /  PRACTICE",
  index: "03",
  showDescription: false,
  state: "Compact",
});
for (const item of [featured, compact]) {
  const instance = await figma.getNodeByIdAsync(item.id);
  item.mainComponentId = (await instance.getMainComponentAsync())?.id ?? null;
}
return { state: "PASS_PREVIEW_INSTANCES_CONFIGURED", componentSetId: componentSet.id, properties, previews: [featured, compact] };
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
    traceId: `tri-brand-cloud-library-component-previews:${Date.now()}`,
    attempt: 1,
    operation: {
      label: "Configure Work Card property/state preview instances",
      kind: "write",
      phase: "execute",
      planId: "tri-brand-cross-file-library",
      stepId: "P3.k-preview",
      representation: "component-specimen",
      target: `${instance.fileName} / 02 - Components / Work Card / Default`,
      postconditions: ["Featured and Compact previews use the exposed property API", "Both instances remain linked to the component set"],
    },
  }, 180_000);
  process.stdout.write(`${JSON.stringify({ result }, null, 2)}\n`);
} finally {
  await runtime.close();
}
