# Architecture upgrade — typed runtime platform

Status: `LIVE_PASS_WITH_PROVIDER_LIMIT`

This document records the first architecture cutover requested after the Figma capability audit. It is intentionally narrower than a full design-system/compiler rewrite.

## Current revalidation boundary

The current source build fixed point is bundle revision `7634a79593c9d06a` (package `0.6.0`). The historical proof below must not be read as proof for a different loaded companion revision.

- `npm run test:typed-tools-live` observed a matching current-source typed inventory and guarded dry-run after the companion reload: 3 pages, 2 component records, 8 paint styles, 10 text styles, and zero queue/pending/in-flight residue.
- The stale leader was stopped and restarted from `D:/tri-nguyen-brand-system/figma-plugin/dist/server/index.js`.
- The companion was reloaded from the current development manifest. `npm run test:mcp-operation` returned `SDK_READ_OK`, and `npm run test:runtime-sdk-v2-live` returned core `PASS` with temporary fixture cleanup and queue recovery.
- Provider-specific probes remain opt-in. Design-to-code parity is now PASS within the bounded Personal Homepage frame, the derived frontend prototype passes bounded interaction/accessibility probes, and the local Figma file has reaction-wiring/readback PASS for the primary state path. Cross-file reuse, cloud click-run and independent qualification remain separate unproven claims.
- `npm run test:library-api-live` returned `PASS_TYPED_LIBRARY_INVENTORY_READ_ONLY` for the source library; `npm run preflight-cloud-library-transfer` returned `READY_FOR_PUBLISH`; the typed import recipe dry-run returned `writePerformed: false`. Source publication remains `UNPUBLISHED`, so no cross-file instance was created.

## Decision

Keep the existing raw `figma_exec` and `figma_export` contracts for compatibility, but add typed seams for repeated provider work:

```text
Skill reasoning
      ↓
typed MCP query/apply or recipe
      ↓
server routing / trace / timeout / stale revision guard
      ↓
WebSocket companion
      ↓
typed native Figma handler
```

The caller no longer needs to know MCP stdio setup, response text parsing, target selection, page-loading mechanics, local-asset cleanup ordering, or undo checkpoint mechanics for common workflows.

## Implemented seams

### Shared recipe client

`[scripts/lib/runtime-client.mjs](../scripts/lib/runtime-client.mjs)` owns:

- MCP stdio startup and shutdown;
- raw versus decoded tool calls;
- one-instance target resolution;
- shared option parsing and assertion semantics.

The maintenance, benchmark, live SDK smoke, capability demo, and MCP contract smoke now consume this owner instead of repeating five transport/client/parser implementations.

### Typed read surface — `figma_query`

Current query kinds:

- `file_inventory` — pages, components, instances, styles, variables, enabled variable libraries;
- `library_inventory` — exact local component/style/variable identities, publish status, remote state, enabled library-variable descriptors, and explicit publish/enable authority;
- `node_handoff` — CSS, Dev Resources, component identity, publish status, properties;
- `structure` — descendants, component links, Auto Layout counts.

The handler owns dynamic-page loading and native object normalization. It does not accept arbitrary JavaScript and therefore remains a read-only semantic surface.

### Typed mutation surface — `figma_apply`

Current actions:

- `clear_file_owned_assets` — dry-run by default; non-dry-run requires `confirm: true`; returns before/plan/removed/after evidence and commits an undo boundary.
- `import_library_asset` — imports a published component, component set, style, or variable by exact key; dry-run by default; confirmed component imports are idempotent by target name + source identity, commit one undo boundary, and read back the resulting identity/property state.

The current action is deliberately narrow. More actions must earn inclusion through repeated caller logic, a stable invariant, and a real proof seam.

### Exact bundle revision

The build derives a revision from package, manifest, and `src/` inputs. Server and companion hello/status carry this value. Runtime SDK v2 dispatch fails before queueing if the loaded companion revision does not match the server revision.

Matching package semver or SDK version alone is no longer sufficient evidence that the current plugin bytes are loaded.

### Delta telemetry

The companion receives one self-telemetry snapshot with a monotonic `telemetrySeq` when it connects or requests `telemetry_resync`. Normal state broadcasts carry no retained request history; changed request/operation records travel as compact `telemetry_delta` upserts/removals. A sequence gap triggers an explicit resync instead of silently showing an incomplete log. The bridge owns the cursor per connection, while `runtime-telemetry.ts` remains the source of metric/history truth.

## Compatibility and migration

| Existing path | State |
|---|---|
| `figma_status` | preserved |
| `figma_exec` | preserved as raw escape hatch |
| `figma_export` | preserved |
| standalone recipe scripts | migrated to shared `RuntimeClient` |
| typed query/apply | additive, current-source live proof observed at revision `7634a79593c9d06a` |
| old companion without `bundleRevision` | can connect for compatibility, but v2 requests are stale-blocked |

## Proof contract

- Local contract/type/build proof: 21 test files, 102 tests, typecheck and shipped bundle smoke pass.
- Stale revision proof: bridge unit test rejects v2 before queue when the companion revision differs.
- Typed handler proof: plugin tests cover inventory, dry-run guard, confirmed clear, local asset cleanup and undo boundary.
- Current live proof: matching revision `7634a79593c9d06a`; typed library inventory returned `PASS_TYPED_LIBRARY_INVENTORY_READ_ONLY`, typed transfer preflight returned `READY_FOR_PUBLISH`, and typed import dry-run returned no write. The source component set is still `UNPUBLISHED`; publish/enable authority is not claimed.
- Smoothness proof: telemetry history pressure at the bounded 100-record retention window measured sequential median `7.25 ms`, p95 `8.33 ms`, and 2-call burst wall `11.43 ms`; final queue/pending/in-flight returned to zero. This is a local observed comparison, not a universal Figma performance claim.

## Deferred architecture

- separate read/query concurrency lane; raw `figma_exec` remains serialized because caller-declared `read` cannot prove mutation freedom;
- packaged CLI/supervisor for build/restart/doctor/fingerprint;
- cross-file published library import/update proof after the source is actually published and the target library is accessible;
- design-to-code parity harness.

These remain separate decisions; they are not silently implied by the typed query/apply addition.
