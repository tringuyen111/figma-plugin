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
});

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
