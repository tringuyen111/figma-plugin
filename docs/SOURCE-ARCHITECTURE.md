# Source architecture

Current package: `0.7.0` · Protocol: `10` · Canonical Skills: `16`.

## Source topology

```text
src/
  capabilities/
    skill-registry.ts       canonical Skill identity, outcome, editor scope, evidence policy
    provider-evidence.ts    observed provider snapshot; live revalidation required

  server/
    index.ts                CLI entrypoint and stable exports
    runtime.ts              MCP/runtime orchestration
    mcp-surface.ts          five-tool schemas, validation, dispatch, result encoding
    bridge.ts               HTTP/WebSocket instances, routing, sessions
    plugin-connection.ts    one-window queue and pending execution lifecycle
    bridge-protocol.ts      wire validation, binary framing, bounded HTTP body parsing
    runtime-telemetry.ts    request history and latency/byte/retry metrics
    telemetry-delta.ts      compact UI delta projection and resync boundary
    export-artifacts.ts     private local artifact persistence
    doctor.ts               local package/readiness checks

  plugin/
    main.ts                 companion bootstrap and bridge client
    runtime-sdk.ts          opt-in native helper surface
    sync-engine.ts          document/style/variable observation and change journal
    handlers/
      entity-operations.ts            compatibility facade for query/apply
      entity-query-operations.ts      typed query dispatch
      entity-evidence.ts              query/readback projection owner
      entity-mutation-operations.ts   transaction, preflight, execute, rollback
      entity-mutation-snapshot.ts     stable conflict/rollback state
      entity-operation-support.ts     shared plugin-handler primitives
      document-operations.ts          public document action facade
      execute-js.ts / export-node.ts  raw escape hatch and export mechanics

  ui/
    template.html
    styles.css
    script/                 ordered UI source fragments

  shared/
    protocol.ts             server/plugin wire contract
    entity-contract.ts      discriminated command types, wire validation, refs, dependency plan, fingerprints

skills/                     16 standalone capability packages
evals/                      frozen comparison and mechanism contracts
design/                     approved companion truth and teaching specimens
docs/                       current user and maintainer contracts
plugin/manifest.json        Figma manifest source
```

## Source, derived output, and local state

| Class | Paths | Rule |
|---|---|---|
| canonical source | `src/`, `skills/`, `plugin/manifest.json`, `design/`, `evals/`, `docs/` | edit and review |
| generated runtime | `dist/`, `plugin/code.js`, `plugin/ui.html`, optional `*.map` | regenerate; never hand-edit as truth |
| generated evidence/package | `output/`, `coverage/`, `figma-plugin-*.tgz` | local and disposable |
| dependency/tool cache | `node_modules/`, `.playwright-cli/` | reproducible/local; remove for pristine handoff |
| local runtime identity | `tunnel-id.txt`, environment-specific state | not build output; do not delete through generic clean |

`scripts/clean-generated.mjs` owns the explicit generated-output allowlist. `--all` extends that list only to dependency and Playwright caches. It resolves every target beneath the plugin root before deletion.

## Build topology

```text
src/server/index.ts
  -> esbuild
  -> dist/server/index.js

src/plugin/main.ts
  -> esbuild
  -> plugin/code.js

src/ui/template.html + styles.css + ordered script parts
  -> scripts/build-ui.mjs
  -> plugin/ui.html
```

Production builds disable source maps. `npm run build:debug` enables external maps explicitly, and `npm run clean` removes them. `scripts/build.mjs` clears `dist/` before bundling and computes one normalized `bundleRevision` from package, lockfile, notices, manifest, and runtime source.

## Runtime ownership

- `index.ts` starts CLI/stdio and does not own domain behavior.
- `runtime.ts` owns process-level orchestration, not MCP presentation schemas.
- `mcp-surface.ts` owns public tool contracts, not WebSocket details.
- `bridge.ts` owns routing and connection orchestration, not per-window queue internals.
- `plugin-connection.ts` owns one Figma window's queue/pending lifecycle.
- `sync-engine.ts` observes Figma state; Figma remains source of truth.
- `entity-query-operations.ts` and `entity-evidence.ts` own evidence reads; mutation identity never hashes that evolving projection.
- `entity-mutation-operations.ts` owns transaction ordering and rollback; `entity-mutation-snapshot.ts` owns the stable mutable-state baseline used by `planHash`.
- `sync-engine.ts` is the only owner of `controlId` namespace, allocation, cross-store collision, and metadata writes.
- UI source lives only under `src/ui/`; generated `plugin/ui.html` is consumed output.
- Skills own design judgment; the runtime owns bounded mechanics and evidence transport.

## Typed mutation topology

```text
MCP schema
-> shared entity contract validation
-> dependency/execution plan
-> stable mutation snapshot v1
-> dry-run planHash + preconditions
-> plugin transaction mutation
-> undo + mutation-state rollback verification
-> separate evidence readback
-> full result or compact receipt
```

Transaction-local `opRef` edges let later operations consume identities produced earlier in the same patch. Invalid producer graphs, duplicate refs, kind mismatch, unknown typed commands, and cycles fail before mutation with `INVALID_PARAMS`. Conflict and rollback use an explicit mutable-state whitelist plus touched properties; evidence-only additions such as new geometry diagnostics do not invalidate a plan.

## Sync topology

The companion observes document/style changes when supported and page-scoped node changes in degraded mode. Variable fingerprints are rescanned periodically because the provider does not expose an equivalent complete change event. The bounded journal is cache/evidence, not an alternate document store.

Every cursor binds `syncEpoch + sequence`. A stale or discontinuous cursor returns `RESYNC_REQUIRED`; it is not silently advanced.

## Package topology

The npm package uses exact runtime file paths:

```text
dist/server/index.js
plugin/manifest.json
plugin/code.js
plugin/ui.html
```

It also carries Skills, docs, design/eval resources, manifests, licenses, and notices. It excludes source, tests, development scripts, setup tooling, source maps, evidence, caches, and archives. `scripts/check-package.mjs` validates the actual `npm pack --dry-run` inventory.

The installed package must include compiled runtime output because Codex caches packaged files without running `npm install` or a build step.

## Tool and capability constraints

The public surface remains exactly:

```text
figma_status
figma_query
figma_apply
figma_exec
figma_export
```

A new public tool needs an independent semantic output, material reduction in context/retry/error risk, its own evidence boundary, and no duplication of an existing typed operation or provider surface.

## Proof boundary

Source checks, typecheck, tests, bundle smoke, doctor, and package inventory prove only their consumed seams. A live claim additionally needs the intended installed package, current task pickup, connected companion, matching `bundleRevision`, exact target, and claim-appropriate readback/render/playback evidence.
