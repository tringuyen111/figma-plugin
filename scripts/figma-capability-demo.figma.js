const COLORS = {
  canvas: "F2F0EB",
  paper: "FCFBF8",
  white: "FFFFFF",
  ink: "17191D",
  inkSoft: "252932",
  muted: "696C75",
  line: "DEDBD3",
  blue: "4B66E8",
  blueSoft: "E8ECFF",
  lime: "D8FF72",
  limeInk: "24300A",
  green: "2D8F67",
  greenSoft: "E3F4EC",
  amber: "B66A22",
  amberSoft: "FAEBD9",
  red: "C55050"
};

const FONT = {
  regular: { family: "Inter", style: "Regular" },
  medium: { family: "Inter", style: "Medium" },
  semibold: { family: "Inter", style: "Semi Bold" },
  bold: { family: "Inter", style: "Bold" }
};

await Promise.all(Object.values(FONT).map(function (font) { return figma.loadFontAsync(font); }));
const existingPaintStyles = await figma.getLocalPaintStylesAsync();
const existingTextStyles = await figma.getLocalTextStylesAsync();
const styleBindings = [];

function rgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255
  };
}

function paint(hex, opacity) {
  return { type: "SOLID", color: rgb(hex), opacity: opacity === undefined ? 1 : opacity };
}

function setFill(node, hex, opacity) {
  node.fills = [paint(hex, opacity)];
}

function setStroke(node, hex, opacity) {
  node.strokes = [paint(hex, opacity)];
  node.strokeWeight = 1;
  node.strokeAlign = "INSIDE";
}

function auto(node, mode, gap, padding) {
  node.layoutMode = mode;
  node.itemSpacing = gap || 0;
  const p = padding || 0;
  node.paddingTop = p;
  node.paddingRight = p;
  node.paddingBottom = p;
  node.paddingLeft = p;
  node.primaryAxisSizingMode = "AUTO";
  node.counterAxisSizingMode = "AUTO";
}

function fixed(node, width, height) {
  node.resize(width, height);
  if (node.layoutMode && node.layoutMode !== "NONE") {
    node.primaryAxisSizingMode = "FIXED";
    node.counterAxisSizingMode = "FIXED";
  }
}

function frame(parent, name, mode, gap, padding) {
  const node = figma.createFrame();
  node.name = name;
  node.clipsContent = false;
  node.fills = [];
  if (mode) auto(node, mode, gap, padding);
  if (parent) parent.appendChild(node);
  return node;
}

function roundedSurface(node, color, radius, stroke) {
  setFill(node, color);
  node.cornerRadius = radius;
  if (stroke) setStroke(node, stroke);
}

function createPaintStyle(name, hex) {
  const fullName = "Capability Demo / " + name;
  const existing = existingPaintStyles.find(function (style) { return style.name === fullName; });
  if (existing) return existing;
  const style = figma.createPaintStyle();
  style.name = fullName;
  style.paints = [paint(hex)];
  return style;
}

function createTextStyle(name, font, size, lineHeight, letterSpacing) {
  const fullName = "Capability Demo / " + name;
  const existing = existingTextStyles.find(function (style) { return style.name === fullName; });
  if (existing) return existing;
  const style = figma.createTextStyle();
  style.name = fullName;
  style.fontName = font;
  style.fontSize = size;
  style.lineHeight = { unit: "PIXELS", value: lineHeight };
  style.letterSpacing = { unit: "PIXELS", value: letterSpacing || 0 };
  return style;
}

const paintStyles = {
  ink: createPaintStyle("Color / Ink", COLORS.ink),
  muted: createPaintStyle("Color / Muted", COLORS.muted),
  blue: createPaintStyle("Color / Action", COLORS.blue),
  paper: createPaintStyle("Color / Paper", COLORS.paper),
  line: createPaintStyle("Color / Line", COLORS.line)
};

