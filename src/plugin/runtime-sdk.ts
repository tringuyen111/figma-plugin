/**
 * Opt-in helper expression injected inside the Figma plugin-global realm.
 * Keep this provider-mechanical: it must not make Product or Design decisions.
 */
import { RUNTIME_SDK_VERSIONS, type RuntimeSdkVersion } from "../shared/protocol.js";

export const FIGMA_RUNTIME_SDK_VERSIONS = RUNTIME_SDK_VERSIONS;
export type FigmaRuntimeSdkVersion = RuntimeSdkVersion;
export const FIGMA_RUNTIME_SDK_VERSION = "v2" as const;

const FIGMA_RUNTIME_SDK_V1_EXPRESSION = String.raw`(() => {
  function fail(helper, message) {
    throw new Error("figmaPlugin." + helper + ": " + message);
  }

  function assert(condition, message) {
    if (!condition) fail("assert", message || "assertion failed");
  }

  async function resolveNode(id, expectedType) {
    if (typeof id !== "string" || !id) fail("resolveNode", "id must be a non-empty string");
    const node = await figma.getNodeByIdAsync(id);
    if (!node) fail("resolveNode", "node " + id + " does not exist");
    if (expectedType && node.type !== expectedType) {
      fail("resolveNode", "node " + id + " is " + node.type + ", expected " + expectedType);
    }
    return node;
  }

  async function clearDirectChildren(parent) {
    if (!parent || !Array.isArray(parent.children)) fail("clearDirectChildren", "parent must expose children");
    const snapshot = parent.children.map(function (node) {
      return { id: node.id, name: node.name, type: node.type };
    });
    const removed = [];
    const skipped = [];
    for (const item of snapshot) {
      const node = await figma.getNodeByIdAsync(item.id);
      if (node && node.parent && node.parent.id === parent.id) {
        node.remove();
        removed.push(item);
      } else {
        skipped.push(item);
      }
    }
    return { parentId: parent.id, removed, skipped, remainingCount: parent.children.length };
  }

  function appendAutoLayoutChild(parent, node, sizing) {
    if (!parent || typeof parent.appendChild !== "function") fail("appendAutoLayoutChild", "parent cannot append children");
    if (!node || typeof node !== "object") fail("appendAutoLayoutChild", "node is required");
    parent.appendChild(node);
    const options = sizing || {};
    if ((options.horizontal || options.vertical || options.grow !== undefined) && (!parent.layoutMode || parent.layoutMode === "NONE")) {
      fail("appendAutoLayoutChild", "sizing requires an Auto Layout parent");
    }
    if (options.horizontal !== undefined) node.layoutSizingHorizontal = options.horizontal;
    if (options.vertical !== undefined) node.layoutSizingVertical = options.vertical;
    if (options.grow !== undefined) node.layoutGrow = options.grow;
    return node;
  }

  async function loadTextFonts(node) {
    if (!node || typeof node.characters !== "string") fail("loadTextFonts", "node must expose text characters");
    const fonts = [];
    if (node.fontName === figma.mixed) {
      if (typeof node.getRangeAllFontNames !== "function") fail("loadTextFonts", "mixed-font node cannot enumerate fonts");
      fonts.push.apply(fonts, node.getRangeAllFontNames(0, node.characters.length));
    } else {
      fonts.push(node.fontName);
    }
    const unique = [];
    const seen = new Set();
    for (const font of fonts) {
      if (!font || typeof font.family !== "string" || typeof font.style !== "string") fail("loadTextFonts", "invalid font descriptor");
      const key = font.family + "\u0000" + font.style;
      if (!seen.has(key)) { seen.add(key); unique.push(font); }
    }
    await Promise.all(unique.map(function (font) { return figma.loadFontAsync(font); }));
    return unique;
  }

  async function setText(node, value) {
    await loadTextFonts(node);
    node.characters = String(value);
    return { id: node.id, characters: node.characters };
  }

  async function bindTextStyle(node, styleId) {
    if (!node || typeof node.setTextStyleIdAsync !== "function") fail("bindTextStyle", "node does not support async text-style binding");
    if (typeof styleId !== "string" || !styleId) fail("bindTextStyle", "styleId must be a non-empty string");
    await node.setTextStyleIdAsync(styleId);
    return { id: node.id, textStyleId: styleId };
  }

  async function bindFillStyle(node, styleId) {
    if (!node || typeof node.setFillStyleIdAsync !== "function") fail("bindFillStyle", "node does not support async fill-style binding");
    if (typeof styleId !== "string" || !styleId) fail("bindFillStyle", "styleId must be a non-empty string");
    await node.setFillStyleIdAsync(styleId);
    return { id: node.id, fillStyleId: styleId };
  }

  async function measureStructure(root) {
    if (!root || typeof root.findAll !== "function") fail("measureStructure", "root must support descendant queries");
    const descendants = root.findAll(function () { return true; });
    const instances = descendants.filter(function (node) { return node.type === "INSTANCE"; });
    const links = [];
    for (const instance of instances) {
      let master = null;
      if (typeof instance.getMainComponentAsync === "function") master = await instance.getMainComponentAsync();
      else if (instance.mainComponent) master = instance.mainComponent;
      links.push({
        instanceId: instance.id,
        instanceName: instance.name,
        masterId: master ? master.id : null,
        masterName: master ? master.name : null
      });
    }
    const autoLayoutNodes = [root].concat(descendants).filter(function (node) {
      return "layoutMode" in node && node.layoutMode !== "NONE";
    });
    return {
      rootId: root.id,
      descendantCount: descendants.length,
      componentCount: descendants.filter(function (node) { return node.type === "COMPONENT"; }).length,
      componentSetCount: descendants.filter(function (node) { return node.type === "COMPONENT_SET"; }).length,
      instanceCount: instances.length,
      linkedInstanceCount: links.filter(function (item) { return Boolean(item.masterId); }).length,
      autoLayoutNodeCount: autoLayoutNodes.length,
      links
    };
  }

  function checkpoint(label, evidence) {
    if (typeof label !== "string" || !label.trim()) fail("checkpoint", "label must be a non-empty string");
    return { label: label.trim(), at: Date.now(), evidence: evidence === undefined ? null : evidence };
  }

  return Object.freeze({
    version: "v1",
    assert,
    resolveNode,
    clearDirectChildren,
    appendAutoLayoutChild,
    loadTextFonts,
    setText,
    bindTextStyle,
    bindFillStyle,
    measureStructure,
    checkpoint
  });
})()`;

