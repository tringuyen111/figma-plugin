import { afterEach, describe, expect, it } from "vitest";
import { executeJs } from "../../src/plugin/handlers/execute-js.js";
import { ErrorCode } from "../../src/shared/protocol.js";

afterEach(() => {
  delete (globalThis as Record<string, unknown>).figma;
  delete (globalThis as Record<string, unknown>).sdkFixture;
});

describe("executeJs", () => {
  it("runs native Figma Plugin API JavaScript in the plugin-global realm", async () => {
    (globalThis as Record<string, unknown>).figma = { editorType: "figma", currentPage: { name: "Home" } };
    await expect(executeJs({ code: "return { editorType: figma.editorType, page: figma.currentPage.name }" })).resolves.toEqual({
      editorType: "figma",
      page: "Home",
    });
  });

  it("keeps the runtime SDK opt-in so legacy code has no injected binding", async () => {
    await expect(executeJs({ code: "return typeof figmaPlugin" })).resolves.toBe("undefined");
    await expect(executeJs({ code: "return 1", runtimeSdk: "v3" })).rejects.toMatchObject({
      bridgeError: { code: ErrorCode.INVALID_PARAMS, message: expect.stringContaining("v1, v2") },
    });
  });

  it("provides targeted loading, complete style and variable binding, handoff inspection, and undo checkpoints in SDK v2", async () => {
    let pageLoads = 0;
    let undoCommits = 0;
    let publishStatusReads = 0;
    let devResourceReads = 0;
    const styleBindings: string[] = [];
    const variableBindings: Array<{ field: string; id: string }> = [];
    const page: Record<string, unknown> & { children: Array<Record<string, unknown>> } = {
      id: "page:2",
      name: "Components",
      type: "PAGE",
      children: [],
      loadAsync: async () => { pageLoads += 1; },
    };
    const child: Record<string, unknown> = {
      id: "child:2",
      name: "Temporary",
      type: "FRAME",
      parent: page,
      remove() { page.children.splice(page.children.indexOf(child), 1); },
    };
    page.children.push(child);
    const variable = { id: "VariableID:1", name: "space/4" };
    const style = { id: "style:stroke", name: "Border", type: "PAINT" };
    const topLevel = { id: "frame:top" };
    const component = {
      id: "component:2",
      name: "Button",
      type: "COMPONENT",
      key: "component-key",
      remote: false,
      isAsset: true,
      componentPropertyDefinitions: { Size: { type: "VARIANT", defaultValue: "M", variantOptions: ["S", "M"] } },
      getPublishStatusAsync: async () => { publishStatusReads += 1; return "CURRENT"; },
      getCSSAsync: async () => ({ display: "flex" }),
      getDevResourcesAsync: async () => { devResourceReads += 1; return [{ name: "Source", url: "https://example.test/button", nodeId: "component:2" }]; },
      getTopLevelFrame: () => topLevel,
    };
    const bindableNode = {
      id: "frame:bindable",
      setStrokeStyleIdAsync: async (id: string) => { styleBindings.push(`stroke:${id}`); },
      setBoundVariable: (field: string, value: { id: string }) => { variableBindings.push({ field, id: value.id }); },
    };
    (globalThis as Record<string, unknown>).figma = {
      getNodeByIdAsync: async (id: string) => ({ "page:2": page, "child:2": child, "component:2": component } as Record<string, unknown>)[id] ?? null,
      getStyleByIdAsync: async (id: string) => id === style.id ? style : null,
      variables: {
        getVariableByIdAsync: async (id: string) => id === variable.id ? variable : null,
        setBoundVariableForPaint: (paint: Record<string, unknown>, field: string, value: { id: string }) => ({ ...paint, bound: { field, variableId: value.id } }),
      },
      commitUndo: () => { undoCommits += 1; },
    };
    (globalThis as Record<string, unknown>).sdkFixture = { page, bindableNode, component };

    const result = await executeJs({
      runtimeSdk: "v2",
      code: `
        const loaded = await figmaPlugin.loadPage("page:2");
        const cleared = await figmaPlugin.clearDirectChildren(loaded);
        const resolvedStyle = await figmaPlugin.resolveStyle("style:stroke", "PAINT");
        await figmaPlugin.bindStyle(sdkFixture.bindableNode, "stroke", resolvedStyle.id);
        const resolvedVariable = await figmaPlugin.resolveVariable("VariableID:1");
        await figmaPlugin.bindVariable(sdkFixture.bindableNode, "width", resolvedVariable);
        const paint = await figmaPlugin.bindPaintVariable({ type: "SOLID" }, "color", resolvedVariable);
        const handoff = await figmaPlugin.inspectHandoff(sdkFixture.component, { includeChildren: true });
        const undo = figmaPlugin.commitUndoCheckpoint("sdk-v2", { cleared: cleared.removed.length });
        return { version: figmaPlugin.version, pageId: loaded.id, cleared, paint, handoff, undo };
      `,
    });

    expect(result).toMatchObject({
      version: "v2",
      pageId: "page:2",
      cleared: { remainingCount: 0, removed: [{ id: "child:2" }] },
      paint: { bound: { field: "color", variableId: "VariableID:1" } },
      handoff: {
        node: { id: "component:2", isAsset: true },
        topLevelFrameId: "frame:top",
        css: { display: "flex" },
        component: { key: "component-key", publishStatus: "CURRENT" },
      },
      undo: { label: "sdk-v2", evidence: { cleared: 1 } },
    });
    expect(pageLoads).toBe(2);
    expect(styleBindings).toEqual(["stroke:style:stroke"]);
    expect(variableBindings).toEqual([{ field: "width", id: "VariableID:1" }]);
    expect(undoCommits).toBe(1);
    expect(publishStatusReads).toBe(1);
    expect(devResourceReads).toBe(1);

    const localOnly = await executeJs({
      runtimeSdk: "v2",
      code: `return figmaPlugin.inspectHandoff(sdkFixture.component, { devResources: false, publishStatus: false });`,
    });
    expect(localOnly).toMatchObject({ devResources: [], component: { publishStatus: null } });
    expect(publishStatusReads).toBe(1);
    expect(devResourceReads).toBe(1);
  });

  it("provides dynamic-page-safe, ordering-safe, and evidence-bounded SDK helpers", async () => {
    const font = { family: "Inter", style: "Regular" };
    const loadedFonts: unknown[] = [];
    const styleBindings: string[] = [];
    const page = {
      id: "page:1",
      name: "Page",
      type: "PAGE",
      layoutMode: "VERTICAL",
      children: [] as Array<Record<string, unknown>>,
      appendChild(node: Record<string, unknown>) {
        node.parent = page;
        page.children.push(node);
      },
    };
    const oldChild: Record<string, unknown> = {
      id: "old:1",
      name: "Old child",
      type: "FRAME",
      parent: page,
      remove() { page.children.splice(page.children.indexOf(oldChild), 1); },
    };
    page.children.push(oldChild);
    const master = { id: "component:1", name: "Metric", type: "COMPONENT" };
    const instance = { id: "instance:1", name: "Metric instance", type: "INSTANCE", layoutMode: "NONE", getMainComponentAsync: async () => master };
    const autoFrame = { id: "frame:1", name: "Auto", type: "FRAME", layoutMode: "HORIZONTAL" };
    const root = { id: "root:1", type: "FRAME", layoutMode: "VERTICAL", findAll: () => [instance, autoFrame] };
    (globalThis as Record<string, unknown>).figma = {
      mixed: Symbol("mixed"),
      currentPage: page,
      loadFontAsync: async (value: unknown) => { loadedFonts.push(value); },
      getNodeByIdAsync: async (id: string) => id === oldChild.id ? oldChild : null,
    };
    const textNode = {
      id: "text:1",
      type: "TEXT",
      characters: "Before",
      fontName: font,
      setTextStyleIdAsync: async (id: string) => { styleBindings.push(`text:${id}`); },
      setFillStyleIdAsync: async (id: string) => { styleBindings.push(`fill:${id}`); },
    };
    const newChild: Record<string, unknown> = { id: "new:1", name: "New child", type: "FRAME" };
    (globalThis as Record<string, unknown>).sdkFixture = { page, root, textNode, newChild };

    const result = await executeJs({
      runtimeSdk: "v1",
      code: `
        const cleared = await figmaPlugin.clearDirectChildren(sdkFixture.page);
        figmaPlugin.appendAutoLayoutChild(sdkFixture.page, sdkFixture.newChild, { horizontal: "FILL", vertical: "HUG", grow: 1 });
        await figmaPlugin.setText(sdkFixture.textNode, 66);
        await figmaPlugin.bindTextStyle(sdkFixture.textNode, "style:text");
        await figmaPlugin.bindFillStyle(sdkFixture.textNode, "style:fill");
        const structure = await figmaPlugin.measureStructure(sdkFixture.root);
        return { version: figmaPlugin.version, cleared, child: sdkFixture.newChild, text: sdkFixture.textNode.characters, structure };
      `,
    });

    expect(result).toMatchObject({
      version: "v1",
      cleared: { removed: [{ id: "old:1" }], skipped: [], remainingCount: 0 },
      child: { id: "new:1", layoutSizingHorizontal: "FILL", layoutSizingVertical: "HUG", layoutGrow: 1 },
      text: "66",
      structure: { instanceCount: 1, linkedInstanceCount: 1, autoLayoutNodeCount: 2 },
    });
    expect(loadedFonts).toEqual([font]);
    expect(styleBindings).toEqual(["text:style:text", "fill:style:fill"]);
    delete (globalThis as Record<string, unknown>).sdkFixture;
  });

  it("returns root raster bytes without base64 expansion", async () => {
    const result = await executeJs({ code: "return { format: 'PNG', nodeId: '1:2', bytes: new Uint8Array(4096) }" });
    expect(result).toMatchObject({ kind: "binary", format: "PNG", metadata: { nodeId: "1:2" } });
    expect((result as { bytes: Uint8Array }).bytes).toBeInstanceOf(Uint8Array);
    expect((result as { bytes: Uint8Array }).bytes.byteLength).toBe(4096);
  });

  it("enforces the compact JSON response budget", async () => {
    await expect(executeJs({ code: "return { text: 'x'.repeat(13000) }" })).rejects.toMatchObject({
      bridgeError: { code: ErrorCode.OUTPUT_TOO_LARGE, message: expect.any(String) },
    });
  });

  it("rejects empty code", async () => {
    await expect(executeJs({ code: "" })).rejects.toMatchObject({ bridgeError: { code: ErrorCode.INVALID_PARAMS } });
  });
});