const textStyles = {
  display: createTextStyle("Type / Display", FONT.bold, 44, 50, -1.4),
  title: createTextStyle("Type / Title", FONT.semibold, 24, 30, -0.5),
  heading: createTextStyle("Type / Heading", FONT.semibold, 18, 24, -0.25),
  body: createTextStyle("Type / Body", FONT.regular, 14, 21, -0.05),
  bodyMedium: createTextStyle("Type / Body Medium", FONT.medium, 14, 20, -0.05),
  label: createTextStyle("Type / Label", FONT.semibold, 11, 15, 0.7),
  metric: createTextStyle("Type / Metric", FONT.semibold, 30, 36, -0.8),
  caption: createTextStyle("Type / Caption", FONT.regular, 11, 16, 0)
};

function text(parent, name, characters, style, color, width) {
  const node = figma.createText();
  node.name = name;
  node.fontName = style.fontName;
  node.fontSize = style.fontSize;
  node.lineHeight = style.lineHeight;
  node.letterSpacing = style.letterSpacing;
  node.characters = characters;
  node.fills = (color || paintStyles.ink).paints;
  if (width) {
    node.textAutoResize = "HEIGHT";
    node.resize(width, Math.max(node.height, 1));
  } else {
    node.textAutoResize = "WIDTH_AND_HEIGHT";
  }
  parent.appendChild(node);
  styleBindings.push(node.setTextStyleIdAsync(style.id));
  styleBindings.push(node.setFillStyleIdAsync((color || paintStyles.ink).id));
  return node;
}

function dot(parent, color, size) {
  const node = figma.createEllipse();
  node.name = "Indicator";
  node.resize(size, size);
  setFill(node, color);
  parent.appendChild(node);
  return node;
}

function divider(parent) {
  const node = figma.createRectangle();
  node.name = "Divider";
  node.resize(1, 1);
  parent.appendChild(node);
  node.layoutSizingHorizontal = "FILL";
  setFill(node, COLORS.line);
  return node;
}

function overrideText(instance, layerName, value) {
  const node = instance.findOne(function (candidate) { return candidate.type === "TEXT" && candidate.name === layerName; });
  if (node && node.type === "TEXT") node.characters = String(value);
}

function makeButtonComponent(parent) {
  const component = figma.createComponent();
  component.name = "Capability / Button / Primary";
  component.description = "Primary foreground action with one label and directional affordance.";
  auto(component, "HORIZONTAL", 12, 0);
  component.paddingTop = 13;
  component.paddingBottom = 13;
  component.paddingLeft = 18;
  component.paddingRight = 14;
  component.primaryAxisAlignItems = "CENTER";
  component.counterAxisAlignItems = "CENTER";
  roundedSurface(component, COLORS.blue, 14);
  const label = text(component, "Button/Label", "Export proof", textStyles.bodyMedium, paintStyles.paper);
  const affordance = frame(component, "Button/Affordance", "HORIZONTAL", 0, 0);
  fixed(affordance, 24, 24);
  affordance.primaryAxisAlignItems = "CENTER";
  affordance.counterAxisAlignItems = "CENTER";
  roundedSurface(affordance, COLORS.white, 12);
  setFill(affordance, COLORS.white, 0.18);
  const arrow = text(affordance, "Button/Arrow", "→", textStyles.bodyMedium, paintStyles.paper);
  arrow.opacity = 1;
  component.setPluginData("semanticJob", "primary-foreground-action");
  parent.appendChild(component);
  return component;
}

function makeStatusComponent(parent) {
  const component = figma.createComponent();
  component.name = "Capability / Status Chip / Positive";
  component.description = "Compact positive runtime state with dot and label.";
  auto(component, "HORIZONTAL", 8, 0);
  component.paddingTop = 7;
  component.paddingBottom = 7;
  component.paddingLeft = 11;
  component.paddingRight = 12;
  component.primaryAxisAlignItems = "CENTER";
  component.counterAxisAlignItems = "CENTER";
  roundedSurface(component, COLORS.greenSoft, 999);
  dot(component, COLORS.green, 7);
  const label = text(component, "Status/Label", "Runtime online", textStyles.caption, paintStyles.ink);
  label.fontName = FONT.medium;
  component.setPluginData("semanticJob", "positive-system-state");
  parent.appendChild(component);
  return component;
}

