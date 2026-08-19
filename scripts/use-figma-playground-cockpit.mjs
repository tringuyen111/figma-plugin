import { RuntimeClient, assert, readOption, textPayload } from "./lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "figma-playground-cockpit" });
const pageName = readOption("page") || "03 - Playground";
const requestedInstanceId = readOption("instance-id");
const traceRoot = `playground-cockpit:${Date.now()}`;
const planId = "figma-playground-cockpit";

try {
  await runtime.connect();
  const status = await runtime.status(true);
  const instance = runtime.resolveSingleInstance(status, requestedInstanceId);
  const inventory = await runtime.call("figma_query", {
    kind: "file_inventory",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:inspect-inventory`,
    operation: {
      label: "Locate playground target",
      kind: "read",
      phase: "inspect",
      planId,
      stepId: "locate-playground",
      representation: "tree",
      target: `${instance.fileName || "Figma file"} / ${pageName}`,
      postconditions: [`Exact page named ${pageName} is selected as the write target`],
    },
  });
  const page = inventory.pages?.find((candidate) => candidate.name === pageName);
  assert(page?.id, `Page ${pageName} was not found in the connected Figma file.`);
  const target = `${instance.fileName || "Figma file"} / ${page.name}`;

  const build = await runtime.call("figma_exec", {
    code: buildCode(page.id),
    runtimeSdk: "v2",
    maxOutputChars: 30000,
    instanceId: instance.instanceId,
    pageId: page.id,
    traceId: `${traceRoot}:compose`,
    capability: "figma-design-authoring",
    operation: {
      label: "Compose product-style runtime cockpit",
      kind: "write",
      phase: "execute",
      planId,
      stepId: "compose-cockpit",
      representation: "rendered-composition",
      target,
      postconditions: [
        "Connection is the primary focal point",
        "Activity is represented as a scannable list",
        "Metrics share one overview surface instead of equal-weight cards",
        "A connected status component is reused in two contexts",
        "The result is a rendered proof surface, not a production approval",
      ],
    },
  });

  const structure = await runtime.call("figma_query", {
    kind: "structure",
    nodeId: build.rootId,
    instanceId: instance.instanceId,
    pageId: page.id,
    capability: "figma-verification",
    traceId: `${traceRoot}:verify-structure`,
    operation: {
      label: "Read back cockpit structure",
      kind: "read",
      phase: "verify",
      planId,
      stepId: "readback-structure",
      representation: "tree",
      target,
      postconditions: ["The created root and visual regions are returned by the typed query"],
    },
  });

  const exportResult = await runtime.callRaw("figma_export", {
    nodeId: build.rootId,
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
    contentsOnly: true,
    colorProfile: "SRGB",
    maxBytes: 32 * 1024 * 1024,
    filename: "figma-playground-cockpit",
    instanceId: instance.instanceId,
    pageId: page.id,
    capability: "figma-verification",
    traceId: `${traceRoot}:export-proof`,
    attempt: 1,
    operation: {
      label: "Export the redesigned cockpit",
      kind: "export",
      phase: "verify",
      planId,
      stepId: "export-cockpit",
      representation: "artifact",
      target,
      postconditions: ["PNG is exported from the exact root that was read back"],
    },
  });
  assert(exportResult.isError !== true, `figma_export failed: ${JSON.stringify(textPayload(exportResult))}`);

  const exportPayload = textPayload(exportResult);
  const artifact = exportResult.structuredContent?.artifact || exportPayload.artifact || {};
  process.stdout.write(`${JSON.stringify({
    target: {
      instanceId: instance.instanceId,
      fileName: instance.fileName,
      pageId: page.id,
      pageName: page.name,
    },
    before: {
      pageCount: inventory.pages?.length || 0,
      pageChildren: page.childCount,
    },
    build,
    readback: summarizeStructure(structure),
    artifact,
  })}\n`);
} finally {
  await runtime.close();
}

function summarizeStructure(value) {
  if (!value || typeof value !== "object") return value;
  const record = value;
  return {
    keys: Object.keys(record),
    id: record.id || record.node?.id || record.root?.id || null,
    name: record.name || record.node?.name || record.root?.name || null,
    type: record.type || record.node?.type || record.root?.type || null,
    childCount: Array.isArray(record.children)
      ? record.children.length
      : Array.isArray(record.node?.children)
        ? record.node.children.length
        : Array.isArray(record.root?.children)
          ? record.root.children.length
          : null,
    raw: record,
  };
}

function buildCode(pageId) {
  const code = `
const TARGET_PAGE_ID = "__TARGET_PAGE_ID__";
const OWNED_KEY = "controlmuxPlaygroundProof";
const COLORS = {
  canvas: { r: 0.95, g: 0.96, b: 0.98 },
  surface: { r: 1, g: 1, b: 1 },
  ink: { r: 0.08, g: 0.1, b: 0.14 },
  muted: { r: 0.36, g: 0.41, b: 0.5 },
  quiet: { r: 0.58, g: 0.62, b: 0.69 },
  line: { r: 0.88, g: 0.9, b: 0.93 },
  blue: { r: 0.19, g: 0.32, b: 0.78 },
  blueSoft: { r: 0.92, g: 0.94, b: 1 },
  green: { r: 0.1, g: 0.5, b: 0.27 },
  greenSoft: { r: 0.88, g: 0.97, b: 0.9 },
  white: { r: 1, g: 1, b: 1 }
};
const FONTS = {
  regular: { family: "Inter", style: "Regular" },
  medium: { family: "Inter", style: "Medium" },
  semibold: { family: "Inter", style: "Semi Bold" }
};

await Promise.all([
  figma.loadFontAsync(FONTS.regular),
  figma.loadFontAsync(FONTS.medium),
  figma.loadFontAsync(FONTS.semibold)
]);

const page = await figmaPlugin.loadPage(TARGET_PAGE_ID);
const previous = page.children.filter(function (node) {
  return node.getPluginData(OWNED_KEY) === "true";
});
previous.forEach(function (node) { node.remove(); });
const previousOrphans = page.children.filter(function (node) {
  return node.type === "FRAME" && node.name === "01 / Header";
});
previousOrphans.forEach(function (node) { node.remove(); });

function solid(color, opacity) {
  return { type: "SOLID", color, opacity: opacity === undefined ? 1 : opacity };
}

function setFill(node, color, opacity) {
  node.fills = [solid(color, opacity)];
}

function setStroke(node, color, opacity) {
  node.strokes = [solid(color, opacity)];
  node.strokeWeight = 1;
  node.strokeAlign = "INSIDE";
}

function auto(node, mode, gap, padding) {
  node.layoutMode = mode;
  node.itemSpacing = gap;
  node.paddingTop = padding;
  node.paddingRight = padding;
  node.paddingBottom = padding;
  node.paddingLeft = padding;
}

function fixed(node, width, height) {
  node.resize(width, height);
  if ("primaryAxisSizingMode" in node && node.layoutMode !== "NONE") node.primaryAxisSizingMode = "FIXED";
  if ("counterAxisSizingMode" in node && node.layoutMode !== "NONE") node.counterAxisSizingMode = "FIXED";
}

function fillWidth(node) {
  node.layoutSizingHorizontal = "FILL";
  node.layoutAlign = "STRETCH";
}

function hug(node) {
  node.layoutSizingHorizontal = "HUG";
  node.layoutSizingVertical = "HUG";
}

function surface(node, color, radius) {
  setFill(node, color);
  node.cornerRadius = radius;
  setStroke(node, COLORS.line, 1);
}

const localPaintStyles = await figma.getLocalPaintStylesAsync();
const localTextStyles = await figma.getLocalTextStylesAsync();
function ensurePaintStyle(name, color) {
  const existing = localPaintStyles.find(function (style) { return style.name === name; });
  if (existing) return existing;
  const style = figma.createPaintStyle();
  style.name = name;
  style.paints = [solid(color)];
  return style;
}
function ensureTextStyle(name, fontName, fontSize, lineHeight) {
  const existing = localTextStyles.find(function (style) { return style.name === name; });
  if (existing) return existing;
  const style = figma.createTextStyle();
  style.name = name;
  style.fontName = fontName;
  style.fontSize = fontSize;
  style.lineHeight = { unit: "PIXELS", value: lineHeight };
  return style;
}

const styles = {
  canvas: ensurePaintStyle("Proof UI / Canvas", COLORS.canvas),
  surface: ensurePaintStyle("Proof UI / Surface", COLORS.surface),
  ink: ensurePaintStyle("Proof UI / Ink", COLORS.ink),
  blue: ensurePaintStyle("Proof UI / Action", COLORS.blue),
  label: ensureTextStyle("Proof UI / Label", FONTS.semibold, 10, 14),
  hero: ensureTextStyle("Proof UI / Hero", FONTS.semibold, 27, 33),
  section: ensureTextStyle("Proof UI / Section", FONTS.semibold, 16, 21),
  body: ensureTextStyle("Proof UI / Body", FONTS.regular, 13, 19),
  meta: ensureTextStyle("Proof UI / Meta", FONTS.medium, 11, 16),
  metric: ensureTextStyle("Proof UI / Metric", FONTS.semibold, 23, 28)
};

async function addText(parent, name, characters, style, color, paintStyleId, width) {
  const node = figma.createText();
  node.name = name;
  parent.appendChild(node);
  node.fontName = style.fontName;
  node.fontSize = style.fontSize;
  node.lineHeight = style.lineHeight;
  if (style.letterSpacing) node.letterSpacing = style.letterSpacing;
  node.characters = characters;
  node.fills = [solid(color)];
  if (width) {
    node.textAutoResize = "HEIGHT";
    node.resize(width, Math.max(node.height, 1));
  } else {
    node.textAutoResize = "WIDTH_AND_HEIGHT";
  }
  await node.setTextStyleIdAsync(style.id);
  if (paintStyleId) await node.setFillStyleIdAsync(paintStyleId);
  return node;
}

function addMark(parent, name, color, size, radius) {
  const mark = figma.createFrame();
  mark.name = name;
  parent.appendChild(mark);
  fixed(mark, size, size);
  setFill(mark, color);
  mark.cornerRadius = radius === undefined ? size / 2 : radius;
  return mark;
}

function addRule(parent, name, width) {
  const rule = figma.createRectangle();
  rule.name = name;
  parent.appendChild(rule);
  rule.resize(width || 1, 1);
  rule.layoutSizingHorizontal = "FIXED";
  rule.layoutSizingVertical = "FIXED";
  setFill(rule, COLORS.line);
  return rule;
}

function makeSurface(parent, name, width, height, padding, gap) {
  const node = figma.createFrame();
  node.name = name;
  parent.appendChild(node);
  auto(node, "VERTICAL", gap === undefined ? 12 : gap, padding === undefined ? 20 : padding);
  fixed(node, width, height);
  node.layoutSizingHorizontal = "FIXED";
  node.layoutSizingVertical = "FIXED";
  surface(node, COLORS.surface, 16);
  return node;
}

const root = figma.createFrame();
root.name = "Agent Use / Figma Plugin Proof";
page.appendChild(root);
root.setPluginData(OWNED_KEY, "true");
root.setPluginData("designIntent", JSON.stringify({
  surface: "runtime-cockpit",
  focalPath: ["connection", "activity", "next-use"],
  correction: "Replace equal-weight proof cards with one shared overview surface and an activity list"
}));
root.setPluginData("handoff", JSON.stringify({
  implementationBoundary: "Rendered product-style proof, not production approval",
  componentContract: "Connected status pill: dot + state label",
  nextStep: "Map activity rows to the plugin operation lifecycle"
}));
auto(root, "VERTICAL", 16, 24);
fixed(root, 1040, 760);
root.clipsContent = true;
root.x = 64;
root.y = 64;
surface(root, COLORS.canvas, 20);
await root.setFillStyleIdAsync(styles.canvas.id);

const topbar = figma.createFrame();
topbar.name = "01 / Topbar";
root.appendChild(topbar);
auto(topbar, "HORIZONTAL", 16, 0);
fixed(topbar, 992, 56);
fillWidth(topbar);
topbar.primaryAxisAlignItems = "SPACE_BETWEEN";
topbar.counterAxisAlignItems = "CENTER";

const brand = figma.createFrame();
brand.name = "Brand";
topbar.appendChild(brand);
auto(brand, "HORIZONTAL", 10, 0);
hug(brand);
brand.counterAxisAlignItems = "CENTER";
const logo = addMark(brand, "Brand / Mark", COLORS.blue, 32, 9);
await addText(logo, "Brand / Glyph", "F", styles.section, COLORS.white, undefined);
const brandCopy = figma.createFrame();
brandCopy.name = "Brand / Copy";
brand.appendChild(brandCopy);
auto(brandCopy, "VERTICAL", 1, 0);
hug(brandCopy);
await addText(brandCopy, "Brand / Name", "Figma Plugin", styles.section, COLORS.ink, styles.ink.id);
await addText(brandCopy, "Brand / Context", "Untitled · 03 - Playground", styles.meta, COLORS.muted, undefined);

const headerActions = figma.createFrame();
headerActions.name = "Topbar / Actions";
topbar.appendChild(headerActions);
auto(headerActions, "HORIZONTAL", 10, 0);
hug(headerActions);
headerActions.counterAxisAlignItems = "CENTER";
const statusMaster = figma.createComponent();
statusMaster.name = "Component / Status / Connected";
headerActions.appendChild(statusMaster);
auto(statusMaster, "HORIZONTAL", 8, 10);
hug(statusMaster);
statusMaster.counterAxisAlignItems = "CENTER";
surface(statusMaster, COLORS.greenSoft, 999);
addMark(statusMaster, "Status / Dot", COLORS.green, 8, 4);
await addText(statusMaster, "Status / Label", "Connected", styles.meta, COLORS.green, undefined);
statusMaster.description = "Reusable connection state: dot and label.";
statusMaster.setPluginData("semanticJob", "connection-state");

const hero = figma.createFrame();
hero.name = "02 / Connection Hero";
root.appendChild(hero);
auto(hero, "HORIZONTAL", 20, 20);
fixed(hero, 992, 120);
fillWidth(hero);
hero.counterAxisAlignItems = "CENTER";
surface(hero, COLORS.surface, 16);
const heroCopy = figma.createFrame();
heroCopy.name = "Hero / Copy";
hero.appendChild(heroCopy);
auto(heroCopy, "VERTICAL", 5, 0);
heroCopy.layoutSizingHorizontal = "FILL";
heroCopy.layoutSizingVertical = "HUG";
await addText(heroCopy, "Hero / Eyebrow", "CONNECTION", styles.label, COLORS.blue, styles.blue.id);
await addText(heroCopy, "Hero / Title", "Ready to work", styles.hero, COLORS.ink, styles.ink.id);
await addText(heroCopy, "Hero / Body", "The native bridge is connected to the current Figma file and ready for inspect, compose and verify.", styles.body, COLORS.muted, undefined, 560);

const heroSide = figma.createFrame();
heroSide.name = "Hero / State";
hero.appendChild(heroSide);
auto(heroSide, "VERTICAL", 8, 0);
hug(heroSide);
heroSide.counterAxisAlignItems = "MAX";
const heroStatus = statusMaster.createInstance();
heroStatus.name = "Instance / Status / Hero";
heroSide.appendChild(heroStatus);
hug(heroStatus);
const heroChips = figma.createFrame();
heroChips.name = "Hero / Signals";
heroSide.appendChild(heroChips);
auto(heroChips, "HORIZONTAL", 8, 0);
hug(heroChips);
const runtimeChip = figma.createFrame();
runtimeChip.name = "Signal / Runtime";
heroChips.appendChild(runtimeChip);
auto(runtimeChip, "VERTICAL", 2, 9);
hug(runtimeChip);
surface(runtimeChip, COLORS.blueSoft, 10);
await addText(runtimeChip, "Signal / Label", "RUNTIME", styles.label, COLORS.blue, styles.blue.id);
await addText(runtimeChip, "Signal / Value", "V2", styles.meta, COLORS.ink, styles.ink.id);
const queueChip = figma.createFrame();
queueChip.name = "Signal / Queue";
heroChips.appendChild(queueChip);
auto(queueChip, "VERTICAL", 2, 9);
hug(queueChip);
surface(queueChip, COLORS.canvas, 10);
await addText(queueChip, "Signal / Label", "QUEUE", styles.label, COLORS.muted, undefined);
await addText(queueChip, "Signal / Value", "0", styles.meta, COLORS.ink, styles.ink.id);

const overview = figma.createFrame();
overview.name = "03 / Overview";
root.appendChild(overview);
auto(overview, "HORIZONTAL", 0, 20);
fixed(overview, 992, 112);
fillWidth(overview);
overview.counterAxisAlignItems = "CENTER";
surface(overview, COLORS.surface, 16);
const overviewIntro = figma.createFrame();
overviewIntro.name = "Overview / Intro";
overview.appendChild(overviewIntro);
auto(overviewIntro, "VERTICAL", 4, 0);
fixed(overviewIntro, 174, 72);
overviewIntro.layoutSizingHorizontal = "FIXED";
overviewIntro.layoutSizingVertical = "FIXED";
await addText(overviewIntro, "Overview / Eyebrow", "OVERVIEW", styles.label, COLORS.blue, styles.blue.id);
await addText(overviewIntro, "Overview / Title", "Proof signals", styles.section, COLORS.ink, styles.ink.id);
await addText(overviewIntro, "Overview / Copy", "Live artifact", styles.meta, COLORS.muted, undefined);
const overviewMetrics = [
  ["TARGET", "03 - Playground", "pageId bound"],
  ["ACTIVITY", "3 steps", "compose → read back"],
  ["REUSE", "2 consumers", "one status contract"]
];
for (let index = 0; index < overviewMetrics.length; index += 1) {
  const divider = addRule(overview, "Overview / Divider " + index, 1);
  divider.resize(1, 72);
  const metric = figma.createFrame();
  metric.name = "Overview / Metric " + overviewMetrics[index][0];
  overview.appendChild(metric);
  auto(metric, "VERTICAL", 3, 0);
  fixed(metric, 244, 72);
  metric.layoutSizingHorizontal = "FIXED";
  metric.layoutSizingVertical = "FIXED";
  await addText(metric, "Metric / Label", overviewMetrics[index][0], styles.label, COLORS.muted, undefined);
  await addText(metric, "Metric / Value", overviewMetrics[index][1], styles.metric, COLORS.ink, styles.ink.id);
  await addText(metric, "Metric / Note", overviewMetrics[index][2], styles.meta, COLORS.quiet, undefined);
}

const lower = figma.createFrame();
lower.name = "04 / Work Area";
root.appendChild(lower);
auto(lower, "HORIZONTAL", 16, 0);
fixed(lower, 992, 296);
fillWidth(lower);

const activity = makeSurface(lower, "Activity / Latest Operation", 650, 296, 20, 12);
const activityHeader = figma.createFrame();
activityHeader.name = "Activity / Header";
activity.appendChild(activityHeader);
auto(activityHeader, "HORIZONTAL", 8, 0);
fixed(activityHeader, 610, 32);
fillWidth(activityHeader);
activityHeader.primaryAxisAlignItems = "SPACE_BETWEEN";
activityHeader.counterAxisAlignItems = "CENTER";
await addText(activityHeader, "Activity / Title", "Activity", styles.section, COLORS.ink, styles.ink.id);
await addText(activityHeader, "Activity / Count", "3 completed", styles.meta, COLORS.green, undefined);
const activityList = figma.createFrame();
activityList.name = "Activity / List";
activity.appendChild(activityList);
auto(activityList, "VERTICAL", 0, 0);
fillWidth(activityList);
activityList.layoutSizingVertical = "HUG";
const activityRows = [
  ["01", "Target locked", "03 - Playground · exact page selected"],
  ["02", "Proof composed", "Native frame, styles and status component"],
  ["03", "Structure read back", "1 master · 1 linked instance · render exported"]
];
for (let index = 0; index < activityRows.length; index += 1) {
  const row = figma.createFrame();
  row.name = "Activity / Row " + activityRows[index][0];
  activityList.appendChild(row);
  auto(row, "HORIZONTAL", 12, 0);
  fixed(row, 610, 52);
  fillWidth(row);
  row.layoutSizingVertical = "FIXED";
  row.counterAxisAlignItems = "CENTER";
  const marker = addMark(row, "Activity / Marker", COLORS.greenSoft, 24, 12);
  await addText(marker, "Activity / Index", activityRows[index][0], styles.label, COLORS.green, undefined);
  const rowCopy = figma.createFrame();
  rowCopy.name = "Activity / Copy";
  row.appendChild(rowCopy);
  auto(rowCopy, "VERTICAL", 2, 0);
  rowCopy.layoutSizingHorizontal = "FILL";
  rowCopy.layoutSizingVertical = "HUG";
  await addText(rowCopy, "Activity / Title", activityRows[index][1], styles.body, COLORS.ink, styles.ink.id);
  await addText(rowCopy, "Activity / Detail", activityRows[index][2], styles.meta, COLORS.muted, undefined);
  await addText(row, "Activity / Status", "DONE", styles.label, COLORS.green, undefined);
  if (index < activityRows.length - 1) {
    const rule = addRule(activityList, "Activity / Rule " + index, 610);
    rule.layoutSizingHorizontal = "FILL";
  }
}

const guide = makeSurface(lower, "Guide / Next Use", 326, 296, 20, 12);
await addText(guide, "Guide / Eyebrow", "NEXT USE", styles.label, COLORS.blue, styles.blue.id);
await addText(guide, "Guide / Title", "From proof to product", styles.section, COLORS.ink, styles.ink.id);
await addText(guide, "Guide / Body", "The bridge is proven. Now design the operating flow around it.", styles.body, COLORS.muted, undefined, 286);
const guideSteps = [
  ["01", "Inspect", "Read the current file"],
  ["02", "Compose", "Make one bounded change"],
  ["03", "Verify", "Compare structure + render"]
];
for (const step of guideSteps) {
  const row = figma.createFrame();
  row.name = "Guide / Step " + step[0];
  guide.appendChild(row);
  auto(row, "HORIZONTAL", 10, 0);
  fixed(row, 286, 38);
  fillWidth(row);
  row.layoutSizingVertical = "FIXED";
  row.counterAxisAlignItems = "CENTER";
  const num = addMark(row, "Guide / Number", COLORS.blueSoft, 24, 12);
  await addText(num, "Guide / Index", step[0], styles.label, COLORS.blue, undefined);
  const copy = figma.createFrame();
  copy.name = "Guide / Copy";
  row.appendChild(copy);
  auto(copy, "VERTICAL", 1, 0);
  copy.layoutSizingHorizontal = "FILL";
  copy.layoutSizingVertical = "HUG";
  await addText(copy, "Guide / Title", step[1], styles.body, COLORS.ink, styles.ink.id);
  await addText(copy, "Guide / Detail", step[2], styles.meta, COLORS.quiet, undefined);
}

const footer = figma.createFrame();
footer.name = "05 / Evidence Footer";
root.appendChild(footer);
auto(footer, "HORIZONTAL", 8, 0);
fixed(footer, 992, 28);
fillWidth(footer);
footer.counterAxisAlignItems = "CENTER";
await addText(footer, "Footer / Label", "EVIDENCE", styles.label, COLORS.muted, undefined);
await addText(footer, "Footer / Copy", "Live write · readback · PNG render", styles.meta, COLORS.muted, undefined);
const footerTag = figma.createFrame();
footerTag.name = "Footer / Boundary";
footer.appendChild(footerTag);
auto(footerTag, "HORIZONTAL", 0, 7);
hug(footerTag);
surface(footerTag, COLORS.surface, 999);
await addText(footerTag, "Footer / Tag", "PROOF SURFACE", styles.label, COLORS.quiet, undefined);

figma.currentPage.selection = [root];
figma.viewport.scrollAndZoomIntoView([root]);
const instances = root.findAll(function (node) { return node.type === "INSTANCE"; });
const components = root.findAll(function (node) { return node.type === "COMPONENT"; });
const autoLayoutNodes = [root].concat(root.findAll(function (node) {
  return "layoutMode" in node && node.layoutMode !== "NONE";
}));
return {
  rootId: root.id,
  page: { id: page.id, name: page.name, childCount: page.children.length },
  root: { id: root.id, name: root.name, width: root.width, height: root.height, topLevelChildren: root.children.map(function (node) { return node.name; }) },
  component: { masterCount: components.length, instanceCount: instances.length, instanceNames: instances.map(function (node) { return node.name; }) },
  native: { autoLayoutNodes: autoLayoutNodes.length, previousOwnedRootsRemoved: previous.length, previousOrphansRemoved: previousOrphans.length },
  design: { focalPath: ["connection", "activity", "next-use"], surfaceModel: "shared-overview-plus-two-work-surfaces" }
};
`;
  return code.replace("__TARGET_PAGE_ID__", pageId);
}
