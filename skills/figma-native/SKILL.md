---
name: figma-native
description: Set up, connect, diagnose, and execute low-level native Figma Plugin API work through Figma Plugin's `figma_status`, `figma_query`, `figma_apply`, `figma_exec`, and `figma_export` MCP tools. Use typed query/apply for common read/mutation contracts and raw execution only for uncovered provider APIs. Use when MCP/plugin setup or target routing is unclear, when direct Plugin API inspection/mutation or typed artifact export is required, or when another Figma capability needs precise runtime/API execution rules. Own connection recovery, editor/runtime gating, API authority, safe JavaScript execution, page/window targeting, error recovery, and compact evidence returns. Do not own Product Design, layout/system/component/token/typography/prototype/motion decisions or fixed-artifact verification verdicts.
---

# Figma Native

Own the **provider/runtime execution substrate** for Figma Plugin. Other Figma Skills decide what the design/system operation should mean; this Skill makes native Plugin API execution correct, targeted, recoverable, and evidence-efficient.

## Terminal job

Move from unknown/known local state to a verified Figma target, execute the bounded native API operation, and return the smallest evidence needed to prove the requested postcondition. Complete when runtime target, API operation, and proof level are explicit and unresolved provider limitations remain truthful.

## Decision advantage

This Skill earns its place by turning an unrestricted JavaScript executor into **bounded, target-aware native execution**. Decide the exact file/window/page/editor and the smallest useful result projection before writing code; distinguish provider/API uncertainty from execution failure; and keep read-modify-verify atomic only when those operations share one causal transaction. Do not trade correctness for fewer calls: split work when page/editor context, failure recovery, or proof would become ambiguous.

## Skill I/O contract

Optimize the execution boundary, not the methodology.

**Minimum input**
- exact runtime target or enough `figma_status` evidence to resolve it;
- one bounded native operation and its expected postcondition;
- only the API/type authority needed for that operation.

**Escalate input only when** target, editor support, page loading, font/API availability, or visible proof is unresolved. Prefer a narrow structural projection over returning node graphs. For local `figma_exec`, set `capability` to the active primary Skill when known; reuse one `traceId` across retries of the same logical operation and increment `attempt` only for retries.

**Return** a compact packet: target identity, operation/result or typed error, affected IDs, material warnings, and only the evidence needed by the caller. Use `maxOutputChars` as an output guardrail, not as a reason to omit required proof.

## Distillation and provider authority

Read `references/provenance.md` only when auditing this Skill or when current provider behavior conflicts with these instructions. Treat the bundled/current Plugin API typings and actual runtime as execution authority; official/public Figma Skills are operational evidence, not a substitute for local capability truth.

Prefer provider-efficient primitives **only when the bound runtime exposes them**. Current upstream `use_figma` documents helpers such as `node.query(...)`, `node.set(...)`, and `figma.createAutoLayout(...)`; probe typings/runtime before emitting them through ControlMux instead of assuming upstream helper parity. A failed native script must be treated as a diagnosed failure, not a reason to blindly retry; if the runtime guarantees atomic script failure, record that evidence before relying on it for recovery semantics.

## System-plane invariants

- Runtime/tool availability is not design authority.
- Window/page/session identity is explicit state; do not reuse stale IDs when status is ambiguous.
- Provider acknowledgement is weaker than inspected postcondition when the result can be read back.
- Keep one coherent Figma job per call; use local JavaScript computation to reduce tool chatter without creating giant unrecoverable scripts.
- Unsupported editor/API/feature is a legitimate terminal limitation. Do not emulate unrelated semantics silently.

## Setup and connection

When installation, MCP discovery, first connection, or recovery is material, read [Setup and connection recovery](references/onboarding.md).

State model:

```text
PACKAGE_READY
-> MCP_REGISTERED
-> FIGMA_PLUGIN_IMPORTED
-> FIGMA_PLUGIN_RUNNING
-> STATUS_VERIFIED
-> TARGET_RESOLVED
```

If shell access exists, prefer `figma-plugin doctor --json` (or `node dist/server/index.js doctor --json`) before asking the user to guess local setup state.

## Runtime tools

### `figma_status`
Use when connection/editor/window/page/session truth is missing, ambiguous, or stale. With several windows online, resolve an `instanceId` before writes. Use `pageId` only for deliberate non-current-page targeting.

### `figma_exec`
Execute plain JavaScript against the native Figma Plugin API.

Core rules:

1. Use top-level `await` and `return`; do not wrap an async IIFE.
2. Do not call `figma.closePlugin()`, `figma.showUI()`, or take over `figma.ui`; ControlMux owns lifecycle/transport.
3. Treat execution as Figma main-thread JavaScript, not a browser DOM environment.
4. Prefer async APIs for dynamic-page-safe access and use `await figma.setCurrentPageAsync(page)` rather than assigning `figma.currentPage`.
5. Load fonts before text mutation.
6. Clone/reassign read-only paint/effect arrays when editing them.
7. Return every created/materially changed id needed downstream.
8. Return filtered projections, counts, and selected evidence rather than whole native node graphs.
9. Annotate calls when practical for local telemetry:
   - `// @controlmux read <label>`
   - `// @controlmux write <label>`
   - `// @controlmux export <label>`
10. On API error, diagnose the exact error before retrying.

Read [Execution and token economy](references/execution-contract.md) for call patterns and compact return patterns.

When dynamic-page loading, style/variable binding, append-before-sizing Auto Layout, idempotent cleanup, handoff inspection, normalized text mutation, structure measurement, undo boundaries, or phase checkpoints are material, **READ** [Runtime SDK](references/runtime-sdk.md) and opt into latest `runtimeSdk: "v2"`. Use `v1` only for compatibility with its smaller helper surface. The injected `figmaPlugin` object owns deterministic provider mechanics only; keep Product/Design/reuse/verdict decisions with their domain capability. Omit the field for unchanged plain native JavaScript.

### `figma_export`
Use for typed artifact egress when the terminal result is a file/byte artifact rather than in-context visual evidence. It exports one exact node, transports bytes through the bounded local binary bridge, persists them on the server, and returns artifact metadata/path.

- Prefer `figma_export` over ad-hoc `figma_exec` binary returns for SVG/PDF/JSON/video or larger durable artifacts.
- Keep PNG/JPG root binary returns in `figma_exec` only when the image itself is immediate MCP visual evidence and the smaller 10 MiB image limit is appropriate.
- `figma_export` is egress only; it does not import bytes into another Figma file. Compose provider `upload_assets` or another actual ingress primitive when cross-file binary transfer is required.
- Respect the default 32 MiB / hard 64 MiB local transport budget and reduce scale/quality/scope rather than raising limits casually.


## API authority

When an API/property is uncertain, read [API authority and discovery](references/api-authority.md). Prefer current installed `@figma/plugin-typings` for the active project, then official Figma developer documentation, then observed runtime evidence.

Use `scripts/search_api.py <symbol>` to inspect installed typings without loading the entire declaration file.

Treat beta/feature-gated capabilities such as current Motion surfaces as conditional; probe support and preserve `unsupported`/`PARTIAL` truth.

## Editor/runtime gating

Read [Editors and runtime](references/editors-runtime.md) when Design/FigJam/Slides differences, dynamic page access, or long-running execution are material.

Do not assume a Design node/API exists in FigJam or Slides. Branch on actual `figma.editorType` and current typings/runtime evidence.

## Inspect -> mutate -> verify

For an existing object:

1. resolve the smallest target by selection/id/query;
2. inspect only decision-relevant properties;
3. assert target type/ownership before mutation;
4. mutate with native API;
5. read back cheap postconditions in the same call when the intended write is already known;
6. use a separate render/export only when visible proof is materially required.

When the first inspection changes what the correct mutation should be, keep it as a separate decision call.

## Binary/visual evidence

For immediate PNG/JPEG proof inside a `figma_exec` result, root `{ format, nodeId, bytes }` remains supported and becomes MCP image content. For durable typed artifacts use `figma_export`, which returns local artifact metadata/path instead of binary model context. Never base64-encode artifact bytes inside Figma.

Static export proves a visual state, not motion over time. Use the motion capability's proof method for temporal claims.

## Error recovery

Classify before retry:

- missing MCP tool -> plugin/MCP discovery issue;
- no connected window -> Figma companion not running/connected;
- ambiguous target -> resolve instance/session;
- stale page/node -> refresh status/reinspect;
- missing font -> discover/load font;
- sync API rejected under dynamic page -> use async/load page;
- unsupported editor/API/feature -> change valid branch or stop;
- output too large -> filter/aggregate locally;
- syntax/runtime error -> fix code, not document state;
- timeout after dispatch -> inspect target before retry because side effects may have occurred.

## Composition boundaries

Use the dedicated Skill for domain decisions:

- `figma-scene`: scene/plane/depth/shape.
- `figma-layout`: layout relationships and responsive geometry.
- `figma-tokens`: variables/token system.
- `figma-typography`: text/font system.
- `figma-visual-system`: color/material/effects.
- `figma-components`: component APIs/reuse.
- `figma-prototype`: interaction state paths, reactions, navigation, overlays, variables/conditions.
- `figma-motion`: Motion timelines, keyframes, timing/easing, and temporal choreography.
- `figma-verification`: fixed-artifact audit and evidence-backed verdicts.
- `figma-design-authoring`: whole Product-Design-to-Figma authoring.
- `figma-design-system`: whole reusable system governance.

This Skill remains independently useful for setup, diagnostics, and direct native execution without becoming a second design owner.