function makeMetricComponent(parent) {
  const component = figma.createComponent();
  component.name = "Capability / Evidence Metric";
  component.description = "Evidence metric with stable label, value and comparison note anatomy.";
  auto(component, "VERTICAL", 7, 0);
  component.paddingTop = 18;
  component.paddingRight = 18;
  component.paddingBottom = 17;
  component.paddingLeft = 18;
  fixed(component, 220, 132);
  roundedSurface(component, COLORS.paper, 18, COLORS.line);
  text(component, "Metric/Label", "COMPONENT LINKS", textStyles.label, paintStyles.muted);
  text(component, "Metric/Value", "12", textStyles.metric, paintStyles.ink);
  text(component, "Metric/Note", "+4 verified this run", textStyles.caption, paintStyles.muted);
  component.setPluginData("semanticJob", "evidence-metric");
  parent.appendChild(component);
  return component;
}

function makeNavComponent(parent, selected) {
  const component = figma.createComponent();
  component.name = selected ? "State=Selected" : "State=Default";
  auto(component, "HORIZONTAL", 12, 0);
  component.paddingTop = 11;
  component.paddingBottom = 11;
  component.paddingLeft = 12;
  component.paddingRight = 12;
  fixed(component, 196, 44);
  component.primaryAxisAlignItems = "MIN";
  component.counterAxisAlignItems = "CENTER";
  if (selected) roundedSurface(component, COLORS.white, 12, null), component.opacity = 1;
  else component.fills = [];
  dot(component, selected ? COLORS.lime : COLORS.muted, 8);
  const label = text(component, "Nav/Label", selected ? "Operations" : "Components", textStyles.bodyMedium, selected ? paintStyles.ink : paintStyles.paper);
  if (!selected) label.opacity = 0.62;
  parent.appendChild(component);
  return component;
}

const library = frame(figma.currentPage, "Capability Demo / Component Library", "VERTICAL", 18, 24);
library.x = 1512;
library.y = 0;
library.resize(480, 100);
library.counterAxisSizingMode = "FIXED";
library.primaryAxisSizingMode = "AUTO";
roundedSurface(library, COLORS.paper, 24, COLORS.line);
text(library, "Library/Label", "SYSTEM SPECIMEN", textStyles.label, paintStyles.muted);
text(library, "Library/Title", "Reusable component contracts", textStyles.title, paintStyles.ink);
text(library, "Library/Note", "Masters live outside the product frame. Every repeated consumer below is a real Figma instance.", textStyles.body, paintStyles.muted, 420);
const buttonComponent = makeButtonComponent(library);
const statusComponent = makeStatusComponent(library);
const metricComponent = makeMetricComponent(library);
const navDefault = makeNavComponent(library, false);
const navSelected = makeNavComponent(library, true);
const navSet = figma.combineAsVariants([navDefault, navSelected], library);
navSet.name = "Capability / Nav Item";
navSet.description = "Navigation item with controlled selected/default state.";
navSet.setPluginData("semanticJob", "primary-navigation-item");

const root = frame(figma.currentPage, "Capability Demo / Operations Dashboard", "HORIZONTAL", 0, 0);
root.x = 0;
root.y = 0;
fixed(root, 1440, 1024);
root.clipsContent = true;
root.primaryAxisSizingMode = "FIXED";
root.counterAxisSizingMode = "FIXED";
setFill(root, COLORS.canvas);
root.setPluginData("designPacket", JSON.stringify({
  version: 1,
  surface: "desktop-operations-dashboard",
  viewport: { width: 1440, height: 1024 },
  grid: { sidebar: 248, mainPadding: 32, gap: 24 },
  componentContracts: ["Button / Primary", "Status Chip / Positive", "Evidence Metric", "Nav Item"],
  proofBoundary: "structural-and-rendered-demo-not-production-approval"
}));

