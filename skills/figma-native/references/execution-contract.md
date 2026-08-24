# Execution and I/O efficiency

## Goal

Move computation to Figma; move only decision-relevant evidence back to the model.

## Call shape

Use one `figma_exec` call with a JavaScript body plus required MCP `traceId + operation` context. A source comment may provide a compatibility label inside the local bridge, but it cannot replace accountable MCP context:

```js
// @controlmux read Inspect text nodes
const nodes = figma.currentPage.findAllWithCriteria({ types: ["TEXT"] })
return nodes.slice(0, 20).map(n => ({ id: n.id, name: n.name, characters: n.characters.slice(0, 80) }))
```
Use `read` for inspect/list/get-only work, `write` whenever the call mutates Figma (including read-modify-verify), and `export` for image/artifact export. The MCP runtime rejects mutation-capable tool calls without structured context; it never guesses intent from JavaScript source.


Top-level `await` and `return` are supported by the local runtime. Do not wrap in an IIFE.

## Accountable operation context

For `figma_exec`, `figma_apply`, and `figma_export`, supply context outside the JavaScript/body parameters:

```text
capability  primary ControlMux Figma Skill responsible for the operation
traceId     stable id for one logical operation across retries
attempt     1 for the first attempt; increment only when retrying that same operation
operation   label + kind + phase + target + expected postconditions
```

`traceId + operation` are required; `capability` and `attempt` are optional. Non-read operation context must include postconditions, which remain unverified until matching readback/evidence exists. These fields do not authorize work or change Figma semantics. Normal sequential steps are separate logical operations and must not be mislabeled as retries.

Do not add attribution when the primary owner is genuinely unresolved; inaccurate telemetry is worse than missing telemetry.

## Response discipline

Prefer:

```js
return { id: frame.id, type: frame.type, width: frame.width, height: frame.height }
```

over:

```js
return frame
```

The runtime summarizes native Figma nodes, but agent-authored projections are more intentional and usually smaller.

For lists, return counts + the relevant subset + enough identity to continue:

```js
return {
  total: matches.length,
  items: matches.slice(0, 25).map(n => ({ id: n.id, name: n.name, type: n.type }))
}
```

The default output budget is intentionally bounded. If it is exceeded, refine the query before increasing the budget.

## Read-modify-verify in one call

When the target and intended mutation are already known, avoid a separate verification MCP call if a cheap postcondition can be checked locally:

```js
const node = await figma.getNodeByIdAsync("1:2")
if (!node || node.type !== "FRAME") throw new Error("Expected FRAME 1:2")
node.name = "Settings"
return { id: node.id, name: node.name, type: node.type }
```

Use separate calls when the first result genuinely changes what should happen next.

## Binary/visual result

For PNG/JPEG visual proof:

```js
const node = await figma.getNodeByIdAsync("1:2")
if (!node || !("exportAsync" in node)) throw new Error("Node is not exportable")
const bytes = await node.exportAsync({ format: "PNG" })
return { format: "PNG", nodeId: node.id, bytes }
```

The local runtime recognizes root `{format, bytes}` output and converts bytes to base64 for the MCP image content path.

## Avoid payload and context traps

- Do not return `figma.root`, a whole PageNode, all variables, or all components by default.
- Do not serialize screenshots as base64 text in agent code.
- Do not return console logs as the primary result; use `return`.
- Do not read every page when the current page or known ids answer the task.
- Do not send many MCP calls merely to do a loop that JavaScript can do inside one call.
- Do not merge unrelated jobs into one giant script just to reduce calls; large scripts are harder to recover and debug.

## Error recovery

Read the exact thrown API error. Distinguish:

- unsupported editor/API -> change branch or stop;
- missing font -> load/discover font;
- dynamic-page sync API -> switch to async variant/load page;
- wrong node type -> re-inspect target identity;
- oversized response -> filter/aggregate locally;
- syntax/runtime error -> fix JavaScript, not the Figma document.