const FIGMA_RUNTIME_SDK_V2_HELPERS = String.raw`
  async function loadPage(pageOrId) {
    const page = typeof pageOrId === "string" ? await resolveNode(pageOrId, "PAGE") : pageOrId;
    if (!page || page.type !== "PAGE" || typeof page.loadAsync !== "function") fail("loadPage", "target must be a PageNode or page id");
    await page.loadAsync();
    return page;
  }

  async function clearLoadedDirectChildren(parent) {
    if (parent && parent.type === "PAGE") await loadPage(parent);
    return clearDirectChildren(parent);
  }

  async function resolveStyle(id, expectedType) {
    if (typeof id !== "string" || !id) fail("resolveStyle", "id must be a non-empty string");
    if (typeof figma.getStyleByIdAsync !== "function") fail("resolveStyle", "getStyleByIdAsync is unavailable in this editor");
    const style = await figma.getStyleByIdAsync(id);
    if (!style) fail("resolveStyle", "style " + id + " does not exist");
    if (expectedType && style.type !== expectedType) fail("resolveStyle", "style " + id + " is " + style.type + ", expected " + expectedType);
    return style;
  }

  async function bindStyle(node, slot, styleId) {
    if (!node || typeof node !== "object") fail("bindStyle", "node is required");
    if (typeof styleId !== "string" || !styleId) fail("bindStyle", "styleId must be a non-empty string");
    const normalized = String(slot || "").toLowerCase();
    const methods = {
      text: "setTextStyleIdAsync",
      fill: "setFillStyleIdAsync",
      stroke: "setStrokeStyleIdAsync",
      effect: "setEffectStyleIdAsync",
      grid: "setGridStyleIdAsync"
    };
    const method = methods[normalized];
    if (!method) fail("bindStyle", "slot must be text, fill, stroke, effect, or grid");
    if (typeof node[method] !== "function") fail("bindStyle", "node does not support async " + normalized + "-style binding");
    await node[method](styleId);
    return { id: node.id, slot: normalized, styleId: styleId };
  }

  async function resolveVariable(id) {
    if (typeof id !== "string" || !id) fail("resolveVariable", "id must be a non-empty string");
    if (!figma.variables || typeof figma.variables.getVariableByIdAsync !== "function") fail("resolveVariable", "Variables API is unavailable in this editor");
    const variable = await figma.variables.getVariableByIdAsync(id);
    if (!variable) fail("resolveVariable", "variable " + id + " does not exist");
    return variable;
  }

  async function bindVariable(node, field, variableOrId) {
    if (!node || typeof node.setBoundVariable !== "function") fail("bindVariable", "node does not support variable binding");
    if (typeof field !== "string" || !field) fail("bindVariable", "field must be a non-empty string");
    const variable = typeof variableOrId === "string" ? await resolveVariable(variableOrId) : variableOrId;
    if (!variable || typeof variable.id !== "string") fail("bindVariable", "variable must be a Variable or variable id");
    node.setBoundVariable(field, variable);
    return { id: node.id, field: field, variableId: variable.id, variableName: variable.name };
  }

  async function bindPaintVariable(paint, field, variableOrId) {
    if (!figma.variables || typeof figma.variables.setBoundVariableForPaint !== "function") fail("bindPaintVariable", "paint-variable binding is unavailable in this editor");
    if (!paint || typeof paint !== "object") fail("bindPaintVariable", "paint is required");
    if (typeof field !== "string" || !field) fail("bindPaintVariable", "field must be a non-empty string");
    const variable = typeof variableOrId === "string" ? await resolveVariable(variableOrId) : variableOrId;
    if (!variable || typeof variable.id !== "string") fail("bindPaintVariable", "variable must be a Variable or variable id");
    return figma.variables.setBoundVariableForPaint(paint, field, variable);
  }

  async function inspectHandoff(nodeOrId, options) {
    const node = typeof nodeOrId === "string" ? await resolveNode(nodeOrId) : nodeOrId;
    if (!node || typeof node !== "object") fail("inspectHandoff", "node or node id is required");
    const settings = options || {};
    let mainComponent = null;
    if (node.type === "INSTANCE" && typeof node.getMainComponentAsync === "function") mainComponent = await node.getMainComponentAsync();
    const definition = mainComponent || (node.type === "COMPONENT" || node.type === "COMPONENT_SET" ? node : null);
    const css = settings.css === false || typeof node.getCSSAsync !== "function" ? null : await node.getCSSAsync();
    const devResources = settings.devResources === false || typeof node.getDevResourcesAsync !== "function"
      ? []
      : await node.getDevResourcesAsync({ includeChildren: settings.includeChildren === true });
    const publishStatus = settings.publishStatus !== false && definition && typeof definition.getPublishStatusAsync === "function"
      ? await definition.getPublishStatusAsync()
      : null;
    return {
      node: { id: node.id, name: node.name, type: node.type, isAsset: node.isAsset === true },
      topLevelFrameId: typeof node.getTopLevelFrame === "function" && node.getTopLevelFrame() ? node.getTopLevelFrame().id : null,
      css: css,
      devResources: devResources,
      component: definition ? {
        id: definition.id,
        name: definition.name,
        type: definition.type,
        key: typeof definition.key === "string" ? definition.key : null,
        remote: definition.remote === true,
        publishStatus: publishStatus,
        propertyDefinitions: definition.componentPropertyDefinitions || null
      } : null,
      instanceProperties: node.type === "INSTANCE" ? node.componentProperties : null
    };
  }

  function commitUndoCheckpoint(label, evidence) {
    if (typeof figma.commitUndo !== "function") fail("commitUndoCheckpoint", "commitUndo is unavailable in this editor");
    figma.commitUndo();
    return checkpoint(label || "undo-boundary", evidence);
  }
`;