const sidebar = frame(root, "Shell / Sidebar", "VERTICAL", 0, 0);
fixed(sidebar, 248, 1024);
sidebar.layoutSizingVertical = "FILL";
setFill(sidebar, COLORS.ink);
sidebar.paddingTop = 30;
sidebar.paddingRight = 26;
sidebar.paddingBottom = 26;
sidebar.paddingLeft = 26;

const brand = frame(sidebar, "Brand", "HORIZONTAL", 12, 0);
brand.layoutSizingHorizontal = "FILL";
brand.counterAxisAlignItems = "CENTER";
const mark = frame(brand, "Brand/Mark", "HORIZONTAL", 0, 0);
fixed(mark, 34, 34);
mark.primaryAxisAlignItems = "CENTER";
mark.counterAxisAlignItems = "CENTER";
roundedSurface(mark, COLORS.lime, 10);
text(mark, "Brand/Glyph", "A", textStyles.bodyMedium, paintStyles.ink);
const brandCopy = frame(brand, "Brand/Copy", "VERTICAL", 1, 0);
text(brandCopy, "Brand/Name", "ARC OPERATIONS", textStyles.bodyMedium, paintStyles.paper);
const brandMeta = text(brandCopy, "Brand/Meta", "Design evidence studio", textStyles.caption, paintStyles.paper);
brandMeta.opacity = 0.55;

const workspace = frame(sidebar, "Workspace", "VERTICAL", 5, 14);
workspace.layoutSizingHorizontal = "FILL";
workspace.cornerRadius = 14;
setFill(workspace, COLORS.white, 0.07);
workspace.strokes = [paint(COLORS.white, 0.1)];
workspace.strokeWeight = 1;
workspace.strokeAlign = "INSIDE";
workspace.layoutPositioning = "AUTO";
workspace.y = 0;
const wsLabel = text(workspace, "Workspace/Label", "WORKSPACE", textStyles.label, paintStyles.paper);
wsLabel.opacity = 0.45;
text(workspace, "Workspace/Name", "Figma capability lab", textStyles.bodyMedium, paintStyles.paper);
workspace.layoutSizingHorizontal = "FILL";
workspace.layoutAlign = "STRETCH";
workspace.layoutSizingVertical = "HUG";
workspace.layoutPositioning = "AUTO";
workspace.layoutGrow = 0;
workspace.minHeight = 66;
workspace.maxHeight = 66;
workspace.resize(workspace.width, 66);
workspace.primaryAxisSizingMode = "FIXED";

const nav = frame(sidebar, "Primary Navigation", "VERTICAL", 8, 0);
nav.layoutSizingHorizontal = "FILL";
nav.paddingTop = 28;
const navItems = [
  { component: navSelected, label: "Operations" },
  { component: navDefault, label: "Components" },
  { component: navDefault, label: "Proof runs" },
  { component: navDefault, label: "Exports" }
];
navItems.forEach(function (entry) {
  const instance = entry.component.createInstance();
  instance.name = "Nav Item / " + entry.label;
  overrideText(instance, "Nav/Label", entry.label);
  nav.appendChild(instance);
  instance.layoutSizingHorizontal = "FILL";
});

const sidebarSpacer = frame(sidebar, "Sidebar Spacer", null, 0, 0);
sidebarSpacer.resize(1, 1);
sidebarSpacer.layoutGrow = 1;
sidebarSpacer.layoutSizingHorizontal = "FILL";

