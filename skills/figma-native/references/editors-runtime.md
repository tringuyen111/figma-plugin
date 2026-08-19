# Editors and runtime

## Editor gating

Branch on:

```js
figma.editorType // "figma" | "figjam" | "dev" | "slides" | "buzz"
```

This local bridge manifest currently targets Figma Design, FigJam, and Slides. The presence of a method in general Plugin API documentation does not guarantee it is valid in every editor.

### Figma Design

Use frames/components/instances/variables/prototyping and ordinary scene nodes according to native support.

### FigJam

FigJam exposes editor-specific objects such as stickies, shapes-with-text, connectors, code blocks, media, tables, and the timer. Some Design-only page/component operations are not available. Prefer Sections for board organization when pages are not part of the editor model.

### Slides

Slides adds slide grid/row/slide/interactive slide element node types and editor-specific transition behavior. Do not assume Design-page creation semantics apply to Slides.

## Dynamic page access

The bridge manifest uses `documentAccess: "dynamic-page"`. Consequences:

- prefer async getters where sync versions are deprecated/throw;
- load a PageNode before accessing children when required;
- set page context with `setCurrentPageAsync`;
- load the whole document only when the task truly needs whole-document coverage.

## Main-thread JavaScript environment

Agent code runs in Figma's plugin main-thread sandbox. It has modern JavaScript core features and the `figma` global. It is not an ordinary browser window. The bridge UI iframe owns WebSocket/browser APIs.

Do not call plugin lifecycle/UI APIs from `figma_exec`; they can terminate or replace the bridge transport.

## Long-running work

Synchronous heavy loops can freeze the Figma editor. Prefer targeted indexed queries, bounded work, and separate coherent calls when a task spans huge documents. Server-side timeout can stop waiting for a response but cannot make an infinite synchronous loop safe inside Figma.
