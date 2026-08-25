# Figma Plugin 0.7.0 — typed CRUD and strict audit

Package: `0.7.0`
Protocol: `10`
Public tools: `figma_status`, `figma_query`, `figma_apply`, `figma_exec`, `figma_export`

This document defines the current typed contract. Bundle revisions and run results belong in revision-bound external evidence, not in this source contract.

## Runtime contract

- `figma_query` adds `artifact_manifest`, paginated `entity_graph`, `change_feed`, `component_integrity`, `binding_inventory`, `prototype_graph`, `motion_snapshot`, and `accessibility_design_facts`. Extended results use schema version 2 with exact target, cursor, coverage, facts, limitations, and observation time.
- `figma_apply(action=apply_entity_patch)` validates at most 100 operations, plans by deterministic `planHash`, requires `dryRun:false + confirm:true + expectedPlanHash` for execution, detects stale/overlapping changes, and returns typed readback plus `ROLLED_BACK` or `PARTIAL_COMMIT` recovery state.
- `accessibility_design_facts` uses an explicit `visual` projection for fills/strokes/opacity instead of depending on the variable-binding projection.
- `motion_command:set_tracks` accepts a bounded array of `{ field, track }` entries and applies them through Figma's native `applyManualKeyframeTrack`; `manualKeyframeTracks` is read-only evidence, never an assignment target.
- Node metadata uses `controlId` in shared plugin data. Styles, variables, and collections use a bounded document-root registry. Duplicate identities are reconciled by preserving the first object and assigning a new ID with `forkedFrom`.
- The companion registers document/style events, coalesces a 2,000-record journal, tracks agent correlation where Figma exposes it, fingerprints variables every five seconds, and reports degraded page scope or resync-required state explicitly.
- `figma_exec` remains an escape hatch. The companion rescans after raw execution; raw execution is not an audit verdict or sync proof.

## Strict-audit artifacts

`AuditProfile`, `AuditReport`, and `UpgradeRun` are separate JSON artifacts. The Luma Bank checklist is stored as a profile fixture at `evals/fixtures/luma-bank-strict-audit.profile.json`; it contains obligations and regression cases, not verdicts. `skills/figma-verification/scripts/audit-run.mjs validate` rejects checklist PASS values, missing target/snapshot evidence, mismatched hashes, screenshot-only runtime claims, unresolved required overall PASS, incomplete BLOCKED packets, and `PARTIAL` statuses.

## Verification boundary

Source checks, typecheck, local tests, bundle smoke, `doctor`, and package validation prove only their directly observed local seams. Live custom-Figma two-way behavior, visual quality, prototype playback, temporal quality, accessibility technology behavior, publication, UAT, and representative Agent/model uplift require separate evidence bound to the exact loaded `bundleRevision`; package validity does not promote those scopes.

## Compact mutation receipts

`apply_entity_patch` accepts `resultMode: "full" | "receipt"`. `full` remains the backward-compatible default. `receipt` applies only to non-dry-run commit/rollback results: dry-run still returns the complete normalized plan required by the guarded plan -> execute flow.

A committed receipt preserves plan identity (`snapshotId`, `planHash`, conflict policy, operation count), stable changed-entity identity (`entityKind`, `id`, `controlId` and relevant key/type/name fields), before/after fingerprints, rebase markers, undo state, and rollback state without repeating the complete `plan.before`, top-level `before`, full `after`, and full projected `changedEntities` payloads. Failure receipts preserve error/rollback truth and rollback fingerprints or limitations. Use `full` only when the caller genuinely needs complete mutation snapshots.

## Transaction-local refs

`apply_entity_patch` supports transaction-local `opRef` identities for explicit entity producers. Generic `create`/`clone` and typed producer commands such as `component_command:create_slot` may declare one `opRef`; another patch in the same request may consume `{ opRef }` only through its existing `target` or `parent` identity edge. Forward references are accepted. The dry-run plan records producers, dependencies, deterministic topological `executionOrder`, and which provider preflight checks are deferred until their producer exists.

Execution binds each producer `opRef` to its real Figma identity internally, so a root -> child -> immediate edit sequence can stay in one guarded plan/commit cycle rather than create -> read ID -> create -> read ID -> edit. Commit results remain ordered by original request order, and producer results include both the local `opRef` and persistent Figma/control identity for later requests. Duplicate/missing refs, dependency cycles, and entity-kind mismatches fail before mutation.

`opRef` is deliberately not an interpolation syntax for arbitrary JSON properties or command payloads. Those provider-specific semantic references remain explicit typed-operation work. Rollback verification checks that every modeled producer result is actually absent after undo; matching synthetic pre-transaction fingerprints alone does not certify rollback.

## Component contract mechanics

`component_command` keeps instance `set_properties` and now models the repeated component-contract operations that previously required raw execution:

- `add_property`: Boolean/Text/Instance Swap/Variant component properties with provider-valid default/preferred-value rules;
- `edit_property`: exact full property-key edits with type-aware restrictions;
- `delete_property`: provider-supported property deletion; Variant deletion is rejected before mutation;
- `create_slot`: native `ComponentNode.createSlot()` plus Slot property configuration. It is an entity producer and may declare `opRef` so the new `SlotNode` can be edited later in the same transaction;
- `reset_slot`: native `SlotNode.resetSlot()`.

