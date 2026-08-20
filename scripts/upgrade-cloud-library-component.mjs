import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-component-upgrade" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const code = String.raw`
await figma.currentPage.loadAsync();
const page = figma.currentPage;
const existingSet = page.findOne((node) => node.type === "COMPONENT_SET" && node.name === "Work Card / Default");
if (existingSet) {
  const preview = page.findOne((node) => node.type === "INSTANCE" && node.name === "Work Card / Preview");
  return {
    state: "PASS_ALREADY_UPGRADED",
    componentSet: { id: existingSet.id, name: existingSet.name, properties: existingSet.componentPropertyDefinitions },
    preview: preview ? { id: preview.id, mainComponentId: (await preview.getMainComponentAsync())?.id ?? null, componentProperties: preview.componentProperties } : null,
    mutatedNodeIds: []
  };
}

const component = page.findOne((node) => node.type === "COMPONENT" && node.name === "Work Card / Default");
if (!component) throw new Error("Work Card / Default master not found.");
const preview = page.findOne((node) => node.type === "INSTANCE" && node.name === "Work Card / Preview");
const mutatedNodeIds = [component.id];
const propertyIds = {};

function addOrFindProperty(name, type, defaultValue) {
  const existing = Object.entries(component.componentPropertyDefinitions).find(([, definition]) => definition.type === type && definition.name === name);
  if (existing) return existing[0];
  return component.addComponentProperty(name, type, defaultValue);
}

propertyIds.title = addOrFindProperty("Title", "TEXT", "ControlMux");
propertyIds.description = addOrFindProperty("Description", "TEXT", "A local control plane for useful agent work.");
propertyIds.meta = addOrFindProperty("Meta", "TEXT", "SYSTEMS  /  TOOLING");
propertyIds.index = addOrFindProperty("Index", "TEXT", "01");
propertyIds.showDescription = addOrFindProperty("Show Description", "BOOLEAN", true);
propertyIds.showMeta = addOrFindProperty("Show Meta", "BOOLEAN", true);
propertyIds.showIndex = addOrFindProperty("Show Index", "BOOLEAN", true);
propertyIds.showArrow = addOrFindProperty("Show Arrow", "BOOLEAN", true);

const ref = (name, references) => {
  const node = component.findOne((item) => item.name === name);
  if (!node) throw new Error(name + " not found.");
  node.componentPropertyReferences = { ...(node.componentPropertyReferences ?? {}), ...references };
  mutatedNodeIds.push(node.id);
  return node;
};
ref("Card Title", { characters: propertyIds.title });
ref("Card Description", { characters: propertyIds.description, visible: propertyIds.showDescription });
ref("Card Type", { characters: propertyIds.meta, visible: propertyIds.showMeta });
ref("Card Index", { characters: propertyIds.index, visible: propertyIds.showIndex });

let arrow = component.findOne((item) => item.name === "Card Arrow");
if (!arrow) {
  const available = await figma.listAvailableFontsAsync();
  const fontName = available.find((entry) => entry.fontName.family === "IBM Plex Mono" && entry.fontName.style === "Bold")?.fontName
    ?? available.find((entry) => entry.fontName.family === "Arial" && entry.fontName.style === "Regular")?.fontName;
  if (!fontName) throw new Error("No usable font found for Card Arrow.");
  await figma.loadFontAsync(fontName);
  arrow = figma.createText();
  arrow.name = "Card Arrow";
  arrow.fontName = fontName;
  arrow.fontSize = 18;
  arrow.characters = "→";
  arrow.fills = [{ type: "SOLID", color: { r: 0.184, g: 0.388, b: 0.322 } }];
  component.appendChild(arrow);
  arrow.layoutPositioning = "ABSOLUTE";
  arrow.x = component.width - 54;
  arrow.y = component.height - 42;
  arrow.componentPropertyReferences = { visible: propertyIds.showArrow };
  mutatedNodeIds.push(arrow.id);
}

component.description = "Reusable Tri Brand Paper work card with Title, Description, Meta, Index, visibility controls, and State variants.";
component.name = "State=Default";

const featured = component.clone();
featured.name = "State=Featured";
featured.x = 520;
featured.y = 80;
featured.resize(390, 216);
const compact = component.clone();
compact.name = "State=Compact";
compact.x = 960;
compact.y = 80;
compact.resize(390, 148);
const componentSet = figma.combineAsVariants([component, featured, compact], page);
componentSet.name = "Work Card / Default";
componentSet.description = "Reusable Tri Brand Paper work card family. Use State variants and exposed content/visibility properties.";
mutatedNodeIds.push(componentSet.id, featured.id, compact.id);

return {
  state: "PASS_COMPONENT_UPGRADED_IN_PLACE",
  componentSet: { id: componentSet.id, name: componentSet.name, properties: componentSet.componentPropertyDefinitions, variantCount: componentSet.children.length },
  originalMasterId: component.id,
  variants: componentSet.children.map((node) => ({ id: node.id, name: node.name, type: node.type })),
  preview: preview ? { id: preview.id, mainComponentId: (await preview.getMainComponentAsync())?.id ?? null, componentProperties: preview.componentProperties } : null,
  propertyIds,
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
    traceId: `tri-brand-cloud-library-component-upgrade:${Date.now()}`,
    attempt: 1,
    operation: {
      label: "Upgrade Work Card master in place",
      kind: "write",
      phase: "execute",
      planId: "tri-brand-cross-file-library",
      stepId: "P3.g-P3.j",
      representation: "component-specimen",
      target: `${instance.fileName} / 02 - Components / Work Card / Default`,
      postconditions: ["Original master id remains in the variant set", "Preview instance remains linked", "Properties and variants are readable"],
    },
  }, 180_000);
  process.stdout.write(`${JSON.stringify({ result }, null, 2)}\n`);
} finally {
  await runtime.close();
}
