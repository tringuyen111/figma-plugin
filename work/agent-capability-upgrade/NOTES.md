# Rolling notes — agent capability upgrade

## Objective

Upgrade the Figma agent system so multi-skill work is planned in executable packets, deep context is loaded progressively with immediate notes, visual representation is selected by reasoning shape, and fragile Figma mechanics move into deterministic support.

## Bound facts

- `figma-design-authoring` owns whole-scene authoring and already names specialist capability boundaries, but it has no durable work graph or rolling-note protocol.
- `figma-native` documents dynamic-page, font, targeting and timeout failures, but callers still hand-code fragile provider sequencing.
- Operation telemetry groups retries but does not bind an operation to a plan/step or chosen representation.
- The live capability run proved local component reuse and visual composition, while exposing dynamic-page, Auto Layout ordering, stale-node cleanup, evidence-drift and timeout/recovery gaps.
- Existing behavioral/value evals remain `FROZEN_NOT_RUN`; build/craft evidence must not be upgraded into comparative Skill uplift.

## Prompt/context reference — distilled immediately after load

- Separate semantic truth, representation choice, context timing and evidence; a later layer cannot repair an earlier one.
- Put universal control at the entrypoint, branch depth behind `WHEN / WHY / TARGET`, and deterministic repetition in scripts/schemas.
- Keep only the current deep context plus a compact checkpoint; load the next specialist when its decision becomes material.
- Match representation to reasoning shape: sequence -> steps, branch -> decision table/tree, state -> state graph, interacting dimensions -> matrix, ownership -> typed graph, exact repetition -> schema/tool.

## Loaded context ledger

| Resource | Why loaded | Distilled | Still active |
|---|---|---:|---:|
| `skill-plugin-engineering/SKILL.md` | classify Skill vs adapter/runtime/eval intervention | yes | yes |
| `engineering-planning/SKILL.md` | select planning state and proof topology | yes | yes |
| `implement/SKILL.md` | bind real seam and execute | yes | yes |
| `prompt-context.md` | user-reported context overload and representation failure | yes | yes |
| four relevant local Figma Skill entrypoints | bind current ownership without loading all 16 | yes | only owner summaries |
| `execution-plan.md` | synthesize shared runtime/Skill/eval delta and proof | yes | yes |
| `decomposition-and-proof.md` | split by observable outcome/recovery/proof rather than files or Skills | yes | yes |
| `durable-work-graph.md` | persist stable node identity and frontier across context/session boundaries | yes | yes |

## Execution-plan reference — distilled immediately after load

- The target is fixed enough to plan; current source lags it in deterministic support, plan attribution and behavioral evidence.
- Shared/foundation work is earned only where current consumers prove it: the runtime SDK and operation contract are shared; specialist methodology remains locally owned.
- Every work packet needs failure behavior, observability and a real-seam proof; build success cannot substitute for live Figma or behavioral evidence.
- The plan must preserve `FROZEN_NOT_RUN` for comparative Skill value while still allowing exact mechanism tests and one self-run vertical slice.

## Decomposition/proof reference — distilled immediately after load

- Work nodes are earned by independent semantic outcome, failure/recovery or proof—not by file, code layer or Skill name.
- The shared execution contract is a FOUNDATION; one live Figma WALKING_SKELETON must prove it before specialist fan-out is called ready.
- Progressive orchestration, runtime SDK, plan-aware telemetry and evaluation have distinct falsifiers, so they remain separate nodes with typed dependencies.
- Each node must name entrypoint, proof target, non-goals and recovery; no node may silently drop cross-file reuse or design-to-code obligations.

## Durable-graph reference — distilled immediately after load

- This project has no existing work tracker, so the project-native JSON plan will be the explicit canonical owner for this upgrade only—not a hidden global ledger.
- Stable node keys and typed dependencies must survive context compaction; status changes require verified postconditions.
- Replanning updates only invalidated nodes. The live demo failures are evidence attached to runtime/evidence nodes, not a reason to restart unrelated Skill work.
- The current frontier is FOUNDATION (`execution-contract`) plus its first executable dependents; cross-file reuse and parity remain later blocked/proof nodes.

## Current frontier

1. Materialize an execution graph and rolling-note contract.
2. Implement deterministic Figma runtime helpers for observed provider failures.
3. Bind MCP operations to plan step and representation, then expose that in telemetry/UI.
4. Add falsifiable eval fixtures and run full/live proof without claiming comparative uplift.

## Runtime SDK checkpoint

