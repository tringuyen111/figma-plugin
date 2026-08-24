import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { RuntimeClient, assert, textPayload } from "../../scripts/lib/runtime-client.mjs";

const runtime = new RuntimeClient({ name: "responsive-design-probe" });
const traceRoot = `responsive-design-probe:${Date.now()}`;
const planId = "responsive-design-probe";
const probeId = `codex-responsive-probe-${Date.now()}`;
const marker = "Codex Responsive Probe / Component Library";
const recoveryNodeIds = ["91:23", "91:95", "91:138", "91:139"];
const evidenceDir = resolve("output/figma-evidence");
const evidenceImagePath = resolve(evidenceDir, "responsive-design-probe-2026-08-24.png");
const evidenceJsonPath = resolve(evidenceDir, "responsive-design-probe-2026-08-24.json");

let instance;

try {
  await runtime.connect();
  const status = await waitForConnected(runtime, 90_000);
  instance = runtime.resolveSingleInstance(status);
  assert(instance.bundleRevision === status.bundleRevision, `Companion bundle ${instance.bundleRevision} does not match server ${status.bundleRevision}.`);
  assert(instance.runtimeSdks?.includes("v2"), "Connected companion does not expose Runtime SDK v2.");

  const target = `${instance.fileName} / ${instance.pageName}`;
  const inventory = await runtime.call("figma_query", {
    kind: "file_inventory",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:inventory`,
    operation: operation({
      label: "Inventory components, styles, variables, and page content before design probe",
      kind: "read",
      phase: "inspect",
      stepId: "inventory-before",
      target,
      representation: "table",
      postconditions: ["Typed inventory returns all pages and file-owned reusable asset counts"],
    }),
  });

  const clearDryRun = await runtime.call("figma_apply", {
    action: "clear_file_owned_assets",
    dryRun: true,
    removeLocalAssets: true,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:clear-dry-run`,
    operation: operation({
      label: "Plan full file-owned component/library cleanup without mutation",
      kind: "write",
      phase: "plan",
      stepId: "clear-file-owned-assets-dry-run",
      target: `${instance.fileName} / all pages`,
      representation: "table",
      postconditions: ["Dry-run reports removable page nodes, local styles, and variables without changing Figma"],
    }),
  });
  assert(clearDryRun.dryRun === true, "The cleanup probe did not remain a dry-run.");

  const build = await runtime.call("figma_exec", {
    code: buildCode(instance.pageId),
    runtimeSdk: "v2",
    maxOutputChars: 30_000,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-design-authoring",
    traceId: `${traceRoot}:compose`,
    attempt: 1,
    operation: operation({
      label: "Compose an exploratory responsive mobile and desktop specimen",
      kind: "write",
      phase: "execute",
      stepId: "compose-responsive-specimen",
      target,
      representation: "rendered-composition",
      postconditions: [
        "One uniquely owned probe root contains mobile and desktop compositions",
        "Semantic identity, primary action, status, and navigation survive recomposition",
        "No pre-existing node, component, style, or variable is removed",
      ],
    }),
  });
  assert(build.rootId, "Responsive probe did not return a root id.");

  const structure = await runtime.call("figma_query", {
    kind: "structure",
    nodeId: build.rootId,
    includeChildren: true,
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:structure`,
    attempt: 1,
    operation: operation({
      label: "Read back responsive specimen structure",
      kind: "read",
      phase: "verify",
      stepId: "readback-responsive-specimen",
      target: marker,
      representation: "tree",
      postconditions: ["Typed structure returns the owned root and both viewport compositions"],
    }),
  });
  assert(structure.rootId === build.rootId, "Typed structure query returned another root.");

  const exported = await runtime.callRaw("figma_export", {
    nodeId: build.rootId,
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
    contentsOnly: true,
    colorProfile: "SRGB",
    maxBytes: 32 * 1024 * 1024,
    filename: "responsive-design-probe-2026-08-24",
    instanceId: instance.instanceId,
    pageId: instance.pageId,
    capability: "figma-verification",
    traceId: `${traceRoot}:export`,
    attempt: 1,
    operation: operation({
      label: "Export responsive mobile and desktop specimen",
      kind: "export",
      phase: "verify",
      stepId: "export-responsive-specimen",
      target: marker,
      representation: "artifact",
      postconditions: ["PNG is exported from the exact typed-readback root"],
    }),
  }, 330_000);
  assert(exported.isError !== true, `figma_export failed: ${JSON.stringify(textPayload(exported))}`);
  const exportPayload = textPayload(exported);
  const artifact = exported.structuredContent?.artifact || exportPayload.artifact || {};
  assert(typeof artifact.path === "string" && artifact.path.length > 0, "Responsive export returned no persisted artifact path.");
  await mkdir(evidenceDir, { recursive: true });
  await copyFile(artifact.path, evidenceImagePath);

  const finalStatus = await runtime.status(true);
  const finalInstance = finalStatus.instances?.find((candidate) => candidate.instanceId === instance.instanceId);
  assert(finalStatus.pluginConnected === true, "Companion disconnected before final status readback.");
  assert(finalStatus.queueLength === 0 && finalStatus.pendingCount === 0 && finalInstance?.inFlight === 0, "Responsive probe did not return to idle.");
  const imageBytes = await readFile(evidenceImagePath);
  const imageSha256 = createHash("sha256").update(imageBytes).digest("hex");
  const evidence = {
    schemaVersion: 1,
    kind: "responsive-design-probe",
    observedAt: new Date().toISOString(),
    candidate: { packageVersion: finalStatus.serverVersion, bundleRevision: finalStatus.bundleRevision, protocolVersion: finalStatus.protocolVersion },
    target: { instanceId: instance.instanceId, fileName: instance.fileName, pageId: instance.pageId, pageName: instance.pageName, editorType: instance.editorType },
    traceRoot,
    probe: { probeId, marker, recoveryNodeIds, inventory, clearDryRun, build, structure },
    export: { ...artifact, evidenceImagePath, imageSha256, byteLength: imageBytes.byteLength },
    finalRuntime: { pluginConnected: finalStatus.pluginConnected, queueLength: finalStatus.queueLength, pendingCount: finalStatus.pendingCount, instanceInFlight: finalInstance?.inFlight ?? null },
    scope: {
      libraryInventory: "PASS",
      fullCleanup: "DRY_RUN_ONLY",
      responsiveComposition: "PASS_EXPLORATORY",
      visualInspection: "PENDING",
      preExistingNodesRemoved: false,
    },
  };
  await writeFile(evidenceJsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ evidenceJsonPath, evidenceImagePath, imageSha256, target: evidence.target, build, clearDryRun, finalRuntime: evidence.finalRuntime, scope: evidence.scope })}\n`);
} finally {
  await runtime.close();
}

async function waitForConnected(client, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let status;
  do {
    status = await client.status(true);
    if (status.pluginConnected) return status;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  } while (Date.now() < deadline);
  throw new Error(`No Figma companion connected within ${timeoutMs}ms.`);
}

function operation({ label, kind, phase, stepId, target, representation, postconditions }) {
  return { label, kind, phase, planId, stepId, target, representation, postconditions };
}

function buildCode(pageId) {
  return String.raw`
const TARGET_PAGE_ID = ${JSON.stringify(pageId)};
const PROBE_ID = ${JSON.stringify(probeId)};
const MARKER = ${JSON.stringify(marker)};
const COLORS = {
  canvas: { r: 0.95, g: 0.96, b: 0.98 },
  surface: { r: 1, g: 1, b: 1 },
  ink: { r: 0.08, g: 0.10, b: 0.15 },
  muted: { r: 0.37, g: 0.42, b: 0.50 },
  quiet: { r: 0.62, g: 0.66, b: 0.72 },
  line: { r: 0.88, g: 0.90, b: 0.94 },
  blue: { r: 0.19, g: 0.32, b: 0.78 },
  blueDark: { r: 0.08, g: 0.13, b: 0.28 },
  blueSoft: { r: 0.91, g: 0.94, b: 1.00 },
  green: { r: 0.10, g: 0.50, b: 0.27 },
  greenSoft: { r: 0.88, g: 0.97, b: 0.90 },
  amber: { r: 0.72, g: 0.43, b: 0.08 },
  amberSoft: { r: 1.00, g: 0.95, b: 0.84 },
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
const existing = page.findAll(function (node) {
  return node.type === "FRAME" && node.name === MARKER && node.getPluginData("controlmuxResponsiveProbe").indexOf("codex-responsive-probe-") === 0;
})[0];
const recovered = [];
if (existing) {
  recovered.push({ id: existing.id, name: existing.name, reason: "owned-probe-replacement" });
  existing.remove();
}
for (const nodeId of ${JSON.stringify(recoveryNodeIds)}) {
  const node = await figma.getNodeByIdAsync(nodeId);
  const expectedName = nodeId === "91:23" || nodeId === "91:139"
    ? MARKER
    : nodeId === "91:95" ? "Mobile / 360 x 820" : "Mobile bottom nav";
  if (node && node.parent && node.parent.id === page.id && node.name === expectedName) {
    recovered.push({ id: node.id, name: node.name, reason: "failed-probe-recovery" });
    node.remove();
  }
}

const rightEdge = page.children.reduce(function (max, node) { return Math.max(max, node.x + node.width); }, 0);
const root = figma.createFrame();
root.name = MARKER;
root.resize(1900, 980);
root.x = rightEdge + 120;
root.y = 0;
root.layoutMode = "VERTICAL";
root.primaryAxisSizingMode = "FIXED";
root.counterAxisSizingMode = "FIXED";
root.paddingTop = 24;
root.paddingRight = 24;
root.paddingBottom = 24;
root.paddingLeft = 24;
root.itemSpacing = 18;
root.cornerRadius = 24;
root.clipsContent = true;
root.fills = [paint(COLORS.canvas)];
root.setPluginData("controlmuxResponsiveProbe", PROBE_ID);

const rootHeader = frame("Probe title", 1852, 58, COLORS.canvas, 0, 0);
rootHeader.layoutMode = "HORIZONTAL";
rootHeader.primaryAxisAlignItems = "SPACE_BETWEEN";
rootHeader.counterAxisAlignItems = "CENTER";
root.appendChild(rootHeader);
const title = text("Responsive design exploration", "Component Library / mobile + desktop", 22, COLORS.ink, "semibold", 520, 32);
rootHeader.appendChild(title);
const note = text("Exploratory specimen • no existing nodes removed", "INVARIANTS: identity · primary action · status · navigation", 12, COLORS.muted, "medium", 520, 24);
rootHeader.appendChild(note);

const row = frame("Viewport comparison", 1852, 856, COLORS.canvas, 0, 0);
row.layoutMode = "HORIZONTAL";
row.primaryAxisSizingMode = "FIXED";
row.counterAxisSizingMode = "FIXED";
row.itemSpacing = 24;
row.fills = [];
root.appendChild(row);
row.appendChild(buildDesktop());
row.appendChild(buildMobile());

figmaPlugin.commitUndoCheckpoint("responsive-design-probe-create", { probeId: PROBE_ID, marker: MARKER, recovered });
return { rootId: root.id, created: true, marker: root.name, childCount: root.children.length, probeId: PROBE_ID, pageId: page.id, recovered };

function buildDesktop() {
  const shell = frame("Desktop / 1440 x 820", 1440, 856, COLORS.surface, 18, 0);
  shell.layoutMode = "HORIZONTAL";
  shell.primaryAxisSizingMode = "FIXED";
  shell.counterAxisSizingMode = "FIXED";
  const sidebar = frame("Navigation rail", 226, 856, COLORS.blueDark, 0, 24);
  sidebar.layoutMode = "VERTICAL";
  sidebar.primaryAxisSizingMode = "FIXED";
  sidebar.counterAxisSizingMode = "FIXED";
  sidebar.paddingTop = 24; sidebar.paddingRight = 20; sidebar.paddingBottom = 24; sidebar.paddingLeft = 20; sidebar.itemSpacing = 18;
  sidebar.appendChild(text("Brand", "CONTROLMUX", 14, COLORS.white, "semibold", 180, 22));
  sidebar.appendChild(text("Workspace", "Design system workspace", 12, { r: 0.72, g: 0.77, b: 0.90 }, "regular", 180, 20));
  sidebar.appendChild(navItem("Overview", true));
  sidebar.appendChild(navItem("Components", false));
  sidebar.appendChild(navItem("Tokens", false));
  sidebar.appendChild(navItem("Settings", false));
  const sidebarFoot = frame("Sidebar footer", 180, 56, { r: 0.12, g: 0.18, b: 0.36 }, 12, 12);
  sidebarFoot.layoutMode = "VERTICAL"; sidebarFoot.itemSpacing = 4;
  sidebarFoot.appendChild(text("Library sync", "Ready", 12, COLORS.white, "medium", 150, 18));
  sidebarFoot.appendChild(text("Last checked just now", "No drift detected", 10, { r: 0.72, g: 0.77, b: 0.90 }, "regular", 150, 16));
  sidebar.appendChild(sidebarFoot);
  shell.appendChild(sidebar);

  const main = frame("Desktop main", 1214, 856, COLORS.surface, 0, 32);
  main.layoutMode = "VERTICAL";
  main.primaryAxisSizingMode = "FIXED"; main.counterAxisSizingMode = "FIXED";
  main.paddingTop = 28; main.paddingRight = 32; main.paddingBottom = 28; main.paddingLeft = 32; main.itemSpacing = 18;
  const top = frame("Desktop top bar", 1150, 52, COLORS.surface, 0, 0); top.layoutMode = "HORIZONTAL"; top.primaryAxisAlignItems = "SPACE_BETWEEN"; top.counterAxisAlignItems = "CENTER";
  const topTitle = frame("Top title", 460, 52, COLORS.surface, 0, 0); topTitle.layoutMode = "VERTICAL"; topTitle.itemSpacing = 2;
  topTitle.appendChild(text("Library overview", "Component Library", 22, COLORS.ink, "semibold", 460, 28));
  topTitle.appendChild(text("Build once, recompose by constraint", "Responsive specimen", 11, COLORS.muted, "regular", 460, 18));
  top.appendChild(topTitle); top.appendChild(statusChip("● Connected", COLORS.greenSoft, COLORS.green)); main.appendChild(top);
  main.appendChild(searchField(1150));
  const hero = frame("Desktop hero", 1150, 142, COLORS.blue, 18, 24); hero.layoutMode = "HORIZONTAL"; hero.counterAxisAlignItems = "CENTER"; hero.itemSpacing = 18;
  const heroMark = frame("Hero mark", 64, 64, COLORS.blueSoft, 16, 0); heroMark.layoutMode = "VERTICAL"; heroMark.primaryAxisAlignItems = "CENTER"; heroMark.counterAxisAlignItems = "CENTER"; heroMark.appendChild(text("16", "16", 24, COLORS.blue, "semibold", 64, 34)); hero.appendChild(heroMark);
  const heroCopy = frame("Hero copy", 720, 92, COLORS.blue, 0, 0); heroCopy.layoutMode = "VERTICAL"; heroCopy.itemSpacing = 6; heroCopy.appendChild(text("A system that adapts", "Keep the semantic job stable while the composition changes.", 20, COLORS.white, "semibold", 720, 28)); heroCopy.appendChild(text("Desktop keeps comparison and context visible; mobile preserves the same action path with disclosure.", "Constraint-led responsive behavior", 12, { r: 0.85, g: 0.89, b: 1 }, "regular", 720, 40)); hero.appendChild(heroCopy); hero.appendChild(statusChip("Probe draft", COLORS.blueSoft, COLORS.blue)); main.appendChild(hero);
  const stats = frame("Desktop stats", 1150, 84, COLORS.surface, 0, 0); stats.layoutMode = "HORIZONTAL"; stats.itemSpacing = 14; stats.appendChild(statCard("16", "Skills", "capability boundaries", COLORS.blueSoft, 374)); stats.appendChild(statCard("5", "MCP tools", "typed local surface", COLORS.greenSoft, 374)); stats.appendChild(statCard("0", "Drift", "open evidence gaps", COLORS.amberSoft, 374)); main.appendChild(stats);
  main.appendChild(sectionHeading("Recent components", "Reusable jobs, not repeated shapes", 1150));
  const list = frame("Recent components list", 1150, 214, COLORS.surface, 14, 14); list.layoutMode = "VERTICAL"; list.itemSpacing = 8; list.strokes = [paint(COLORS.line)]; list.strokeWeight = 1;
  list.appendChild(listRow("Status Badge", "Connected / pending / error", "COMPONENT", COLORS.green, 1118));
  list.appendChild(listRow("Operation Card", "IN → PROCESS → OUT", "PATTERN", COLORS.blue, 1118));
  list.appendChild(listRow("Search Field", "Input + results disclosure", "CONTROL", COLORS.amber, 1118));
  main.appendChild(list); shell.appendChild(main); return shell;
}

function buildMobile() {
  const shell = frame("Mobile / 360 x 820", 360, 856, COLORS.surface, 18, 20);
  shell.layoutMode = "VERTICAL"; shell.primaryAxisSizingMode = "FIXED"; shell.counterAxisSizingMode = "FIXED";
  shell.paddingTop = 20; shell.paddingRight = 20; shell.paddingBottom = 20; shell.paddingLeft = 20; shell.itemSpacing = 14;
  const top = frame("Mobile top bar", 320, 42, COLORS.surface, 0, 0); top.layoutMode = "HORIZONTAL"; top.primaryAxisAlignItems = "SPACE_BETWEEN"; top.counterAxisAlignItems = "CENTER";
  top.appendChild(text("Mobile title", "Library", 21, COLORS.ink, "semibold", 150, 30)); top.appendChild(statusChip("●", COLORS.greenSoft, COLORS.green)); shell.appendChild(top);
  shell.appendChild(searchField(320));
  const hero = frame("Mobile hero", 320, 136, COLORS.blue, 18, 18); hero.layoutMode = "VERTICAL"; hero.itemSpacing = 6; hero.appendChild(text("Mobile hero title", "Build with confidence", 20, COLORS.white, "semibold", 280, 30)); hero.appendChild(text("Same semantic job, less chrome.", "Responsive recomposition", 12, { r: 0.86, g: 0.90, b: 1 }, "regular", 280, 20)); hero.appendChild(statusChip("Connected", COLORS.blueSoft, COLORS.blue)); shell.appendChild(hero);
  const stats = frame("Mobile stats", 320, 172, COLORS.surface, 0, 0); stats.layoutMode = "VERTICAL"; stats.itemSpacing = 8; const statsRow = frame("Mobile stat row", 320, 82, COLORS.surface, 0, 0); statsRow.layoutMode = "HORIZONTAL"; statsRow.itemSpacing = 8; statsRow.appendChild(statCard("16", "Skills", "", COLORS.blueSoft, 156)); statsRow.appendChild(statCard("5", "Tools", "", COLORS.greenSoft, 156)); stats.appendChild(statsRow); const statsRow2 = frame("Mobile stat row two", 320, 82, COLORS.surface, 0, 0); statsRow2.layoutMode = "HORIZONTAL"; statsRow2.itemSpacing = 8; statsRow2.appendChild(statCard("0", "Drift", "", COLORS.amberSoft, 156)); statsRow2.appendChild(statCard("✓", "Ready", "", COLORS.greenSoft, 156)); stats.appendChild(statsRow2); shell.appendChild(stats);
  shell.appendChild(sectionHeading("Recent components", "3 reusable jobs", 320));
  const list = frame("Mobile recent list", 320, 188, COLORS.surface, 14, 12); list.layoutMode = "VERTICAL"; list.itemSpacing = 6; list.strokes = [paint(COLORS.line)]; list.strokeWeight = 1; list.appendChild(listRow("Status Badge", "Connected", "", COLORS.green, 296)); list.appendChild(listRow("Operation Card", "IN → OUT", "", COLORS.blue, 296)); list.appendChild(listRow("Search Field", "Find a role", "", COLORS.amber, 296)); shell.appendChild(list);
  const nav = frame("Mobile bottom nav", 320, 52, COLORS.blueDark, 14, 8); nav.layoutMode = "HORIZONTAL"; nav.primaryAxisAlignItems = "SPACE_BETWEEN"; nav.counterAxisAlignItems = "CENTER"; nav.appendChild(text("Nav overview", "Overview", 11, COLORS.white, "medium", 80, 20)); nav.appendChild(text("Nav components", "Components", 11, { r: 0.72, g: 0.77, b: 0.90 }, "medium", 90, 20)); nav.appendChild(text("Nav settings", "Settings", 11, { r: 0.72, g: 0.77, b: 0.90 }, "medium", 70, 20)); shell.appendChild(nav); return shell;
}

function frame(name, width, height, color, radius, padding) { const node = figma.createFrame(); node.name = name; node.resize(width, height); node.fills = color ? [paint(color)] : []; if (radius) node.cornerRadius = radius; if (padding) { node.paddingTop = padding; node.paddingRight = padding; node.paddingBottom = padding; node.paddingLeft = padding; } return node; }
function text(name, value, size, color, style, width, height) { const node = figma.createText(); node.name = name; node.fontName = FONTS[style]; node.fontSize = size; node.characters = value; node.fills = [paint(color)]; node.textAutoResize = "HEIGHT"; node.resize(width, height); return node; }
function paint(color) { return { type: "SOLID", color }; }
function statusChip(value, background, color) { const chip = frame("Status chip", 112, 32, background, 16, 8); chip.layoutMode = "HORIZONTAL"; chip.counterAxisAlignItems = "CENTER"; chip.appendChild(text("Status label", value, 11, color, "medium", 96, 18)); return chip; }
function searchField(width) { const field = frame("Search field", width, 44, { r: 0.97, g: 0.98, b: 1 }, 12, 12); field.layoutMode = "HORIZONTAL"; field.counterAxisAlignItems = "CENTER"; field.strokes = [paint(COLORS.line)]; field.strokeWeight = 1; field.appendChild(text("Search placeholder", "⌕  Search components, tokens, or roles", 12, COLORS.muted, "regular", width - 24, 20)); return field; }
function statCard(value, label, detail, background, width) { const card = frame("Metric card / " + label, width, 84, background, 14, 14); card.layoutMode = "VERTICAL"; card.itemSpacing = 2; card.appendChild(text("Metric value", value, 24, COLORS.ink, "semibold", width - 28, 30)); card.appendChild(text("Metric label", label, 12, COLORS.ink, "medium", width - 28, 18)); if (detail) card.appendChild(text("Metric detail", detail, 10, COLORS.muted, "regular", width - 28, 16)); return card; }
function sectionHeading(titleValue, detail, width) { const head = frame("Section heading", width, 42, COLORS.surface, 0, 0); head.layoutMode = "VERTICAL"; head.itemSpacing = 2; head.appendChild(text("Section title", titleValue, 16, COLORS.ink, "semibold", width - 10, 22)); head.appendChild(text("Section detail", detail, 10, COLORS.muted, "regular", width - 10, 16)); return head; }
function listRow(titleValue, detail, role, accent, width) { const row = frame("List row / " + titleValue, width, 58, COLORS.surface, 8, 10); row.layoutMode = "HORIZONTAL"; row.counterAxisAlignItems = "CENTER"; row.primaryAxisAlignItems = "SPACE_BETWEEN"; const copyWidth = Math.max(150, width - 20 - (role ? 120 : 0)); const copy = frame("Row copy", copyWidth, 38, COLORS.surface, 0, 0); copy.layoutMode = "VERTICAL"; copy.itemSpacing = 2; copy.appendChild(text("Row title", titleValue, 12, COLORS.ink, "medium", copyWidth - 10, 18)); copy.appendChild(text("Row detail", detail, 10, COLORS.muted, "regular", copyWidth - 10, 16)); row.appendChild(copy); if (role) row.appendChild(statusChip(role, { r: Math.min(1, accent.r + 0.76), g: Math.min(1, accent.g + 0.76), b: Math.min(1, accent.b + 0.76) }, accent)); return row; }
function navItem(label, active) { const item = frame("Nav item / " + label, 180, 38, active ? COLORS.blue : COLORS.blueDark, 10, 10); item.layoutMode = "HORIZONTAL"; item.counterAxisAlignItems = "CENTER"; item.appendChild(text("Nav label", label, 12, active ? COLORS.white : { r: 0.72, g: 0.77, b: 0.90 }, "medium", 160, 18)); return item; }
`;
}
