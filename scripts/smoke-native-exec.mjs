/**
 * Post-bundle smoke for the shipped ControlMux Figma plugin bundle.
 * This proves the consumed bundle installs the native execution handler,
 * keeps raster bytes binary across the Figma-main -> UI seam, enforces the
 * compact JSON budget, and can switch a requested page before execution.
 */
import fs from "node:fs";
import vm from "node:vm";

const bundle = fs.readFileSync(new URL("../plugin/code.js", import.meta.url), "utf8");
const posted = [];
const pages = [
  { id: "0:1", type: "PAGE", name: "Page 1" },
  { id: "0:2", type: "PAGE", name: "Page 2" },
];
const exportNode = {
  id: "1:2", type: "FRAME", name: "Export Frame",
  async exportAsync(settings) {
    if (settings?.format === "JSON_REST_V1") return { id: this.id, name: this.name, type: this.type };
    return new Uint8Array([9, 8, 7]);
  },
};
const events = new Map();
const figma = {
  fileKey: "mock-file",
  editorType: "figma",
  root: { name: "Mock File", children: pages },
  currentPage: pages[0],
  showUI() {},
  on(name, fn) { events.set(name, fn); },
  async getNodeByIdAsync(id) { return pages.find((page) => page.id === id) ?? (id === exportNode.id ? exportNode : null); },
  async setCurrentPageAsync(page) { this.currentPage = page; events.get("currentpagechange")?.(); },
  clientStorage: {
    async getAsync() { return null; },
    async setAsync() {},
  },
  ui: {
    onmessage: null,
    postMessage(message) { posted.push(message); },
  },
};

const context = vm.createContext({
  figma,
  __html__: "",
  console,
  Uint8Array,
  ArrayBuffer,
  WeakSet,
  TextEncoder,
  TextDecoder,
  Promise,
  setTimeout,
  clearTimeout,
  Date,
  Math,
});
vm.runInContext(bundle, context, { filename: "plugin/code.js" });
if (typeof figma.ui.onmessage !== "function") throw new Error("plugin bundle did not install figma.ui.onmessage");

async function exec(id, code, targetPageId, extra = {}) {
  posted.length = 0;
  await figma.ui.onmessage({ kind: "request", payload: { id, op: "execute_js", params: { code, ...extra }, ...(targetPageId ? { targetPageId } : {}) } });
  return posted.find((message) =>
    (message.kind === "response" && message.payload?.id === id) ||
    (message.kind === "binary-response" && message.id === id),
  );
}


async function exportArtifact(id, format, extra = {}) {
  posted.length = 0;
  await figma.ui.onmessage({ kind: "request", payload: { id, op: "export_node", params: { nodeId: "1:2", format, ...extra } } });
  return posted.find((message) =>
    (message.kind === "response" && message.payload?.id === id) ||
    (message.kind === "binary-response" && message.id === id),
  );
}

const json = await exec("json", "return {editorType: figma.editorType, value: 1 + 2}");
if (json?.kind !== "response" || !json.payload?.ok || json.payload.result?.value !== 3) {
  throw new Error(`native JSON execution failed: ${JSON.stringify(json)}`);
}

const switched = await exec("page", "return {page: figma.currentPage.name}", "0:2");
if (switched?.kind !== "response" || switched.payload?.result?.page !== "Page 2") {
  throw new Error(`page targeting failed: ${JSON.stringify(switched)}`);
}

const sdk = await exec("sdk", "return figmaPlugin.checkpoint('bundle-sdk', {version: figmaPlugin.version})", undefined, { runtimeSdk: "v2" });
if (sdk?.kind !== "response" || !sdk.payload?.ok || sdk.payload.result?.label !== "bundle-sdk" || sdk.payload.result?.evidence?.version !== "v2") {
  throw new Error(`runtime SDK bundle execution failed: ${JSON.stringify(sdk)}`);
}

const image = await exec("image", "return {format:'PNG', nodeId:'1:2', bytes:new Uint8Array(20000)}");
if (image?.kind !== "binary-response" || !(image.bytes instanceof Uint8Array) || image.bytes.byteLength !== 20000 || image.metadata?.nodeId !== "1:2") {
  throw new Error(`binary response failed: ${JSON.stringify(image)?.slice(0, 500)}`);
}

const exported = await exportArtifact("export-png", "PNG", { constraint: { type: "SCALE", value: 1 } });
if (exported?.kind !== "binary-response" || exported.format !== "PNG" || exported.bytes?.byteLength !== 3 || exported.metadata?.nodeId !== "1:2") {
  throw new Error(`typed PNG export failed: ${JSON.stringify(exported)?.slice(0, 500)}`);
}

const exportedJson = await exportArtifact("export-json", "JSON");
if (exportedJson?.kind !== "binary-response" || exportedJson.format !== "JSON") {
  throw new Error(`typed JSON export failed: ${JSON.stringify(exportedJson)?.slice(0, 500)}`);
}
const decodedExport = JSON.parse(Buffer.from(exportedJson.bytes).toString("utf8"));
if (decodedExport.id !== "1:2") throw new Error(`JSON export payload failed: ${JSON.stringify(decodedExport)}`);

const tooLarge = await exec("large", "return {text:'x'.repeat(13000)}");
if (tooLarge?.kind !== "response" || tooLarge.payload?.ok || tooLarge.payload?.error?.code !== "OUTPUT_TOO_LARGE") {
  throw new Error(`JSON output budget was not enforced: ${JSON.stringify(tooLarge)?.slice(0, 500)}`);
}

console.log(JSON.stringify({
  nativeExec: "PASS",
  pageTargeting: "PASS",
  binaryBridge: "PASS",
  outputBudget: "PASS",
  typedExport: "PASS",
  runtimeSdk: "PASS",
}));
