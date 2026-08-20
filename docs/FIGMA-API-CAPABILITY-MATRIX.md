# Figma API capability matrix — 2026-08-20

This document is the source-grounded boundary for the local Figma companion. It separates what the native Plugin API can execute, what REST can read, what the provider/MCP can discover, and what remains a Figma release or permission action. A successful local node write is not evidence that a library was published or enabled.

## Capability matrix

| Capability | Native Plugin API | REST API | Current project surface | Truth status |
|---|---|---|---|---|
| Read local pages/nodes | `PageNode.loadAsync`, node traversal, `getNodeByIdAsync` | `GET /v1/files/:key` | `figma_query:file_inventory`, `figma_query:structure`, `figma_exec` | Supported; page identity is explicit |
| Create/edit components | node creation, `combineAsVariants`, component properties, variables/styles bindings | File-content write is not the project write path | `figma_exec`, design scripts, Runtime SDK v2 helpers | Supported; edit-in-place preserves node identity when the script targets the existing node |
| Inspect component identity | `ComponentNode.key`, `remote`, `getPublishStatusAsync`, property definitions | Published component metadata endpoints | `figma_query:library_inventory`, `figma_query:node_handoff` | Supported; status is evidence, not publication |
| Inspect local styles/variables | local style/variable APIs, keys, scopes, modes, bindings | file content/variable reads are plan-dependent | `figma_query:library_inventory`, Runtime SDK v2 | Supported; provider errors are returned as bounded evidence |
| Inspect enabled library variables | `figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync`, `getVariablesInLibraryCollectionAsync` | Published library content reads | `figma_query:library_inventory` | Supported only for libraries enabled/accessible in the current file |
| Import published component | `figma.importComponentByKeyAsync` | No equivalent local instance-creation endpoint | `figma_apply:import_library_asset` | Supported behind dry-run + `confirm:true` + exact key |
| Import published component set | `figma.importComponentSetByKeyAsync`, `defaultVariant.createInstance()` | No equivalent local instance-creation endpoint | `figma_apply:import_library_asset` | Supported behind the same transaction gate |
| Import published style/variable | `figma.importStyleByKeyAsync`, `figma.variables.importVariableByKeyAsync` | REST reads metadata; it does not replace native target-file binding | `figma_apply:import_library_asset` | Supported behind the same gate |
| Enable a library in a file | Not exposed by Plugin API | No supported endpoint in the current REST surface | Explicitly reported in `publicationAuthority` | Provider/UI boundary |
| Publish a library or publish updates | Not exposed by Plugin API | REST component/style endpoints are read-only metadata surfaces; no supported publish operation is exposed | Explicitly reported in `publicationAuthority`; preflight stops at `READY_FOR_PUBLISH` | Provider/UI release boundary |
| Unpublish a library | Not exposed by Plugin API | No supported endpoint used by this project | Not implemented intentionally | Provider/UI release boundary |
| Publish Code Connect mappings | Separate Code Connect CLI/API capability, not Team Library publication | Separate Code Connect scope/CLI | Not part of `import_library_asset` | Different product capability; do not conflate with library publish |

## Project upgrade

The local MCP surface now has typed lifecycle paths:

```text
figma_query(kind=library_inventory)
  -> local component/style/variable identities
  -> publish status and remote state
  -> enabled library-variable descriptors
  -> explicit publicationAuthority boundary

figma_apply(action=import_library_asset, dryRun=true)
  -> exact key/page plan, no import call, no write

figma_apply(action=import_library_asset, dryRun=false, confirm=true)
  -> import by published key
  -> create remote instance when asset is a component/component set
  -> apply only exact Figma property keys
  -> commit one undo boundary
  -> read back instance/main-component key/properties
```

The import operation is idempotent for the declared target instance name: an existing target returns `PASS_ALREADY_PRESENT` and performs no write. A provider rejection is surfaced as a real failure; it is not converted into a fallback clone or a PASS result.

## Boundary decisions

1. `getPublishStatusAsync() === "CURRENT"` plus `remote === true` is sufficient for import readiness only when the exact key is also bound to the source identity. It is not a publish command.
2. A local `key` is not proof of a published key. Figma documents that local and published components have keys, but import methods only accept published assets.
3. Component property names with `#...` suffixes are preserved as exact API keys. Visible labels are not substituted because Figma states that the unique suffix distinguishes duplicate TEXT/BOOLEAN/INSTANCE_SWAP properties.
4. Library enablement is kept outside the Plugin API because Figma explicitly requires UI/provider state for enabling libraries.
5. Cross-file reuse remains `REUSE_REMOTE` only after source publication, target access/enablement, import, and main-component readback are all proven.

## References

- [Figma global Plugin API](https://developers.figma.com/docs/plugins/api/figma/)
- [ComponentNode identity, remote state, publish status, and import keys](https://developers.figma.com/docs/plugins/api/ComponentNode/)
- [Component property definitions and exact `#` keys](https://developers.figma.com/docs/plugins/api/properties/ComponentPropertiesMixin-componentpropertydefinitions/)
- [Team Library API and enablement boundary](https://developers.figma.com/docs/plugins/api/figma-teamlibrary/)
- [Figma REST component/style endpoints](https://developers.figma.com/docs/rest-api/component-endpoints/)
- [Figma REST component/style types](https://developers.figma.com/docs/rest-api/component-types/)
