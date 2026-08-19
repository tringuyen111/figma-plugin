# Runtime SDK v2

Use this branch when native execution needs targeted dynamic-page loading, complete async style or variable binding, idempotent cleanup, append-before-sizing Auto Layout mechanics, compact handoff evidence, normalized text mutation, undo boundaries, structure evidence, or explicit checkpoints. Use plain native execution when those helpers do not change correctness. Runtime SDK v1 remains available for compatibility with its original smaller surface.

Enable it on `figma_exec`:

```json
{
  "runtimeSdk": "v2",
  "code": "const node = await figmaPlugin.resolveNode('1:2', 'FRAME'); return figmaPlugin.measureStructure(node);"
}
```

The code receives one local `figmaPlugin` object:

| Helper | Provider invariant |
|---|---|
| `loadPage(pageOrId)` | loads exactly one PageNode with `PageNode.loadAsync` instead of forcing full-document loading |
| `resolveNode(id, expectedType?)` | re-resolves dynamic-page node identity and optionally asserts type |
| `clearDirectChildren(parent)` | loads PageNode targets, snapshots ids, re-resolves each node, re-checks direct ownership, then removes |
| `appendAutoLayoutChild(parent, node, sizing?)` | appends before applying `FILL / HUG / FIXED` or grow properties |
| `loadTextFonts(node)` | loads one or all mixed fonts before text mutation |
| `setText(node, value)` | normalizes value to string after loading required fonts |
| `bindTextStyle(node, styleId)` | uses `setTextStyleIdAsync` required by dynamic-page manifests |
| `bindFillStyle(node, styleId)` | uses `setFillStyleIdAsync` required by dynamic-page manifests |
| `resolveStyle(id, expectedType?)` | resolves style identity with `getStyleByIdAsync` and optional type assertion |
| `bindStyle(node, slot, styleId)` | binds text, fill, stroke, effect, or grid styles through the matching async setter |
| `resolveVariable(id)` | resolves a Variable object through `getVariableByIdAsync` before binding |
| `bindVariable(node, field, variableOrId)` | passes a Variable object to `setBoundVariable`, as required by dynamic-page mode |
| `bindPaintVariable(paint, field, variableOrId)` | returns the paint produced by `setBoundVariableForPaint` |
| `inspectHandoff(nodeOrId, options?)` | collects native CSS, Dev Resources, component identity/properties, publish status, and top-level frame identity when supported |
| `measureStructure(root)` | reports component/instance links and Auto Layout owners without serializing node graphs |
| `commitUndoCheckpoint(label, evidence?)` | commits the current provider mutation group to Figma undo history and returns a compact checkpoint |
| `checkpoint(label, evidence?)` | returns a compact phase checkpoint for caller-owned persistence/telemetry |
| `assert(condition, message)` | fails with an SDK-scoped diagnostic |

The SDK owns exact provider sequencing only. It does not decide what to delete, which component to reuse, whether a design is good, or whether evidence earns PASS. The caller still binds target/authority and returns/records checkpoints. A caller timeout cannot cancel already-dispatched Figma JavaScript; inspect/recover before retrying.

`figma_status` reports the `runtimeSdks` advertised by each exact loaded companion bundle. If a caller requests a version the instance does not advertise, the bridge returns `UNSUPPORTED_OPERATION` before queue/dispatch and asks for a companion reload. Do not treat transport reconnection or matching semver as proof that Figma loaded rebuilt plugin bytes.

Prefer targeted `loadPage` for one-page work. Whole-document operations may load every page only when their scope truly requires every page; Figma warns that `loadAllPagesAsync` can be slow and memory-heavy on large documents.
