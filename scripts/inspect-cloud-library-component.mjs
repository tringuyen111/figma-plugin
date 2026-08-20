import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "inspect-work-card-contract" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const code = String.raw`
await figma.currentPage.loadAsync();
const page = figma.currentPage;
const component = page.findOne((node) => (node.type === "COMPONENT" || node.type === "COMPONENT_SET") && node.name === "Work Card / Default");
const preview = page.findOne((node) => node.type === "INSTANCE" && node.name === "Work Card / Preview");
if (!component) throw new Error("Work Card / Default not found.");
let properties = null;
let propertyError = null;
try { properties = component.componentPropertyDefinitions; } catch (error) { propertyError = error instanceof Error ? error.message : String(error); }
const previewMainComponentId = preview ? (await preview.getMainComponentAsync())?.id ?? null : null;
return {
  page: { id: page.id, name: page.name },
  component: {
    id: component.id,
    type: component.type,
    key: component.key,
    name: component.name,
    remote: component.remote,
    children: component.children.map((node) => ({ id: node.id, name: node.name, type: node.type, visible: node.visible })),
    properties,
    propertyError,
    publishStatus: await component.getPublishStatusAsync(),
    variantChildren: component.type === "COMPONENT_SET" ? component.children.map((variant) => {
      let references = null;
      let referencesError = null;
      try { references = variant.children.map((child) => ({ id: child.id, name: child.name, references: child.componentPropertyReferences })); } catch (error) { referencesError = error instanceof Error ? error.message : String(error); }
      return { id: variant.id, name: variant.name, references, referencesError };
    }) : null,
  },
  preview: preview ? (() => {
    let componentProperties = null;
    let componentPropertiesError = null;
    try { componentProperties = preview.componentProperties; } catch (error) { componentPropertiesError = error instanceof Error ? error.message : String(error); }
    return { id: preview.id, mainComponentId: previewMainComponentId, componentProperties, componentPropertiesError };
  })() : null,
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
    traceId: `inspect-work-card-contract:${Date.now()}`,
    attempt: 1,
    operation: {
      label: "Inspect Work Card component contract",
      kind: "read",
      phase: "inspect",
      planId: "tri-brand-cross-file-library",
      stepId: "P3.f",
      representation: "component-specimen",
      target: "Tri Brand / Personal Homepage Library / Work Card / Default",
      postconditions: ["Master id and preview mainComponentId are stable"],
    },
  }, 180_000);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await runtime.close();
}
