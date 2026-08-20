import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-component" });
const instanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const traceRoot = `tri-brand-cloud-library-component:${Date.now()}`;

const code = String.raw`
const componentsPage = figma.root.children.find((node) => node.type === "PAGE" && node.name === "02 - Components");
if (!componentsPage) throw new Error("02 - Components page not found.");
await figma.setCurrentPageAsync(componentsPage);
await componentsPage.loadAsync();
const collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((item) => item.name === "Tri Brand / Paper");
if (!collection) throw new Error("Tri Brand / Paper collection not found.");
const variables = await figma.variables.getLocalVariablesAsync();
const variable = (name) => variables.find((item) => item.variableCollectionId === collection.id && item.name === name);
const panel = variable("color/panel");
const ink = variable("color/ink");
const muted = variable("color/muted");
const line = variable("color/line");
const ember = variable("color/ember");
const forest = variable("color/forest");
if (![panel, ink, muted, line, ember, forest].every(Boolean)) throw new Error("Required Paper variables are incomplete.");

const available = await figma.listAvailableFontsAsync();
function resolveFont(family, style) {
  const exact = available.find((entry) => entry.fontName.family === family && entry.fontName.style === style);
  if (exact) return exact.fontName;
  const familyMatch = available.find((entry) => entry.fontName.family === family);
  if (familyMatch) return familyMatch.fontName;
  return available.find((entry) => entry.fontName.family === "Arial" && entry.fontName.style === "Regular")?.fontName ?? { family: "Inter", style: "Regular" };
}
const loadedFonts = new Set();
async function loadFont(fontName) {
  const key = fontName.family + "/" + fontName.style;
  if (!loadedFonts.has(key)) { await figma.loadFontAsync(fontName); loadedFonts.add(key); }
}
function boundPaint(color, colorVariable) {
  return figma.variables.setBoundVariableForPaint({ type: "SOLID", color }, "color", colorVariable);
}
async function addText(parent, name, characters, size, fontSpec, color, colorVariable) {
  const fontName = resolveFont(fontSpec[0], fontSpec[1]);
  await loadFont(fontName);
  const node = figma.createText();
  node.name = name;
  node.fontName = fontName;
  node.fontSize = size;
  node.characters = characters;
  node.textAutoResize = "HEIGHT";
  node.fills = [boundPaint(color, colorVariable)];
  parent.appendChild(node);
  node.layoutSizingHorizontal = "FILL";
  node.layoutSizingVertical = "HUG";
  return node;
}

let component = componentsPage.findOne((node) => node.type === "COMPONENT" && node.name === "Work Card / Default");
const createdNodeIds = [];
if (!component) {
  component = figma.createComponent();
  component.name = "Work Card / Default";
  component.description = "Reusable Tri Brand Paper work card. Consumer files should import this component rather than rebuild it.";
  component.resize(390, 184);
  component.layoutMode = "VERTICAL";
  component.primaryAxisSizingMode = "FIXED";
  component.counterAxisSizingMode = "FIXED";
  component.paddingTop = 24;
  component.paddingRight = 24;
  component.paddingBottom = 20;
  component.paddingLeft = 24;
  component.itemSpacing = 10;
  component.cornerRadius = 2;
  component.clipsContent = true;
  component.fills = [boundPaint({ r: 1, g: 1, b: 1 }, panel)];
  component.strokes = [boundPaint({ r: 0.847, g: 0.812, b: 0.757 }, line)];
  component.strokeWeight = 1;
  componentsPage.appendChild(component);
  createdNodeIds.push(component.id);

  const accent = figma.createRectangle();
  accent.name = "Card Accent";
  accent.resize(54, 4);
  accent.cornerRadius = 2;
  accent.fills = [boundPaint({ r: 0.902, g: 0.310, b: 0.180 }, ember)];
  component.appendChild(accent);
  accent.layoutSizingHorizontal = "FIXED";
  accent.layoutSizingVertical = "FIXED";
  createdNodeIds.push(accent.id);

  const index = await addText(component, "Card Index", "01", 10, ["IBM Plex Mono", "Bold"], { r: 0.184, g: 0.388, b: 0.322 }, forest);
  const title = await addText(component, "Card Title", "ControlMux", 24, ["Georgia", "Regular"], { r: 0.090, g: 0.082, b: 0.071 }, ink);
  const description = await addText(component, "Card Description", "A local control plane for useful agent work.", 13, ["Arial", "Regular"], { r: 0.408, g: 0.380, b: 0.345 }, muted);
  const type = await addText(component, "Card Type", "SYSTEMS  /  TOOLING", 9, ["IBM Plex Mono", "Bold"], { r: 0.408, g: 0.380, b: 0.345 }, muted);
  createdNodeIds.push(index.id, title.id, description.id, type.id);
}

let preview = componentsPage.findOne((node) => node.type === "INSTANCE" && node.name === "Work Card / Preview");
if (!preview) {
  preview = component.createInstance();
  preview.name = "Work Card / Preview";
  preview.x = 560;
  preview.y = 80;
  componentsPage.appendChild(preview);
  createdNodeIds.push(preview.id);
}

const publishStatus = await component.getPublishStatusAsync();
return {
  state: "PASS_COMPONENT_CREATED",
  page: { id: componentsPage.id, name: componentsPage.name },
  component: { id: component.id, name: component.name, key: component.key, remote: component.remote, publishStatus, childCount: component.children.length },
  preview: { id: preview.id, name: preview.name, mainComponentId: (await preview.getMainComponentAsync())?.id ?? null },
  createdNodeIds,
  variableBindings: [panel, ink, muted, line, ember, forest].map((item) => ({ id: item.id, name: item.name })),
  limitation: component.remote ? null : "Component is local in source file; publish/import must be verified before cross-file PASS."
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
    traceId: `${traceRoot}:create-component`,
    attempt: 1,
    operation: {
      label: "Create Tri Brand Work Card library component",
      kind: "write",
      phase: "execute",
      planId: "tri-brand-cross-file-library",
      stepId: "P3.b",
      representation: "component-specimen",
      target: `${instance.fileName} / 02 - Components`,
      postconditions: ["Work Card uses Paper variable bindings", "Preview instance links to the exact component master"],
    },
  }, 180_000);
  process.stdout.write(`${JSON.stringify({ instance: { instanceId: instance.instanceId, fileName: instance.fileName }, result }, null, 2)}\n`);
} finally {
  await runtime.close();
}
