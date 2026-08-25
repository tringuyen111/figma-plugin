import { afterEach, describe, expect, it, vi } from "vitest";
import { applyDocument, queryDocument } from "../../src/plugin/handlers/document-operations.js";
import { ErrorCode } from "../../src/shared/protocol.js";

afterEach(() => {
  delete (globalThis as Record<string, unknown>).figma;
});

describe("typed document operations", () => {
  it("returns a file inventory without agent-authored Figma JavaScript", async () => {
    const page = makePage("page:1", "Home");
    (globalThis as Record<string, unknown>).figma = makeFigma(page);

    await expect(queryDocument({ kind: "file_inventory" })).resolves.toMatchObject({
      fileName: "Typed Test File",
      pages: [{ id: "page:1", name: "Home", childCount: 0 }],
      components: { total: 0 },
      localStyles: { paint: 0, text: 0, effect: 0, grid: 0 },
      variables: { collections: 0, variables: 0 },
    });
  });

  it("plans clear as dry-run and requires explicit confirmation for mutation", async () => {
    const page = makePage("page:1", "Home");
    const child = makeChild(page, "node:1");
    page.children.push(child);
    const commitUndo = vi.fn();
    (globalThis as Record<string, unknown>).figma = makeFigma(page, commitUndo);

    await expect(applyDocument({ action: "clear_file_owned_assets" })).resolves.toMatchObject({
      dryRun: true,
      plan: { pages: [{ childCount: 1 }] },
    });
    await expect(applyDocument({ action: "clear_file_owned_assets", dryRun: false })).rejects.toMatchObject({
      bridgeError: { code: ErrorCode.INVALID_PARAMS },
    });
    expect(page.children).toHaveLength(1);
    expect(commitUndo).not.toHaveBeenCalled();
  });

  it("applies a confirmed clear, removes local assets, and commits one undo boundary", async () => {
    const page = makePage("page:1", "Home");
    const child = makeChild(page, "node:1");
    page.children.push(child);
    const paint = { id: "paint:1", name: "Paint", remove: vi.fn() };
    const collection = { id: "collection:1", name: "Tokens", variableIds: ["variable:1"], remove: vi.fn() };
    const commitUndo = vi.fn();
    (globalThis as Record<string, unknown>).figma = makeFigma(page, commitUndo, [paint], collection);

    await expect(applyDocument({ action: "clear_file_owned_assets", dryRun: false, confirm: true, removeLocalAssets: true })).resolves.toMatchObject({
      dryRun: false,
      clearedPages: [{ remainingCount: 0, removedCount: 1 }],
      removedStyles: { paint: 1 },
      removedVariableCollections: [{ name: "Tokens", variableCount: 1 }],
      undoCommitted: true,
      after: { components: { total: 0 }, localStyles: { paint: 0 }, variables: { collections: 0 } },
    });
    expect(paint.remove).toHaveBeenCalledOnce();
    expect(collection.remove).toHaveBeenCalledOnce();
    expect(commitUndo).toHaveBeenCalledOnce();
  });

  it("returns library identity, publish status, enabled variables, and authority boundaries", async () => {
    const variant: any = {
      id: "variant:1",
      name: "State=Default",
      type: "COMPONENT",
      key: "variant-key",
      remote: false,
      parent: null,
      componentPropertyDefinitions: {},
      getPublishStatusAsync: async () => "UNPUBLISHED",
    };
    const componentSet = {
      id: "set:1",
      name: "Work Card / Default",
      type: "COMPONENT_SET",
      key: "set-key",
      remote: false,
      children: [variant],
      componentPropertyDefinitions: {
        State: { type: "VARIANT", defaultValue: "Default", variantOptions: ["Default", "Featured"] },
        "Title#1:1": { type: "TEXT", defaultValue: "ControlMux" },
      },
      getPublishStatusAsync: async () => "UNPUBLISHED",
    };
    variant.parent = componentSet;
    const component = {
      id: "component:1",
      name: "Standalone",
      type: "COMPONENT",
      key: "component-key",
      remote: false,
      componentPropertyDefinitions: {},
      getPublishStatusAsync: async () => "CURRENT",
    };
    const page = {
      id: "page:library",
      name: "Components",
      type: "PAGE",
      children: [componentSet, component],
      async loadAsync() {},
      findAllWithCriteria(criteria: { types: string[] }) { return criteria.types.includes("INSTANCE") ? [] : [componentSet, variant, component]; },
      findAll() { return []; },
    };
    const style = { id: "style:1", name: "Paper/Surface", key: "style-key", remote: false, getPublishStatusAsync: async () => "CURRENT" };
    const variable = { id: "variable:1", key: "variable-key", name: "color/surface", resolvedType: "COLOR", remote: false, variableCollectionId: "collection:1" };
    const collection = { id: "collection:1", key: "collection-key", name: "Example / Surface", variableIds: [variable.id] };
    (globalThis as Record<string, unknown>).figma = {
      editorType: "figma",
      root: { name: "Example Library", children: [page] },
      getLocalPaintStylesAsync: async () => [style],
      getLocalTextStylesAsync: async () => [],
      getLocalEffectStylesAsync: async () => [],
      getLocalGridStylesAsync: async () => [],
      variables: {
        getLocalVariableCollectionsAsync: async () => [collection],
        getLocalVariablesAsync: async () => [variable],
      },
      teamLibrary: {
        getAvailableLibraryVariableCollectionsAsync: async () => [{ name: "Consumer Library", key: "remote-collection", libraryName: "Consumer" }],
        getVariablesInLibraryCollectionAsync: async () => [{ name: "color/text", key: "remote-variable", resolvedType: "COLOR" }],
      },
    };

    await expect(queryDocument({ kind: "library_inventory" })).resolves.toMatchObject({
      fileName: "Example Library",
      local: {
        components: [
          { id: "set:1", type: "COMPONENT_SET", key: "set-key", publishStatus: "UNPUBLISHED", variantCount: 1 },
          { id: "variant:1", type: "COMPONENT", key: "variant-key", publishStatus: "UNPUBLISHED", properties: [] },
          { id: "component:1", type: "COMPONENT", key: "component-key", publishStatus: "CURRENT" },
        ],
        styles: [{ id: "style:1", publishStatus: "CURRENT" }],
        variables: [{ id: "variable:1", key: "variable-key" }],
      },
      enabledLibraries: { variableCollections: [{ key: "remote-collection", variableCount: 1 }] },
      publicationAuthority: { pluginApiCanInspectPublishStatus: true, pluginApiCanImportPublishedAssetsByKey: true, pluginApiCanPublishLibrary: false, pluginApiCanEnableLibrary: false },
    });
  });

  it("plans published library imports without calling the provider during dry-run", async () => {
    const page = makeImportPage();
    let importCalls = 0;
    (globalThis as Record<string, unknown>).figma = {
      currentPage: page,
      importComponentByKeyAsync: async () => { importCalls += 1; throw new Error("must not run during dry-run"); },
    };

    await expect(applyDocument({ action: "import_library_asset", assetType: "component", key: "published-component-key", instanceName: "Imported / Work Card", dryRun: true })).resolves.toMatchObject({
      dryRun: true,
      plan: { assetType: "component", key: "published-component-key", providerOperation: "figma.importComponentByKeyAsync", writePerformed: false, targetPage: { id: "page:target" } },
    });
    expect(importCalls).toBe(0);
    expect(page.children).toHaveLength(0);
  });

  it("imports a published component with exact properties and readback behind confirmation", async () => {
    const page = makeImportPage();
    const commitUndo = vi.fn();
    const component = {
      id: "remote-component:1",
      name: "Work Card / Featured",
      type: "COMPONENT",
      key: "published-component-key",
      remote: true,
      createInstance() {
        const instance: Record<string, any> = {
          id: "instance:1",
          name: "",
          type: "INSTANCE",
          parent: null,
          x: 0,
          y: 0,
          componentProperties: { State: { type: "VARIANT", value: "Default" }, "Title#1:1": { type: "TEXT", value: "ControlMux" } },
          setProperties(values: Record<string, string | boolean>) {
            for (const [key, value] of Object.entries(values)) this.componentProperties[key].value = value;
          },
          async getMainComponentAsync() { return component; },
          remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
        };
        return instance;
      },
    };
    (globalThis as Record<string, unknown>).figma = {
      currentPage: page,
      importComponentByKeyAsync: async (key: string) => { expect(key).toBe("published-component-key"); return component; },
      commitUndo,
    };

    await expect(applyDocument({
      action: "import_library_asset",
      assetType: "component",
      key: "published-component-key",
      instanceName: "Imported / Work Card",
      x: 120,
      y: 240,
      propertyValues: { State: "Featured", "Title#1:1": "Imported Work Card" },
      dryRun: false,
      confirm: true,
    })).resolves.toMatchObject({
      state: "PASS_LIBRARY_ASSET_IMPORTED",
      writePerformed: true,
      importedAsset: { key: "published-component-key", remote: true },
      instance: { id: "instance:1", name: "Imported / Work Card", parentId: "page:target", mainComponentKey: "published-component-key", requestedKey: "published-component-key", componentProperties: { State: { value: "Featured" }, "Title#1:1": { value: "Imported Work Card" } } },
    });
    expect(commitUndo).toHaveBeenCalledOnce();
    expect(page.children).toHaveLength(1);
  });

  it("requires confirmation for a non-dry-run library import", async () => {
    const page = makeImportPage();
    (globalThis as Record<string, unknown>).figma = { currentPage: page };
    await expect(applyDocument({ action: "import_library_asset", assetType: "variable", key: "published-variable-key", dryRun: false })).rejects.toMatchObject({
      bridgeError: { code: ErrorCode.INVALID_PARAMS },
    });
  });

  it("fails closed when the idempotency name points at a different library identity", async () => {
    const page = makeImportPage();
    const otherMain = { id: "other-main:1", key: "different-key", parent: null };
    const existing = {
      id: "existing:1",
      name: "Imported / Work Card",
      type: "INSTANCE",
      parent: page,
      componentProperties: {},
      async getMainComponentAsync() { return otherMain; },
    };
    page.children.push(existing);
    (globalThis as Record<string, unknown>).figma = { currentPage: page };
    await expect(applyDocument({ action: "import_library_asset", assetType: "component", key: "published-key", instanceName: "Imported / Work Card", dryRun: true })).rejects.toMatchObject({
      bridgeError: { code: ErrorCode.AMBIGUOUS_TARGET },
    });
  });
});