Typed `add_property` intentionally rejects `propertyType:SLOT`; use `create_slot` so the semantic Slot property and actual `SlotNode` cannot drift apart. Component projections and `component_integrity` expose bounded Slot child evidence and native `limitViolations`. APIs not yet modeled remain on the bounded `figma_exec` escape hatch with readback rather than widening the public MCP tool surface.

## P2-C2 variant-set construction

`component_command:combine_variants` now models native `figma.combineAsVariants` behind the existing guarded `figma_apply` surface.

- Input components are explicit bounded `members[]` entity refs, not opaque ids embedded in payload JSON.
- Member and explicit parent `opRef`s participate in the same transaction dependency graph as `target`/`parent` refs; omitted parent means the current page.
- The command is an explicit node producer and may expose its new `COMPONENT_SET` through `opRef` to later patches in the same transaction.
- Persistent members are preflighted as local mutable `COMPONENT` nodes; local members defer provider existence/type checks only until their producer has executed.
- Automatic non-overlap rebase is disabled for this multi-target structural operation; a stale plan must be replanned.
- Component projection returns bounded direct member IDs/count/truncation plus `componentPropertyDefinitions`; the runtime reports facts and does not decide whether the variant axes are good design.
- `figma_exec` remains the universal escape hatch for component APIs not yet modeled. GRID, publish/library lifecycle, and automatic variant-axis synthesis remain outside the current typed component slice.



## P2-T1 variable graph mechanics

Variable/token graph construction now uses explicit typed identity relationships behind the existing `figma_apply(action=apply_entity_patch)` surface instead of requiring raw IDs inside arbitrary payloads.

- Generic `create entityKind=variable_collection` remains the collection producer. `create entityKind=variable` may consume a modeled `collection` entity ref, including a transaction-local collection `opRef`; legacy `properties.collectionId` remains compatible, but the two forms are mutually exclusive.
- `variable_command` now models `add_mode`, `rename_mode`, `remove_mode`, `set_value`, `set_code_syntax`, and `remove_code_syntax`. Mode-targeted commands require exactly one selector: `modeId`, `modeName`, or `defaultMode:true`.
- `set_value` accepts exactly one value source: literal `payload.value` or modeled `alias`. Alias refs participate in the same dependency graph and are type-checked against the target variable before mutation.
- Description, scopes, and `hiddenFromPublishing` remain ordinary typed entity properties rather than duplicate variable commands.
- Default variable inventory remains compact. Request `projection:["variable_details"]` only when values-by-mode, scopes, code syntax, description, or hidden/publishing facts are decision-relevant.
- Collection/variable results still return persistent Figma identity after commit, and produced collections/variables participate in rollback-survivor verification.

P2-T1 deliberately stopped before variable-consumer mutation. P2-T2 now owns the first bounded consumer slice below; effects, layout grids, text ranges, and component-property bindings remain outside the typed contract.


## P2-T2 variable consumer bindings

`set_bindings` is the canonical modeled consumer-binding operation behind `figma_apply`. The public MCP tool surface is unchanged.

- Bind actions carry the variable as an explicit top-level `variable` entity ref; transaction-local variable `opRef`s therefore participate in the same dependency DAG as targets/collections/aliases.
- Unbind actions omit `variable` and set `payload.binding.unbind=true`. Bind and unbind are mutually exclusive before mutation.
- Direct node-field bindings use native `node.setBoundVariable(field, Variable|null)`.
- Paint bindings are intentionally bounded to one indexed SolidPaint in `fills` or `strokes`, field `color`; runtime clones the paint array, calls `figma.variables.setBoundVariableForPaint`, and replaces the array. Known non-COLOR variables are rejected for this path.
- Existing `update.set.boundVariable={field,variableId}` remains compatibility-only for direct persistent-variable binding and delegates to the same direct-binding implementation; it is not extended with local refs or paint semantics.
- Existing `bindings` projection / `binding_inventory` remain the readback surface, so default query payloads do not grow.
- Effects, layout-grid, text-range, component-property binding, explicit consumer variable modes, and GRID authoring remain separate frontiers.

## P2-L1 Grid core mechanics

`layout_command` is the typed owner for Grid Auto Layout operations that generic scalar property writes cannot safely model. The public MCP surface remains five tools.

- `configure_grid` enters `layoutMode=GRID` and supports bounded row/column counts, row/column gaps, `gridAutoTracks=NONE|ROWS`, and `gridItemsPositioning=MANUAL|ROW_AUTO_FLOW`. When explicit `rowCount` and final auto rows coexist, the runtime writes the row count while auto tracks are `NONE` and applies `ROWS` last.
- `place_grid_child` targets a direct Grid child, requires `MANUAL` positioning, calls native `setGridChildPosition`, then applies optional row/column span and cell alignment. Bounds are checked against the current Grid before mutation.
- The existing `layout` projection now exposes bounded Grid-owner counts/gaps/auto-track/positioning/track summaries and direct-child anchors/spans/alignment only when the node participates in Grid Auto Layout.
- Mutable track-size object editing, auto-flow reordering, layout-grid guide/style semantics, and responsive design judgment remain separate frontiers.
- `figma-layout` owns the design relation and pressure reasoning; the runtime owns deterministic provider mechanics/evidence. Behavioral Skill superiority remains `NOT_RUN`.
