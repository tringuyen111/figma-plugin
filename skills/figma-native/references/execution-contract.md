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

## Typed component contract mechanics

Use the guarded entity-patch component command family for stable provider mechanics: `add_property`, `edit_property`, `delete_property`, `create_slot`, `reset_slot`, `combine_variants`, plus instance `set_properties`. `create_slot` and `combine_variants` are explicit entity producers and may declare `opRef` when later patches in the same transaction must target the produced Slot/ComponentSet. `combine_variants` consumes component identities through the modeled `members[]` edge; local member refs participate in dependency planning, while omitted `parent` resolves to the current page. Keep full returned component-property keys (including Figma's unique suffix) and inspect property definitions/Slot constraints after mutation. Do not represent Slot creation as generic `add_property`; the runtime couples the semantic Slot property to the native SlotNode on purpose.

## Typed variable graph mechanics

Generic `create` supports `variable_collection` and `variable`; when both are produced inside one transaction, create the variable through the modeled `collection:{opRef}` identity edge. `variable_command` models `add_mode`, `rename_mode`, `remove_mode`, `set_value`, `set_code_syntax`, and `remove_code_syntax`. Mode-targeted commands use exactly one selector: `modeId`, `modeName`, or `defaultMode:true`. `set_value` may carry the modeled `alias` identity edge so a local/persistent variable can be used as the alias source without embedding provider IDs in payload JSON. Code-syntax mutation accepts only verified `WEB`, `ANDROID`, or `iOS` identities. Request `variable_details` only when per-mode values, aliases, scopes, code syntax, description, or publishing visibility are decision-relevant; use `bindings`/`binding_inventory` for bounded consumer postconditions.

## Typed variable consumer binding

Use `set_bindings` as the canonical typed binding owner. Keep variable identity on the modeled top-level `variable` edge so persistent refs and transaction-local variable `opRef`s participate in dependency planning; do not hide variable ids in arbitrary binding payloads. The payload names only the consumer location:

- direct node field: `{kind:"node", field:"opacity"}`; bind with `variable`, or omit `variable` and set `payload.binding.unbind=true`;
- SolidPaint: `{kind:"paint", property:"fills"|"strokes", index:0, field:"color"}` with the same `variable` versus `payload.binding.unbind=true` rule.

Paint binding clones/replaces the immutable paint array through Figma's paint-variable helper. Effects, layout grids, text ranges, and component-property bindings remain separate/untyped until their own contract is proven. Legacy `update.set.boundVariable={field,variableId}` is compatibility-only for direct persistent-variable binding and must not become a second modeled path.

## Typed Grid core mechanics

Use `layout_command` for Grid operations whose correctness depends on Figma method/state semantics rather than a scalar property write:

- `configure_grid` targets the Grid owner and may set bounded row/column counts, gaps, `gridAutoTracks`, and `gridItemsPositioning`; the runtime enters `layoutMode=GRID` and applies row-count changes before final `gridAutoTracks=ROWS` so Figma does not reject an auto-managed row count.
- `place_grid_child` targets a direct child of a `GRID` parent in `MANUAL` positioning, calls native `setGridChildPosition(rowIndex,columnIndex)`, then applies optional row/column span and cell alignment. `ROW_AUTO_FLOW` is a distinct ordering contract and is not silently converted into manual placement.
- Read back the existing `layout` projection. Grid owners expose bounded counts/gaps/auto-track/positioning/track summaries; direct Grid children expose anchors, spans, and cell alignment.

Track-size object mutation, auto-flow reordering, layout-guide styles, and breakpoint/design judgment are outside this runtime command. `figma-layout` owns whether Grid is the correct relation; `figma-native` owns only the execution mechanics.

## Typed mutation receipt mode

`apply_entity_patch` keeps the complete dry-run plan because the normalized patches and plan hash are required for guarded execution. After the plan is accepted, prefer `resultMode: "receipt"` for routine commits and repairs. The receipt keeps stable changed-entity identity, plan/snapshot identity, before/after fingerprints, rebase state, undo/rollback state, and failure limitations while omitting repeated full mutation projections. Request `resultMode: "full"` only when the exact before/after snapshots are needed for the next decision or evidence packet.

This is an I/O optimization, not a weaker proof state: if a failure or partial commit occurs, preserve the receipt's rollback/error truth and inspect the affected scope before retrying.

## Transaction-local identity

When one guarded entity-patch transaction produces an entity graph and then immediately targets those new entities, use `opRef` instead of splitting the work just to discover provider IDs. Supported producers are explicit: generic `create`/`clone` plus typed commands that declare an entity result, currently `component_command:create_slot` and `component_command:combine_variants`. Generic `create` also covers variable collections and variables.

```text
create FRAME     opRef=root
create RECTANGLE opRef=child parent={opRef:root}
update node      target={opRef:child}

component_command create_slot opRef=content target={opRef:card}
update node                  target={opRef:content}

create variable_collection opRef=tokens
create variable            opRef=primitive collection={opRef:tokens}
variable_command set_value target={opRef:semantic} alias={opRef:primitive}
set_bindings target={opRef:surface} variable={opRef:color} binding=paint(fills[0].color)
```

`opRef` is transaction-local only. It may be declared only by an explicit entity-producing patch supported by the contract and consumed only by modeled identity edges: `target`/`parent` plus operation-specific edges such as `combine_variants.members[]`, variable-create `collection`, variable-value `alias`, and consumer-binding `variable`. Do not place magic ref strings inside arbitrary properties or command payloads. The dry-run plan exposes producer/dependency facts and deterministic execution order; execution materializes each ref to a real Figma identity internally and the commit result returns persistent IDs/control IDs for continuation.

Prefer a local ref when the operations share one causal/rollback boundary. Keep separate transactions when the first result must change the user's/design decision, when provider evidence must be inspected before choosing the next mutation, or when combining failures would make recovery ambiguous.

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