- DECISION: SDK is opt-in as `runtimeSdk: "v1"`; legacy `figma_exec` keeps the original lexical surface.
- MECHANISM: the injected `figmaPlugin` object owns dynamic-page async bindings, append-before-sizing, id-re-resolved cleanup, font-safe text, compact structure measurement and caller-returned checkpoints.
- NON-GOAL: it does not choose design semantics, deletion scope, reuse policy or verdict state.
- EVIDENCE: typecheck PASS; 6 plugin execution tests and 7 MCP surface tests PASS, including legacy isolation, invalid version, cleanup, layout ordering, style binding and structure measurement.
- LIVE STATE: the installed Figma companion still runs the prior bundle until reloaded; live SDK execution is not yet claimed.

## Plan-aware telemetry checkpoint

- DECISION: extend the existing optional `operation` object; keep exactly three MCP tools and preserve legacy callers.
- CONTRACT: `planId + stepId` are an all-or-nothing pair; `representation` uses a bounded enum derived from reasoning shapes.
- UI: logical-operation rows expose step/representation compactly; detail sheets expose full plan, step and representation identity.
- BOUNDARY: telemetry observes plan identity but never becomes canonical plan state and never turns declared postconditions into PASS.
- EVIDENCE: typecheck PASS; 25 focused schema/attribution/summary/UI tests PASS after regenerated `plugin/ui.html`.

## Visual projection checkpoint

- Work graph SVG was rendered in Chromium at 1366 × 890 and visually inspected: typed dependency paths, PASS/ACTIVE/PENDING/BLOCKED states, and current frontier are distinguishable without a prose plan.
- Companion UI synthetic fixture was inspected at 390 × 720: operation rows expose `step + representation`; detail exposes full plan/step/representation plus attempts and non-certified postconditions.
- Artifacts: `output/playwright/06-agent-work-plan.png`, `07-plan-aware-operation-log.png`, `08-plan-aware-operation-detail.png`.
- BOUNDARY: fixture proves projection/rendering only. It does not prove live Runtime SDK execution, behavioral Skill uplift, cross-file reuse, design-to-code parity, or independent qualification.
- CONTRADICTION: the first full build found a stale test oracle locked to the previous frontier. The validator was preserved; the test now reads the progressed frontier and constructs an actually incomplete dependency for its negative case.

## Stale companion and final boundary checkpoint

- OBSERVED: after rebuilding the server, the prior Figma companion reconnected and an SDK read failed because the loaded plugin bytes had no `figmaPlugin` injection.
- ROOT CAUSE: hello/status carried semver + protocol only; same-version source rebuilds were indistinguishable from the loaded companion bundle.
- CHANGE: the exact loaded companion now advertises `runtimeSdks`; status exposes the list and bridge dispatch returns `UNSUPPORTED_OPERATION` before queue when the requested SDK is absent.
- EVIDENCE: stale-companion bridge test proves zero queued/dispatched requests; full source/bundle gate passed before final graph-state update; final gate follows.
- LIVE STATE: the companion is currently disconnected after bridge restart. Live Runtime SDK execution is `BLOCKED_RELOAD_REQUIRED`, not PASS.
- GRAPH: all deterministic mechanism nodes are PASS; live Runtime SDK and design-to-code parity are BLOCKED. Canonical frontier is empty because no executable packet is ready without external action/authority.

## Final-gate re-entry

- FAILURE: the first final gate reported 83 passing assertions but one unhandled timeout rejection; build therefore remained FAIL.
- CAUSE: the timeout test attached its rejection matcher only after waiting for dispatch, allowing the 30 ms promise to reject first under load.
- CORRECTION: attach success/failure observers immediately when both timeout-sensitive promises are created; preserve production timeout behavior and the original oracle.
- FOCUSED EVIDENCE: `tests/server/bridge.test.ts` 16/16 PASS with no unhandled error. Full gate rerun follows.

## Final deterministic result

- `npm run build`: PASS — 18 test files, 83 tests, typecheck, capability validator, bundle build and shipped-bundle smoke.
- Shipped-bundle smoke: native execution, page targeting, binary bridge, output budget, typed export and Runtime SDK v1 all PASS.
- `npm audit`: 0 vulnerabilities.
- Current MCP boundary: exactly 3 tools; plan-aware operation and Runtime SDK schemas present; invalid trace/partial plan return `INVALID_PARAMS`.
- Current live provider: no connected Figma companion after final leader restart. Bridge remains running for reload/reconnect; live SDK node remains BLOCKED.

## Live Runtime SDK re-entry

