# Figma API capability boundary

Current package: `0.7.0` · Protocol: `10`.

This matrix separates the local native Plugin API path, metadata/read surfaces, and actions that remain under Figma or user authority. Provider surfaces evolve; revalidate the connected schema and current official documentation before a provider-dependent operation.

## Matrix

| Capability | Native/local mechanism | Current project surface | Boundary |
|---|---|---|---|
| Read pages and nodes | page loading, traversal, `getNodeByIdAsync` | typed queries and `figma_exec` | exact instance/page required |
| Create or edit native structure | Plugin API node/component/variable/style operations | typed patches, Runtime SDK, `figma_exec` | mutation metadata and readback required |
| Inspect component identity | key, remote state, publish status, property definitions | library/component facts | status is evidence, not publication |
| Inspect local styles and variables | local style/variable APIs | library, variable, binding facts | provider errors remain explicit |
| Inspect accessible library variables | Team Library inspection APIs | `library_inventory` | only accessible/enabled data is observable |
| Import a published component or set | published-key import APIs | `import_library_asset` | dry-run, confirmation, exact key, readback |
| Import a published style or variable | published-key import APIs | `import_library_asset` | same guarded boundary |
| Enable a library in a file | Figma product/provider state | reported as authority boundary | not silently automated by this kernel |
| Publish or unpublish a library | Figma release/product authority | readiness/status only | not claimed as a local Plugin API capability |
| Publish Code Connect mappings | separate Code Connect capability | Code Connect Skill/workflow | distinct from Team Library publication |

## Typed lifecycle

```text
figma_query(kind=library_inventory)
-> local and accessible library identities
-> publish/remote/status facts
-> explicit authority boundary

figma_apply(action=import_library_asset, dryRun=true)
-> exact target/key plan with no write

figma_apply(action=import_library_asset, confirm=true)
-> published-key import
-> bounded target mutation
-> undo boundary
-> identity and property readback
```

Provider rejection is a real failure; it is not converted to a fallback clone or PASS. Idempotent handling of an already-present declared target does not prove publication or cross-file update propagation.

## Identity rules

1. Keep the complete component-property key, including any unique suffix, when calling component property APIs.
2. Bind a published import key to the intended source identity; a local key is not enough.
3. Keep library publication, library enablement, import, and target readback as separate states.
4. Cross-file remote reuse is proven only when source publication, target access, import, main identity, and intended update relationship are all established.

## Official anchors

- https://developers.figma.com/docs/plugins/api/figma/
- https://developers.figma.com/docs/plugins/api/ComponentNode/
- https://developers.figma.com/docs/plugins/api/figma-teamlibrary/
- https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/