const FIGMA_RUNTIME_SDK_V2_EXPRESSION = FIGMA_RUNTIME_SDK_V1_EXPRESSION
  .replace("  return Object.freeze({", FIGMA_RUNTIME_SDK_V2_HELPERS + "\n  return Object.freeze({")
  .replace('    version: "v1",', '    version: "v2",')
  .replace("    clearDirectChildren,", "    clearDirectChildren: clearLoadedDirectChildren,")
  .replace(
    "    measureStructure,\n    checkpoint",
    "    measureStructure,\n    loadPage,\n    resolveStyle,\n    bindStyle,\n    resolveVariable,\n    bindVariable,\n    bindPaintVariable,\n    inspectHandoff,\n    commitUndoCheckpoint,\n    checkpoint",
  );

export const FIGMA_RUNTIME_SDK_EXPRESSIONS: Record<FigmaRuntimeSdkVersion, string> = {
  v1: FIGMA_RUNTIME_SDK_V1_EXPRESSION,
  v2: FIGMA_RUNTIME_SDK_V2_EXPRESSION,
};

export function isFigmaRuntimeSdkVersion(value: unknown): value is FigmaRuntimeSdkVersion {
  return typeof value === "string" && FIGMA_RUNTIME_SDK_VERSIONS.includes(value as FigmaRuntimeSdkVersion);
}
