# Architecture upgrade — typed runtime platform

Status: `LIVE_PASS_WITH_PROVIDER_LIMIT`

This document records the first architecture cutover requested after the Figma capability audit. It is intentionally narrower than a full design-system/compiler rewrite.

## Current revalidation boundary

The current source build fixed point is bundle revision `1431a21f019211dd` (package `0.5.6`). The historical proof below must not be read as proof for a different loaded companion revision.

- `npm run test:typed-tools-live` observed a matching current-source typed inventory and guarded dry-run after the companion reload: 3 pages, 2 component records, 8 paint styles, 10 text styles, and zero queue/pending/in-flight residue.
- The stale leader was stopped and restarted from `D:/tri-nguyen-brand-system/figma-plugin/dist/server/index.js`.
- The companion was reloaded from the current development manifest. `npm run test:mcp-operation` returned `SDK_READ_OK`, and `npm run test:runtime-sdk-v2-live` returned core `PASS` with temporary fixture cleanup and queue recovery.
- Provider-specific probes remain opt-in; cross-file reuse, behavioral interaction and independent qualification remain separate `NOT_RUN` claims. Design-to-code parity is now PASS within the bounded Personal Homepage frame.

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
- `node_handoff` — CSS, Dev Resources, component identity, publish status, properties;
- `structure` — descendants, component links, Auto Layout counts.

The handler owns dynamic-page loading and native object normalization. It does not accept arbitrary JavaScript and therefore remains a read-only semantic surface.

### Typed mutation surface — `figma_apply`

Current action:

- `clear_file_owned_assets` — dry-run by default; non-dry-run requires `confirm: true`; returns before/plan/removed/after evidence and commits an undo boundary.

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
| typed query/apply | additive, current-source live proof observed at revision `1431a21f019211dd` |
| old companion without `bundleRevision` | can connect for compatibility, but v2 requests are stale-blocked |

## Proof contract

- Local contract/type/build proof: 21 test files, 97 tests, typecheck and shipped bundle smoke pass.
- Stale revision proof: bridge unit test rejects v2 before queue when the companion revision differs.
- Typed handler proof: plugin tests cover inventory, dry-run guard, confirmed clear, local asset cleanup and undo boundary.
- Current live proof: matching revision `1431a21f019211dd`; `npm run test:mcp-operation` returned `SDK_READ_OK`, typed query/apply returned `PASS`, and core Runtime SDK v2 returned `PASS`. Provider probes are opt-in via `npm run test:runtime-sdk-v2-provider-live`; Dev Resource/publish APIs remain provider-sensitive and are not on the default smoothness gate.
- Smoothness proof: telemetry history pressure at the bounded 100-record retention window measured sequential median `7.25 ms`, p95 `8.33 ms`, and 2-call burst wall `11.43 ms`; final queue/pending/in-flight returned to zero. This is a local observed comparison, not a universal Figma performance claim.

## Deferred architecture

- separate read/query concurrency lane; raw `figma_exec` remains serialized because caller-declared `read` cannot prove mutation freedom;
- packaged CLI/supervisor for build/restart/doctor/fingerprint;
- cross-file published library import/update proof;
- design-to-code parity harness.

These remain separate decisions; they are not silently implied by the typed query/apply addition.
