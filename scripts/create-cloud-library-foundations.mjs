import { RuntimeClient } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "tri-brand-cloud-library-foundations" });
const requestedInstanceId = process.argv.find((arg) => arg.startsWith("--instance-id="))?.slice("--instance-id=".length);
const traceRoot = `tri-brand-cloud-library-foundations:${Date.now()}`;

const code = String.raw`
await figma.currentPage.loadAsync();
const collectionName = "Tri Brand / Paper";
const specs = [
  { name: "color/surface", value: { r: 0.965, g: 0.945, b: 0.910 }, scopes: ["FRAME_FILL", "SHAPE_FILL"], css: "var(--brand-surface)" },
  { name: "color/panel", value: { r: 1.000, g: 0.992, b: 0.973 }, scopes: ["FRAME_FILL", "SHAPE_FILL"], css: "var(--brand-panel)" },
  { name: "color/ink", value: { r: 0.090, g: 0.082, b: 0.071 }, scopes: ["TEXT_FILL", "SHAPE_FILL"], css: "var(--brand-ink)" },
  { name: "color/muted", value: { r: 0.408, g: 0.380, b: 0.345 }, scopes: ["TEXT_FILL"], css: "var(--brand-muted)" },
  { name: "color/line", value: { r: 0.847, g: 0.812, b: 0.757 }, scopes: ["STROKE_COLOR", "SHAPE_FILL"], css: "var(--brand-line)" },
  { name: "color/ember", value: { r: 0.902, g: 0.310, b: 0.180 }, scopes: ["SHAPE_FILL"], css: "var(--brand-accent)" },
  { name: "color/forest", value: { r: 0.184, g: 0.388, b: 0.322 }, scopes: ["TEXT_FILL", "SHAPE_FILL"], css: "var(--brand-accent-alt)" }
];

let collection = (await figma.variables.getLocalVariableCollectionsAsync()).find((item) => item.name === collectionName);
let collectionCreated = false;
if (!collection) {
  collection = figma.variables.createVariableCollection(collectionName);
  collectionCreated = true;
}
const modeId = collection.modes[0].modeId;
const variables = await figma.variables.getLocalVariablesAsync();
const createdVariableIds = [];
const updatedVariableIds = [];
const variableRows = [];
for (const spec of specs) {
  let variable = variables.find((item) => item.variableCollectionId === collection.id && item.name === spec.name);
  if (!variable) {
    variable = figma.variables.createVariable(spec.name, collection, "COLOR");
    createdVariableIds.push(variable.id);
  } else {
    updatedVariableIds.push(variable.id);
  }
  variable.description = "Tri Brand Paper semantic token; source: source/src/brand.css";
  variable.scopes = [...spec.scopes];
  variable.setVariableCodeSyntax("WEB", spec.css);
  variable.setValueForMode(modeId, spec.value);
  variableRows.push({ name: spec.name, id: variable.id, scopes: [...variable.scopes], codeSyntax: { ...variable.codeSyntax } });
}

return {
  collection: { id: collection.id, name: collection.name, modeId, modeName: collection.modes[0].name, created: collectionCreated },
  variables: variableRows,
  createdVariableIds,
  updatedVariableIds,
  state: "PASS_FOUNDATIONS_CREATED"
};
`;

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = requestedInstanceId
    ? status.instances.find((item) => item.instanceId === requestedInstanceId)
    : status.instances.find((item) => item.fileName === "Tri Brand / Personal Homepage Library");
  if (!instance) throw new Error("Cloud library Figma instance not found. Use --instance-id from runtime status.");
  const result = await runtime.call("figma_exec", {
    code,
    runtimeSdk: "v2",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-design-system",
    traceId: `${traceRoot}:create-foundations`,
    attempt: 1,
    operation: {
      label: "Create Tri Brand Paper library foundations",
      kind: "write",
      phase: "execute",
      planId: "tri-brand-cross-file-library",
      stepId: "P1.b",
      representation: "table",
      target: `${instance.fileName} / ${instance.pageName}`,
      postconditions: ["Tri Brand Paper collection exists", "All semantic variables have explicit scopes and WEB code syntax"],
    },
  }, 180_000);
  process.stdout.write(`${JSON.stringify({ instance: { instanceId: instance.instanceId, fileName: instance.fileName, pageId: instance.pageId }, result }, null, 2)}\n`);
} finally {
  await runtime.close();
}