const sideCard = frame(sidebar, "System Note", "VERTICAL", 10, 16);
sideCard.layoutSizingHorizontal = "FILL";
roundedSurface(sideCard, COLORS.inkSoft, 16);
const noteTop = frame(sideCard, "System Note / Header", "HORIZONTAL", 8, 0);
noteTop.layoutSizingHorizontal = "FILL";
noteTop.counterAxisAlignItems = "CENTER";
dot(noteTop, COLORS.lime, 8);
text(noteTop, "System Note / State", "Awaiting verification", textStyles.caption, paintStyles.paper);
const note = text(sideCard, "System Note / Copy", "Structure, rendering and handoff evidence stay separated.", textStyles.caption, paintStyles.paper, 164);
note.opacity = 0.58;

const main = frame(root, "Shell / Main", "VERTICAL", 22, 32);
main.layoutSizingHorizontal = "FILL";
main.layoutSizingVertical = "FILL";
main.clipsContent = true;

const header = frame(main, "Header", "HORIZONTAL", 18, 0);
header.layoutSizingHorizontal = "FILL";
fixed(header, 100, 54);
header.layoutSizingHorizontal = "FILL";
header.primaryAxisAlignItems = "SPACE_BETWEEN";
header.counterAxisAlignItems = "CENTER";
const headerCopy = frame(header, "Header / Orientation", "VERTICAL", 2, 0);
text(headerCopy, "Header/Eyebrow", "DESIGN OPERATIONS", textStyles.label, paintStyles.muted);
text(headerCopy, "Header/Title", "Evidence command center", textStyles.title, paintStyles.ink);
const headerActions = frame(header, "Header / Actions", "HORIZONTAL", 12, 0);
headerActions.counterAxisAlignItems = "CENTER";
const headerStatus = statusComponent.createInstance();
headerStatus.name = "Status / Runtime";
headerActions.appendChild(headerStatus);
const headerButton = buttonComponent.createInstance();
headerButton.name = "Button / Export Proof";
overrideText(headerButton, "Button/Label", "Export proof");
headerActions.appendChild(headerButton);

const hero = frame(main, "Hero", "HORIZONTAL", 18, 0);
hero.layoutSizingHorizontal = "FILL";
fixed(hero, 100, 224);
hero.layoutSizingHorizontal = "FILL";

const heroStory = frame(hero, "Hero / Story", "VERTICAL", 16, 28);
heroStory.layoutGrow = 1;
heroStory.layoutSizingVertical = "FILL";
heroStory.clipsContent = true;
roundedSurface(heroStory, COLORS.inkSoft, 24);
const heroTag = frame(heroStory, "Hero / Tag", "HORIZONTAL", 8, 0);
heroTag.counterAxisAlignItems = "CENTER";
dot(heroTag, COLORS.lime, 8);
const tagText = text(heroTag, "Hero/Tag", "LIVE CAPABILITY RUN", textStyles.label, paintStyles.paper);
tagText.opacity = 0.72;
const heroTitle = text(heroStory, "Hero/Title", "From intent to evidence.", textStyles.display, paintStyles.paper);
const heroBody = text(heroStory, "Hero/Body", "One accountable operation connects reusable structure, visible craft and an explicit handoff packet.", textStyles.body, paintStyles.paper, 600);
heroBody.opacity = 0.62;
const heroMeta = frame(heroStory, "Hero / Meta", "HORIZONTAL", 22, 0);
heroMeta.layoutSizingHorizontal = "FILL";
["— component contracts", "— linked instances", "0 hidden PASS claims"].forEach(function (value, index) {
  const item = frame(heroMeta, "Hero / Meta Item", "HORIZONTAL", 7, 0);
  item.counterAxisAlignItems = "CENTER";
  dot(item, COLORS.lime, 5);
  const metaText = text(item, "Hero/Meta Text / " + index, value, textStyles.caption, paintStyles.paper);
  metaText.opacity = 0.68;
});