function makeImportPage() {
  const page: any = {
    id: "page:target",
    name: "Consumer",
    type: "PAGE",
    children: [],
    async loadAsync() {},
    findOne(predicate: (node: any) => boolean) { return this.children.find(predicate) ?? null; },
    appendChild(node: any) { node.parent = this; this.children.push(node); },
  };
  return page;
}

function makePage(id: string, name: string) {
  return {
    id,
    name,
    type: "PAGE",
    children: [] as Array<Record<string, unknown>>,
    async loadAsync() {},
    findAllWithCriteria() { return []; },
    findAll() { return []; },
  };
}

function makeChild(page: ReturnType<typeof makePage>, id: string) {
  const child: Record<string, unknown> = {
    id,
    name: "Child",
    type: "FRAME",
    parent: page,
    remove() { page.children.splice(page.children.indexOf(child), 1); },
  };
  return child;
}

function makeFigma(page: ReturnType<typeof makePage>, commitUndo = vi.fn(), paints: Array<Record<string, unknown>> = [], collection?: Record<string, unknown>) {
  const collections = collection ? [collection] : [];
  for (const paint of paints) {
    const originalRemove = paint.remove as (() => void) | undefined;
    paint.remove = vi.fn(() => {
      originalRemove?.();
      paints.splice(paints.indexOf(paint), 1);
    });
  }
  for (const item of collections) {
    const originalRemove = item.remove as (() => void) | undefined;
    item.remove = vi.fn(() => {
      originalRemove?.();
      collections.splice(collections.indexOf(item), 1);
    });
  }
  return {
    root: { name: "Typed Test File", children: [page] },
    editorType: "figma",
    getNodeByIdAsync: async (id: string) => id === page.id ? page : page.children.find((child) => child.id === id) ?? null,
    getLocalPaintStylesAsync: async () => paints,
    getLocalTextStylesAsync: async () => [],
    getLocalEffectStylesAsync: async () => [],
    getLocalGridStylesAsync: async () => [],
    variables: {
      getLocalVariableCollectionsAsync: async () => collections,
      getLocalVariablesAsync: async () => [],
    },
    teamLibrary: {
      getAvailableLibraryVariableCollectionsAsync: async () => [],
    },
    commitUndo,
  };
}
