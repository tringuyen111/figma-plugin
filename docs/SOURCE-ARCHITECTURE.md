# Source architecture

0.5.6 giữ 16 Skill canonical và protocol **v9**. Release này sửa lifecycle reliability: durable export persist ở leader trước follower RPC, artifact persistence private-by-default, Design→Design có transactional ledger/packet, và Components/Prototype có behavioral teaching cases. Không chia `bridge.ts` theo line count.

```text
src/
  capabilities/
    skill-registry.ts       canonical Skill identity, outcome, deep editor scope, evidence policy
    provider-evidence.ts    observed provider surface snapshot; live revalidation required

  server/
    index.ts                CLI entrypoint + stable re-exports
    runtime.ts              leader/follower/session/runtime coordination
    mcp-surface.ts          local MCP schema, dispatch, MCP result encoding
    bridge.ts               HTTP/WebSocket orchestration, instances, routing, session binding
    plugin-connection.ts    per-window queue, pending execution, socket lifecycle
    runtime-telemetry.ts    per-window request history, queue/execution/I-O/retry metrics, completion accounting
    telemetry-delta.ts      per-connection cursor, compact upsert/remove projection, resync boundary
    bridge-protocol.ts      wire validation, handshake identity, binary framing (<=64 MiB), HTTP body parsing
    export-artifacts.ts     persist typed export bytes to local artifacts; return metadata/path
    request-telemetry.ts    request semantic label + optional capability/trace/attempt attribution helpers
    leader.ts / follower.ts
    session.ts
    doctor.ts               local package/runtime checks + non-authoritative provider snapshot notice

  plugin/
    main.ts
    runtime-sdk.ts              opt-in provider-mechanical helpers injected as figmaPlugin
    handlers/execute-js.ts
    handlers/export-node.ts      PNG/JPG/SVG/PDF/JSON/MP4/GIF/WEBM export

  ui/
    template.html
    styles.css
    script/
      00-state-format.js
      10-render.js
      20-connection.js
      30-events-bootstrap.js

  shared/
    protocol.ts

evals/
  skill-boundaries.json     frozen trigger/boundary/evidence cases + migration/candidate truth
  skill-value.json          frozen capability/proof/I-O comparison contract for all 16 Skills
  craft-exemplars.json      craft-core teaching-case qualification + self-review/NOT_RUN truth
  agent-execution.json      progressive planning/context/representation/runtime cases; behavioral comparison remains frozen

skills/figma-design-authoring/
  references/progressive-workflow.md
  schemas/work-plan.schema.json
  scripts/work-plan.mjs     validate canonical JSON and render typed SVG work graph

skills/figma-components/
  references/reuse-registry.schema.json
  scripts/validate-reuse-registry.mjs

design/
  direction-approved.md     approved companion product/UI truth
  exemplars/                project-level HTML/render evidence for teaching-case self-review

plugin/
  code.js                   generated Figma plugin bundle
  ui.html                   generated runtime UI
```

## Ownership rules

- `index.ts` không chứa business/runtime coordination.
- `runtime.ts` không định nghĩa MCP presentation schema.
- `mcp-surface.ts` không biết WebSocket implementation details.
- `bridge.ts` điều phối transport/instances/routing/session; không sở hữu queue internals hoặc design cognition.
- `plugin-connection.ts` sở hữu request lifecycle đúng một Figma window; `runtime-telemetry.ts` sở hữu metrics/history; `telemetry-delta.ts` chỉ chiếu thay đổi qua wire và không trở thành nguồn dữ liệu thứ hai.
- UI chỉnh ở `src/ui/*`; `plugin/ui.html` là generated truth.
- `shared/protocol.ts` chỉ chứa contract thực sự dùng chung plugin/server.
- Skill quyết định domain HOW/WHY; server không hard-code Design ontology.

## Capability truth rules

### Skill registry

`src/capabilities/skill-registry.ts` là source duy nhất cho:

- canonical installed Skill identity;
- accountable outcome;
- deep editor scope;
- evidence policy.

`doctor.ts` và `scripts/check-capabilities.mjs` consume registry này. Figma manifest editor support không được dùng để suy ra deep Skill scope.

### Provider evidence snapshot

`src/capabilities/provider-evidence.ts` ghi provider surfaces **đã quan sát** trong connected Figma schema ở thời điểm audit. Nó không phải runtime guarantee và không định nghĩa Skill topology.

```text
live schema/runtime > official docs > installed provider Skill > packaged snapshot/memory
```

`runtimeRevalidationRequired` luôn true. Nếu live provider có semantic proof tool tốt hơn generic execution, agent nên delegate; local runtime không clone nó chỉ để có tên tool tương tự.

### Evidence vector

Evidence dimensions:

```text
runtime
structure
system-reuse
visual
interaction
temporal
accessibility
translation-parity
```

Một claim chỉ PASS nếu evidence đúng dimension đủ sức chứng minh claim đó. `figma-verification` có claim-scoped policy; authoring Skills vẫn self-verify postcondition của chính thay đổi mình tạo.

## Skill value and I/O rules

Skill methodology is not assigned a token budget. The architecture optimizes the **edge around cognition**:

```text
strong Skill decision method
        ↓
minimum sufficient evidence
        ↓ escalate only when needed
bounded execution / provider delegation
        ↓
compact result + matching proof
```

`figma_exec` and `figma_export` accept optional `capability`, `traceId`, `attempt`, and structured `operation` metadata. `operation` binds a concise label, request kind, phase, target, and expected postconditions to one stable `traceId`; retries retain the identity and increment `attempt`. `operation-context.ts` validates the contract at both MCP and bridge runtime boundaries. These fields are observability-only: they do not authorize a write, select a Skill, alter target routing, change Plugin API execution, or turn declared postconditions into PASS evidence. `runtime-telemetry.ts` separates queue/execution latency and projects retained requests into logical-operation summaries for the companion UI; `telemetry-delta.ts` sends only changes after the initial snapshot and requests a full resync on a sequence gap.

The value evaluator is lexicographic: capability quality first, proof correctness second, I/O fitness third. Token/call reduction cannot compensate for degraded decisions or proof.

## Craft exemplar rule

Five design-heavy Skills keep their detailed teaching cases **inside each Skill** so direct invocation remains sufficient. Project-level `design/exemplars/` exists only as inspectable qualification evidence; no Skill depends on those HTML/PNG files to reason correctly.

`evals/craft-exemplars.json` requires:

- exact local teaching-case reference for each craft-core Skill;
- required expert/alternative/construction/critique/re-entry/anti-copy markers;
- project product-truth and rendered specimen paths;
- self-review state separate from independent/behavioral qualification.

A future revision must not replace a detailed case with a shallow example merely to reduce context size. References remain progressive-loaded.

## Generated artifact rule

`scripts/build-ui.mjs` ghép template/styles/scripts theo lexical order thành `plugin/ui.html`.

`scripts/build.mjs` xóa `dist/` trước bundle để không giữ output topology cũ, build server/plugin main và regenerate UI. Không sửa `plugin/ui.html` như source lâu dài.

## Local tool surface rule

Giữ đúng 5 public local tools:

```text
figma_status
figma_query
figma_apply
figma_exec
figma_export
```

Structured local tool mới chỉ được thêm khi evidence chứng minh:

1. semantic output độc lập;
2. giảm material context/retry/error risk;
3. không phải rename một `figma_exec` snippet;
4. có postcondition/evidence riêng;
5. không duplicate official provider truth.

## Topology migration rule

Khi split/add/remove Skill:

1. update canonical registry;
2. migrate Skill frontmatter/method/provenance/cross-references by meaning;
3. migrate frozen eval ownership;
4. update docs/package metadata;
5. validate exact final bytes;
6. giữ behavioral uplift `NOT_RUN` cho tới khi representative executions thực sự chạy.

0.5.2 đã đóng migration `Prototype -> figma-prototype` và `Verification -> figma-verification`. 0.5.3 giữ đúng 15 Skill; `figma-motion-to-code` được materialize thành conditional reference branch của `figma-design-to-code`, vẫn `NOT_RUN` về behavioral qualification.


## 0.5.5 runtime egress and lifecycle

Public local MCP surface is now `figma_status`, read-only `figma_query`, guarded `figma_apply`, raw `figma_exec`, and `figma_export`. Query/apply dispatch typed protocol operations so common inventory, library lifecycle inspection, published-key import, and cleanup work no longer requires repeated agent-authored JavaScript. `figma_query(kind=library_inventory)` returns identity/status/authority evidence; `figma_apply(action=import_library_asset)` performs exact-key imports only behind dry-run and confirmation, with undo and readback. `figma_export` dispatches protocol operation `export_node`; the plugin validates/exports bytes, binary framing transports them locally, and `export-artifacts.ts` persists them without serializing large binary into MCP text/image context. Requested filenames are basenames only and existing paths are not overwritten.

`plugin/manifest.json` adds `teamlibrary` permission for local library inspection. This changes capability to inspect, not publication/enablement authority.


## 0.5.6 lifecycle reliability

`figma_export` enters runtime as internal `__export__`. If the MCP process is a follower, only the small request is forwarded with the export-specific 315s RPC deadline. The leader dispatches `export_node`, persists returned bytes through `export-artifacts.ts`, then returns an artifact descriptor. Durable binary therefore never crosses leader→follower base64 RPC.

`shared/protocol.ts` protocol v9 separates `MAX_BINARY_FRAME_BYTES`, `MAX_BINARY_HEADER_BYTES`, and the framing-safe `MAX_BINARY_ARTIFACT_BYTES`. Plugin→leader remains one bounded binary frame in 0.5.6; chunking is not implemented.

Default artifact storage is private and ephemeral: runtime/export directories are hardened, files are created `0600`, symlink/path traversal is refused, existing names are not overwritten, and default artifacts older than 24h are cleanup candidates. An explicit absolute `CONTROLMUX_FIGMA_EXPORT_DIR` is user-managed retention. MCP returns a local `resource_link` + `structuredContent`; this does not claim remote filesystem portability.

Design lifecycle deterministic resources now include Design Translation Packet schema/validator, Design Transfer Packet schema, Transfer Ledger schema, deterministic ledger initializer, and validator. Behavioral Golden Teaching Cases are local references under `figma-components` and `figma-prototype`; their Figma execution state remains `NOT_RUN`.