const confidence = frame(hero, "Hero / Confidence", "VERTICAL", 14, 24);
fixed(confidence, 318, 224);
confidence.layoutSizingVertical = "FILL";
roundedSurface(confidence, COLORS.lime, 24);
text(confidence, "Confidence/Label", "EVIDENCE COVERAGE", textStyles.label, paintStyles.ink);
const confidenceValue = frame(confidence, "Confidence / Value", "HORIZONTAL", 8, 0);
confidenceValue.counterAxisAlignItems = "MAX";
text(confidenceValue, "Confidence/Number", "—", textStyles.display, paintStyles.ink);
const pct = text(confidenceValue, "Confidence/Percent", "/ 4", textStyles.heading, paintStyles.ink);
text(confidence, "Confidence/Note", "Measured evidence will be bound after graph verification.", textStyles.body, paintStyles.ink, 260);
const bar = frame(confidence, "Confidence / Bar", "HORIZONTAL", 0, 0);
fixed(bar, 270, 9);
bar.cornerRadius = 999;
setFill(bar, COLORS.ink, 0.14);
const barValue = figma.createRectangle();
barValue.name = "Confidence / Value Bar";
barValue.resize(1, 9);
barValue.cornerRadius = 999;
setFill(barValue, COLORS.ink);
bar.appendChild(barValue);

const metrics = frame(main, "Evidence Metrics", "HORIZONTAL", 14, 0);
metrics.layoutSizingHorizontal = "FILL";
fixed(metrics, 100, 132);
metrics.layoutSizingHorizontal = "FILL";
const metricData = [
  ["COMPONENT LINKS", "—", "Measured after graph verification"],
  ["AUTO LAYOUT", "—", "Measured relation owners"],
  ["TEXT ROLES", "—", "Bound semantic hierarchy styles"],
  ["PROOF LANES", "—", "Evidence-ready claim dimensions"]
];
const metricInstances = [];
metricData.forEach(function (data) {
  const instance = metricComponent.createInstance();
  instance.name = "Evidence Metric / " + data[0];
  overrideText(instance, "Metric/Label", data[0]);
  overrideText(instance, "Metric/Value", data[1]);
  overrideText(instance, "Metric/Note", data[2]);
  metrics.appendChild(instance);
  instance.layoutGrow = 1;
  instance.layoutSizingVertical = "FILL";
  metricInstances.push(instance);
});

const content = frame(main, "Operation Detail", "HORIZONTAL", 18, 0);
content.layoutSizingHorizontal = "FILL";
content.layoutGrow = 1;

const operationCard = frame(content, "Current Operation", "VERTICAL", 15, 24);
operationCard.layoutGrow = 1;
operationCard.layoutSizingVertical = "FILL";
roundedSurface(operationCard, COLORS.paper, 22, COLORS.line);
const operationHeader = frame(operationCard, "Current Operation / Header", "HORIZONTAL", 12, 0);
operationHeader.layoutSizingHorizontal = "FILL";
operationHeader.primaryAxisAlignItems = "SPACE_BETWEEN";
operationHeader.counterAxisAlignItems = "CENTER";
const opCopy = frame(operationHeader, "Current Operation / Copy", "VERTICAL", 3, 0);
text(opCopy, "Current Operation/Label", "CURRENT OPERATION", textStyles.label, paintStyles.muted);
text(opCopy, "Current Operation/Title", "Capability system build", textStyles.heading, paintStyles.ink);
const opStatus = statusComponent.createInstance();
opStatus.name = "Status / Verification";
overrideText(opStatus, "Status/Label", "Verifying");
operationHeader.appendChild(opStatus);
divider(operationCard);

