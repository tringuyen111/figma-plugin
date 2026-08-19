# API authority and discovery

## Source order

Resolve uncertain API behavior from current sources in this order:

1. installed `@figma/plugin-typings/plugin-api.d.ts` in the active project/runtime;
2. Figma Plugin API reference on `developers.figma.com`;
3. Figma's official `figma/plugin-typings` repository;
4. observed runtime behavior on the exact editor/version, recorded as runtime evidence rather than universal API truth.

Do not use generated wrapper catalogs or remembered helper names as Plugin API authority.

## Search helper

Run:

```bash
python scripts/search_api.py getNodeByIdAsync
python scripts/search_api.py TransformGroupNode
python scripts/search_api.py manualKeyframeTracks --root /path/to/project
```

The helper searches likely installed Figma typings and prints a small context window rather than loading the whole typings file into model context.

## Dynamic-page check

When both sync and async versions exist, inspect documentation comments for `documentAccess: "dynamic-page"`. Prefer the async form when the sync API is deprecated, write-only, or documented to throw under dynamic loading.

## Editor check

Confirm whether an API is Design-only, FigJam-only, Slides-only, Dev-only, Buzz-only, or shared before executing it.

## Beta/proposed check

Treat Motion, pattern/shader/other beta or proposed APIs as conditional. Probe support and preserve `unsupported` as a legitimate result; do not emulate an unsupported native capability by silently switching to unrelated semantics.
