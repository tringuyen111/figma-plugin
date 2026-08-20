# Capability upgrade findings

This report is bound to the live Figma execution on 2026-08-19 against file `Untitled`, page `03 - Playground` (`45:70`). It diagnoses the observed capability system; it is not a general superiority claim for the Skills or plugin.

This is a historical live snapshot. Current package/runtime currentness is tracked separately in `output/figma-evidence/current-runtime-proof.json`; the current source build is revision `1431a21f019211dd`, and its core v2 proof has now been revalidated after companion reload.

## What the live run proved

| Claim | State | Evidence |
|---|---|---|
| Exact current page can be cleared safely | PASS | page target was bound by `instanceId + pageId`; direct children were re-resolved by id before removal; remaining count was zero |
| A coherent 1440 × 1024 product composition can be authored and exported | SELF_REVIEWED | native Figma PNG export was opened and inspected |
| Created components can be reused locally | PASS | 11 discovered instances; 11 resolved to exact main components; 5 component masters and 1 variant set exist |
| Auto Layout and semantic styles are materially present | PASS | 66 Auto Layout owners, 8 text styles and 5 paint styles were inspected from the live graph |
| Evidence displayed in the design matches the measured graph | PASS | construction emitted `11/11`, `66`, `8`, and `4`; an independent read pass matched component links and Auto Layout count |
| Rebuilt companion advertises Runtime SDK v1/v2 and executes native v2 helpers | PASS_WITH_PROVIDER_LIMIT | `figma_status` reported one instance with `runtimeSdks: ["v1", "v2"]`; plan-aware read returned `SDK_READ_OK`; targeted page/style/variable/CSS/component/undo fixture passed and cleaned itself; Dev Resource write returned provider HTTP 403 |
| Reuse from another published Figma library works | NOT_RUN | no cross-file library was published/enabled/consumed in this run |
| The design produces correct implementation code | NOT_RUN | a design packet exists, but no frontend implementation/parity comparison ran |
| Behavioral interaction quality is proven | NOT_RUN | no representative prototype interaction run occurred |
| The Skills outperform a baseline | NOT_RUN | no frozen same-task baseline comparison exists |

Durable evidence: `output/figma-evidence/evidence.json` and `output/figma-evidence/figma-capability-demo.png`.

## Observed failures and their real owners

| Failure | Root owner | Why this is not solved by adding more prose to a Skill |
|---|---|---|
| `textStyleId` failed under `documentAccess: dynamic-page` | provider adapter/runtime SDK | Figma requires async style binding APIs; this is deterministic provider translation |
| `FILL` failed before a child was appended to an Auto Layout parent | construction SDK | operation order is a machine-checkable ownership invariant |
| cleanup saw a stale node reference after parent removal | transaction/recovery adapter | idempotent cleanup must re-resolve ids and re-check direct ownership |
| first render hard-coded `94%`, `12`, and `38` while the graph measured `11` and `66` | evidence engine | design copy must consume measured facts, not agent-authored confidence numbers |
| a separate evidence-binding execution exceeded deadline and held the instance in flight | operation runtime | long mutation phases need checkpoints, timeout alignment and reconnect-safe recovery |

The visible design question was eventually resolved. The dominant difficulty was not idea generation; it was missing deterministic translation, transaction and evidence infrastructure around the design cognition.

## Upgrade architecture

### P0 — Figma Runtime SDK

Create one reusable adapter below all Skills and demos:

- async-safe text/fill/stroke/effect style binding for dynamic-page manifests;
- append-before-layout-sizing primitives that encode Auto Layout ownership;
- node-id re-resolution and direct-parent guards for mutation/cleanup;
- bounded font loading cache and normalized text mutation;
- typed failures that retain provider API, operation phase and recovery hint.

Completion proof: provider-level unit cases plus live Figma negative/positive executions for each primitive.

### P0 — Transaction and recovery contract

- plan target and intended writes before mutation;
- checkpoint after clear, masters, composition, evidence binding and export;
- make each phase idempotent by stable run id/node plugin data;
- distinguish caller timeout from provider completion;
- reconnect into inspect/recover instead of sending a duplicate mutation.

Completion proof: forced timeout/disconnect cases resume without duplicate nodes or silent partial state.

### P0 — Evidence compiler

- forbid authored confidence percentages unless an explicit formula and inputs exist;
- bind displayed counts/status to graph/runtime results;
- preserve `PASS / FAIL / NOT_RUN / INCONCLUSIVE / BLOCKED` as data;
- export the claim-to-evidence packet beside visual artifacts.

Completion proof: deliberately wrong placeholder metrics are replaced by measured values and verification fails on drift.

### P1 — Reuse Registry

- record local and library component identity, key, semantic job, variants/properties, source file and last verified state;
- resolve reuse candidates before creation;
- verify every resulting instance against the chosen master;
- separate local component reuse from published cross-file library reuse.

Completion proof: a representative component is created/published in an authorized source file, consumed from another file, updated, and re-verified without detaching.

### P1 — Design-to-code parity harness

- generate a revision-bound Design Translation Packet from measured Figma structure;
- implement one representative screen using the packet and existing code components;
- compare layout, typography, tokens, states and component identity in a real browser;
- report mismatches without upgrading packet validity into code correctness.

Completion proof: same revision, implementation runtime screenshot, structural mapping report and accepted mismatch budget.

### P2 — Behavioral capability evaluation

- freeze representative design tasks and a same-tool baseline;
- include positive, near-miss, recovery, content-pressure and cross-file reuse cases;
- compare artifact quality, retries, provider failures, evidence correctness and time/call cost;
- keep self-review separate from independent qualification.

Completion proof: repeatable comparison results bound to exact plugin/Skill/runtime revisions.

## Chosen intervention

The immediate demo fix moved evidence binding into the construction pass and retained an independent verification pass before export. This removed the separate long-running binder and prevented visual metrics from drifting from structural truth. The follow-up package change below materializes the shared mechanism layer; the rebuilt companion has now completed one live Runtime SDK proof.

## Materialized after the live findings

- Progressive work-plan JSON contract, immediate rolling-note protocol, typed dependency graph and SVG projection under `figma-design-authoring`.
- Just-in-time specialist activation and reasoning-shape representation compiler; small direct work explicitly bypasses planning ceremony.
- Compatible `runtimeSdk: "v1"` plus latest `runtimeSdk: "v2"` with targeted page loading, provider-safe cleanup, complete async style/variable binding, Auto Layout child ordering, native handoff inspection, font-safe text, undo boundaries, structure measurement and checkpoints.
- Exact companion capability advertisement in hello/status; stale same-semver bundles fail `UNSUPPORTED_OPERATION` before queue instead of leaking `figmaPlugin is not defined` as a sandbox failure.
- Plan-aware Operation Contract (`planId`, `stepId`, `representation`) projected into telemetry and the companion UI without adding MCP tools.
- Reuse Registry schema/validator with live local component evidence and explicit cross-file `NOT_RUN`.
- Frozen agent-execution eval cases for planning omission, context overload, visual representation, provider recovery, evidence drift and cross-file reuse. Deterministic mechanisms are tested; behavioral Skill A/B and independent qualification remain `NOT_RUN`.