const steps = [
  ["01", "Inspect source graph", "Target page and evidence boundary mapped", "Done", COLORS.greenSoft, COLORS.green],
  ["02", "Create shared contracts", "Button, Status, Metric and Nav masters", "Done", COLORS.greenSoft, COLORS.green],
  ["03", "Compose target", "Instances, Auto Layout and real content applied", "Active", COLORS.blueSoft, COLORS.blue],
  ["04", "Verify and export", "Structure, render and packet evidence", "Next", COLORS.canvas, COLORS.muted]
];
steps.forEach(function (data) {
  const row = frame(operationCard, "Operation Step / " + data[0], "HORIZONTAL", 14, 0);
  row.layoutSizingHorizontal = "FILL";
  row.counterAxisAlignItems = "CENTER";
  const index = frame(row, "Step / Index", "HORIZONTAL", 0, 0);
  fixed(index, 34, 34);
  index.primaryAxisAlignItems = "CENTER";
  index.counterAxisAlignItems = "CENTER";
  roundedSurface(index, data[4], 11);
  text(index, "Step/Number", data[0], textStyles.caption, paintStyles.ink);
  const rowCopy = frame(row, "Step / Copy", "VERTICAL", 2, 0);
  rowCopy.layoutGrow = 1;
  text(rowCopy, "Step/Title", data[1], textStyles.bodyMedium, paintStyles.ink);
  text(rowCopy, "Step/Description", data[2], textStyles.caption, paintStyles.muted);
  const state = frame(row, "Step / State", "HORIZONTAL", 7, 0);
  state.counterAxisAlignItems = "CENTER";
  dot(state, data[5], 7);
  text(state, "Step/State Label", data[3], textStyles.caption, paintStyles.muted);
});

const proofCard = frame(content, "Proof Matrix", "VERTICAL", 16, 24);
fixed(proofCard, 340, 100);
proofCard.layoutSizingVertical = "FILL";
roundedSurface(proofCard, COLORS.inkSoft, 22);
text(proofCard, "Proof/Label", "PROOF MATRIX", textStyles.label, paintStyles.paper).opacity = 0.52;
text(proofCard, "Proof/Title", "No PASS without its evidence.", textStyles.heading, paintStyles.paper);
const proofIntro = text(proofCard, "Proof/Intro", "Each claim is bound to the source that can actually prove it.", textStyles.body, paintStyles.paper, 284);
proofIntro.opacity = 0.62;
const proofItems = [
  ["Structural", "Awaiting graph verification", COLORS.lime],
  ["Visual", "Native Figma export will follow", COLORS.blue],
  ["Code handoff", "Packet only · implementation not run", COLORS.amber],
  ["Behavioral", "NOT RUN · representative interaction required", COLORS.muted]
];
proofItems.forEach(function (data) {
  const row = frame(proofCard, "Proof Lane / " + data[0], "HORIZONTAL", 10, 0);
  row.layoutSizingHorizontal = "FILL";
  row.counterAxisAlignItems = "CENTER";
  dot(row, data[2], 8);
  const copy = frame(row, "Proof Lane / Copy", "VERTICAL", 2, 0);
  copy.layoutGrow = 1;
  text(copy, "Proof Lane/Title", data[0], textStyles.bodyMedium, paintStyles.paper);
  const detail = text(copy, "Proof Lane/Detail", data[1], textStyles.caption, paintStyles.paper);
  detail.opacity = 0.48;
});
const packet = frame(proofCard, "Handoff Packet", "VERTICAL", 6, 12);
packet.layoutSizingHorizontal = "FILL";
roundedSurface(packet, COLORS.white, 13);
setFill(packet, COLORS.white, 0.08);
const packetTitle = text(packet, "Handoff/Title", "DESIGN TRANSLATION PACKET", textStyles.label, paintStyles.paper);
packetTitle.opacity = 1;
const packetBody = text(packet, "Handoff/Body", "Awaiting measured structure", textStyles.caption, paintStyles.paper);
packetBody.opacity = 1;

root.setPluginData("componentMasterIds", JSON.stringify({
  button: buttonComponent.id,
  status: statusComponent.id,
  metric: metricComponent.id,
  navSet: navSet.id
}));
root.setPluginData("styleIds", JSON.stringify({
  paint: Object.fromEntries(Object.entries(paintStyles).map(function (entry) { return [entry[0], entry[1].id]; })),
  text: Object.fromEntries(Object.entries(textStyles).map(function (entry) { return [entry[0], entry[1].id]; }))
}));

