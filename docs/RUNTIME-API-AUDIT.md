# Runtime and Figma API audit — 2026-08-20

Scope: the current `figma-plugin` package, Figma Desktop file `Untitled`, and the local MCP → HTTP leader → WebSocket companion → native Plugin API path. This is not a claim about Figma REST API coverage or published Team Library administration.

## Observed baseline

| Boundary | Current evidence |
|---|---|
| MCP connect + first status | about 0.48–0.51 s process startup; first live status about 9 ms |
| Sequential native read | first measured run: median 61.68 ms, p95 125.92 ms over 20 reads |
| Read burst | 8 calls completed in 715.35 ms; one in-flight slot intentionally serialized execution |
| History pressure | after 85 logged requests, a short run showed 184.04 ms sequential median and server telemetry p95 queue 753 ms |
| Recovery | queue, pending, and in-flight returned to zero after every benchmark |

The transport/status path is fast. The material regression came from the companion UI synchronously rebuilding a growing operation log while the same iframe also relayed execution responses. Increasing `MAX_IN_FLIGHT` was rejected: caller-declared `kind: read` is observability metadata and cannot enforce that arbitrary JavaScript is mutation-free.

## Chosen API upgrades

| API/mechanism | Why it is used | Runtime surface |
|---|---|---|
| `PageNode.loadAsync` | target one page under `documentAccess: dynamic-page`; avoid unconditional whole-document loading | `figmaPlugin.loadPage` and page-safe cleanup |
| `getStyleByIdAsync` plus async style setters | cover text, fill, stroke, effect, and grid without deprecated synchronous assignment | `resolveStyle`, `bindStyle` |
| `getVariableByIdAsync`, object-based `setBoundVariable`, `setBoundVariableForPaint` | preserve dynamic-page-safe Variable identity | `resolveVariable`, `bindVariable`, `bindPaintVariable` |
| `getCSSAsync`, `getDevResourcesAsync`, `getPublishStatusAsync` | collect native implementation/reuse evidence without inventing code correctness | `inspectHandoff` |
| `commitUndo` | make a completed mutation packet a recoverable Figma undo boundary | `commitUndoCheckpoint` |
| local style/variable collection removal APIs | deterministic file-owned cleanup after node removal | `npm run clear:figma-file` |

Runtime SDK v1 remains compatible. V2 is separately advertised by the exact loaded companion so a stale v1 bundle fails before queueing a v2 request.

## Deliberately not activated

| API | State | Reason |
|---|---|---|
| `loadAllPagesAsync` | CONDITIONAL | Figma warns it can be slow and memory-heavy. Use only for true whole-document traversal/events; maintenance loads each explicitly required page. |
| `documentchange` | NOT_USED | requires whole-document loading in dynamic-page mode. Prefer `PageNode.nodechange` or `stylechange` when a concrete external-change consumer exists. |
| `figma.codegen` | NOT_USED | requires a separate Dev Mode/codegen manifest capability and lifecycle; it does not belong in the current always-open execution companion by default. |
| Team Library enable/unpublish | PROVIDER_LIMIT | enabled variable libraries can be queried, but Figma does not let Plugin API enable libraries. Published component/style discovery still requires keys or another authorized source. |
| `saveVersionHistoryAsync` | NOT_DEFAULT | useful for explicit release checkpoints, but Figma documents timing caveats after plugin mutations; it should not be hidden inside every operation. |
| concurrent arbitrary `figma_exec` | REJECTED | arbitrary code labelled `read` may still mutate; parallel execution would weaken ordering and recovery truth. |

Primary API references: [Figma global API](https://developers.figma.com/docs/plugins/api/figma/), [dynamic page migration](https://developers.figma.com/docs/plugins/migrating-to-dynamic-loading/), [Team Library](https://developers.figma.com/docs/plugins/api/figma-teamlibrary/), [ComponentNode handoff APIs](https://developers.figma.com/docs/plugins/api/ComponentNode/), and [editor events](https://developers.figma.com/docs/plugins/api/properties/figma-on/).

## Proof boundary

- Local source/build proof: PASS — typecheck, 21 test files / 97 tests, bundle build, and shipped-bundle smoke all passed after telemetry batching and core/provider probe separation.
- Historical Runtime SDK v2 live proof: core `PASS` — companion advertised `v1, v2`; targeted page loading, style/variable binding, native CSS/component inspection with provider calls disabled, undo checkpoint, cleanup, and queue recovery passed. This proof was bound to an older bundle revision and is not current-source proof until re-run.
- Post-optimization history-pressure benchmark: sequential median `7.25 ms` and p95 `8.33 ms` at the bounded 100-record retention window; two-call burst wall `11.43 ms`. The request lifecycle is coalesced into one delta when it completes inside the 16 ms flush window, while peer windows still receive current runtime load. This is an observed local comparison, not a universal Figma performance claim.
- Team Library cross-file import/update proof: exact cloud source/target files now exist in team `Test`; source foundations/component/export are PASS. The source component was edited in place into a 3-variant, 9-property component set while preserving master `1:16`. The new transfer preflight binds both instances and fails closed at `READY_FOR_PUBLISH` while source status is `UNPUBLISHED`; import is not attempted until the user/Figma publish gate is satisfied. See `output/figma-evidence/figma-cross-file-library-proof.json`.
- Design-to-code parity: PASS bounded to the new `Personal Homepage / Paper / 1440x1024` frame and `prototype/` browser target; see `prototype/design-translation.json`.
- Figma-native prototype reaction wiring: PASS bounded to local readback (`Hero / Primary CTA` → `Selected Work / Prototype Destination` → `BACK`); cloud prototype click-run remains NOT_RUN.

## Current-source revalidation — 2026-08-19

- Current package revision: `1431a21f019211dd`.
- Typed inventory and guarded dry-run: PASS was observed against current source revision `1431a21f019211dd` after the companion reload.
- Current MCP operation returned `SDK_READ_OK`; Runtime SDK v2 core proof returned `PASS` with temporary fixture cleanup and queue/in-flight recovery.
- The exact command results and stale-revision boundary are recorded in `../output/figma-evidence/current-runtime-proof.json`.