- ACTION: restarted the MCP leader from the current `dist/server/index.js` to remove any stale leader state.
- OBSERVED: the Figma companion reconnected on `127.0.0.1:38470`; `figma_status` reported `pluginConnected: true`, one instance, `runtimeSdks: ["v1"]`, queue `0`, pending `0`.
- EVIDENCE: `npm run test:mcp-operation` returned `SDK_READ_OK`; the read carried plan-aware operation metadata and completed without a queued or in-flight remainder.
- DECISION: `runtime-sdk-live` is now `PASS`; overall work graph remains `BLOCKED` only because design-to-code parity still lacks an authorized frontend target.

## Runtime SDK v2 and latency closeout

- UPGRADE: v1 remains compatible; exact companion capability negotiation now advertises v1 and v2. V2 adds targeted page loading, complete async style slots, object-based variable binding, native CSS/Dev Resource/component handoff inspection and undo checkpoints.
- UI ROOT CAUSE: the WebSocket relay iframe synchronously rebuilt a growing 100-operation DOM on telemetry updates, delaying the same event loop that forwards native responses.
- UI CHANGE: operation rendering is debounced and windowed to 24 rows with explicit “show older” expansion; all request evidence remains retained in state/telemetry.
- LIVE V2: page loading, fill-style binding, width/color variable binding, CSS/component/publish inspection, undo checkpoint, fixture cleanup and queue recovery PASS. `addDevResourceAsync` returned HTTP 403 and remains `BLOCKED_BY_PROVIDER`.
- PERFORMANCE: at about 88 retained requests, sequential median fell from 184.04 ms to 17.70 ms and p95 from 198.68 ms to 30.94 ms; two-call burst wall time fell from 248.98 ms to 46.78 ms. MCP startup remained roughly 0.48–0.61 s and is not claimed improved.
- FILE STATE: all three pages remain present and empty; local components, styles, variables and enabled external variable libraries remain zero.

## Typed runtime platform cutover

- ARCHITECTURE: `scripts/lib/runtime-client.mjs` now owns MCP stdio, decoding, and single-instance selection for live recipes.
- PUBLIC SURFACE: added read-only `figma_query` (`file_inventory`, `node_handoff`, `structure`) and guarded `figma_apply` (`clear_file_owned_assets`, dry-run default); raw `figma_exec` and `figma_export` remain compatible.
- STALE GUARD: build revision `0e749e4b5f99fc30` is injected into server/plugin and v2 dispatch rejects a mismatched companion before queueing.
- LOCAL EVIDENCE: 20 test files / 92 tests, typecheck, bundle and smoke PASS.
- LIVE STATE: companion revision `0e749e4b5f99fc30` matched server; `figma_query` inventory and guarded `figma_apply` dry-run PASS. Runtime v2 fixture also PASS_WITH_PROVIDER_LIMIT with Dev Resource write 403.

## Telemetry delta protocol

- DECISION: retain a full self snapshot only at connect/resync; normal broadcasts send `telemetry_delta` with `seq`, current aggregate metrics, changed request/operation records and removals.
- MECHANISM: `telemetry-delta.ts` owns per-connection cursor comparison; `bridge.ts` remains transport orchestration; UI upserts bounded state and sends `telemetry_resync` on a sequence gap.
- EVIDENCE: 21 test files / 97 tests, typecheck and bundle smoke PASS; bridge tests prove full-once, delta progression, sub-frame coalescing, peer-window runtime load and resync recovery.
- LIVE STATE: build revision `3804fe4ab09d239d` reconnected after restart. Core v2 smoke PASS with provider probes disabled; typed query/apply PASS; bounded 100-record pressure benchmark reached median `7.25 ms`, p95 `8.33 ms`, burst `11.43 ms`; file inventory is empty.

## Smoothness correction

- ROOT CAUSE: runtime lifecycle updates previously emitted a state snapshot plus a telemetry delta, and the UI synchronously rendered the log for state-only updates. This duplicated wire/UI work; full-history diffing also ran on each lifecycle change.
- CHANGE: `RuntimeTelemetry` now tracks dirty request/operation IDs; `TelemetryChannel` batches lifecycle deltas for 16 ms, sends one final delta for sub-frame calls, and sends peer-window state without replaying telemetry. UI batches telemetry view refresh for 32 ms and only requests resync when the sequence actually diverges.
- PROVIDER BOUNDARY: core v2 smoke no longer calls `getDevResourcesAsync` or `getPublishStatusAsync` by default. Provider probes are explicit and separate, so a provider timeout cannot masquerade as a core plugin smoothness failure.