const evidenceInstances = root.findAll(function (node) { return node.type === "INSTANCE"; });
const evidenceLinks = await Promise.all(evidenceInstances.map(async function (instance) {
  return Boolean(await instance.getMainComponentAsync());
}));
const evidence = {
  componentContracts: 4,
  linkedInstances: evidenceLinks.filter(Boolean).length,
  totalInstances: evidenceInstances.length,
  autoLayoutNodes: 1 + root.findAll(function (node) { return "layoutMode" in node && node.layoutMode !== "NONE"; }).length,
  textRoles: Object.keys(textStyles).length,
  proofLanes: 4,
  evidencedLanes: 3
};

function setTextSync(scope, name, value) {
  const node = scope.findOne(function (candidate) { return candidate.type === "TEXT" && candidate.name === name; });
  if (!node || node.type !== "TEXT") throw new Error("Missing evidence text node: " + name);
  node.characters = String(value);
}

setTextSync(root, "Hero/Meta Text / 0", evidence.componentContracts + " component contracts");
setTextSync(root, "Hero/Meta Text / 1", evidence.linkedInstances + " linked instances");
setTextSync(root, "Hero/Meta Text / 2", "0 hidden PASS claims");
setTextSync(root, "Confidence/Number", evidence.evidencedLanes);
setTextSync(root, "Confidence/Percent", "/ " + evidence.proofLanes);
setTextSync(root, "Confidence/Note", "Structure, native render and handoff packet are evidenced. Behavioral run remains open.");
setTextSync(root, "System Note / State", "Demo structure verified");
setTextSync(root, "Handoff/Body", "1440 × 1024 · 24px region gap · " + evidence.componentContracts + " shared contracts");
const metricEvidence = [
  [evidence.linkedInstances + "/" + evidence.totalInstances, "Every discovered instance resolves to a master"],
  [evidence.autoLayoutNodes, "Measured relation owners in the root frame"],
  [evidence.textRoles, "Bound semantic hierarchy styles"],
  [evidence.proofLanes, evidence.evidencedLanes + " evidenced · 1 explicitly NOT RUN"]
];
metricInstances.forEach(function (instance, index) {
  overrideText(instance, "Metric/Value", metricEvidence[index][0]);
  overrideText(instance, "Metric/Note", metricEvidence[index][1]);
});
const proofEvidence = {
  "Proof Lane / Structural": evidence.linkedInstances + "/" + evidence.totalInstances + " instance links + " + evidence.autoLayoutNodes + " Auto Layout owners",
  "Proof Lane / Visual": "Native Figma export · exact verified root",
  "Proof Lane / Code handoff": "Packet only · implementation not run",
  "Proof Lane / Behavioral": "NOT RUN · representative interaction required"
};
root.findAll(function (node) { return node.type === "FRAME" && Boolean(proofEvidence[node.name]); }).forEach(function (row) {
  setTextSync(row, "Proof Lane/Detail", proofEvidence[row.name]);
});
barValue.resize(270 * evidence.evidencedLanes / evidence.proofLanes, 9);

await Promise.all(styleBindings);
figma.currentPage.selection = [root];
figma.viewport.scrollAndZoomIntoView([root]);

return {
  pageId: figma.currentPage.id,
  pageName: figma.currentPage.name,
  rootId: root.id,
  rootName: root.name,
  libraryId: library.id,
  componentIds: {
    button: buttonComponent.id,
    status: statusComponent.id,
    metric: metricComponent.id,
    navSet: navSet.id
  },
  styleCounts: { paint: Object.keys(paintStyles).length, text: Object.keys(textStyles).length },
  evidence,
  displayedEvidence: {
    componentLinks: metricEvidence[0][0],
    autoLayout: metricEvidence[1][0],
    textRoles: metricEvidence[2][0],
    proofLanes: metricEvidence[3][0]
  },
  viewport: { width: root.width, height: root.height }
};
