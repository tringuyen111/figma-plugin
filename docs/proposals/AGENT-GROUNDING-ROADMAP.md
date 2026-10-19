# Proposal: Grounded Figma ↔ Code Workflow

> **Status: PROPOSED / NOT IMPLEMENTED**
>
> Captured: 2026-10-19. This is an idea backlog and evaluation plan, **not** an active runtime contract, implementation decision, release promise, or proof of capability. Nothing described below is assumed to exist until implemented and independently verified.
>
> Scope: preserve the current five-tool MCP interface and existing domain Skills while evaluating targeted improvements inspired in part by [Figwright](https://github.com/awdr74100/figwright). No dependency or code adoption is approved by this note.

## 1. Problem and intended outcome

The current Figma Plugin already provides native Figma reads, guarded writes, raw Plugin API execution, durable exports, routing, a companion panel, and design-focused Skills. The next potential differentiator is **grounded translation between Figma design truth and a real codebase**, without requiring an ever-growing public tool catalog.

Desired outcomes:

1. Give an agent a compact, faithful, scope-bound representation of the selected Figma design (frames, layout, typography, styles, components, variables, modes, assets, and relevant behavior).
2. Join that design evidence to *verified* codebase components, tokens, icons, assets, and framework conventions rather than guessing names or generating parallel systems.
3. Incrementally reconcile design changes with code, preserving identity and reporting uncertainty.
4. Keep arbitrary native execution available as an escape hatch without presenting it as transactionally safe.
5. Improve installation and operator experience without rebuilding working infrastructure.
6. Measure context, latency, correctness, and recovery on identical tasks before claiming an advantage over another tool.

This is **not** a proposal to copy Figwright's tool count or replace the runtime with its implementation.

## 2. Existing baseline (do not implement again)

The current source/contract boundaries are described in [CAPABILITIES](../CAPABILITIES.md), [SOURCE-ARCHITECTURE](../SOURCE-ARCHITECTURE.md), [DESIGN-LIFECYCLE](../DESIGN-LIFECYCLE.md), [EXPORT](../EXPORT.md), and [PLUGIN-0.7.0-TYPED-CRUD](../PLUGIN-0.7.0-TYPED-CRUD.md).

| Already present | Existing surface | Important limit |
|---|---|---|
| Five public MCP tools | `figma_status`, `figma_query`, `figma_apply`, `figma_exec`, `figma_export` | Five names alone do not prove lower token consumption; schema size, payloads, retries, and Skills also count |
| Typed design evidence | `entity_graph`, `binding_inventory`, `component_integrity`, `artifact_manifest`, `prototype_graph`, `motion_snapshot`, `accessibility_design_facts` | Evidence is not automatically code-ready or proof of parity |
| Bounded changes and identity | `change_feed`, snapshots, `controlId`, sync epochs/cursors | A change journal is not yet a semantic before/after design diff |
| Guarded typed mutation | `figma_apply` dry-run/planHash, preconditions, conflict checks, readback, rollback/recovery states | Guarding applies to modeled operations, not arbitrary code |
| Native escape hatch | `figma_exec` with trace/operation metadata and post-execution sync refresh | No general-purpose dry-run, automatic preconditions, or guaranteed rollback for arbitrary JavaScript |
| Domain judgment | 16 packaged Figma Skills, including design-to-code, code-to-design, Code Connect, verification | Skills express decision rules; they do not by themselves supply deterministic codebase mapping |
| Export and distribution | `figma_export`, npm package manifest, bundled server/plugin/UI, packed-install checks | Packaging support exists; release/install UX can still improve |
| Operator panel and local bridge | Connection, agent/request status, logs, latency/health; session/instance routing | Improve selectively; do not rebuild existing features |

Do **not** equate Figma Plugin API access with entitlement to paid Figma Dev Mode or the official Dev Mode MCP server. Plugin-based work on eligible free-plan design files does not unlock paid Dev Mode features. Current Figma licensing/editor behavior must be checked with official provider evidence when relevant.

## 3. Architectural invariants

- **Retain the five public MCP tools** unless measurements justify a new tool with independent semantics and a clear evidence boundary.
- **Keep design judgment in Skills**, deterministic data operations in the runtime or standalone library, and the code repository as the authority for real code APIs.
- Prefer `figma_query` for modeled reads and `figma_apply` for modeled writes. Never automatically route an unsupported typed operation to unreviewed `figma_exec`.
- No broad canvas or repository crawl by default. Bind file, instance, page, node, revision/bundle, projection, coverage, and size budgets.
- Favor semantic identity and component/token reuse. Do not silently promote visual similarity, name equality, or raw-value equality to authoritative mapping.
- Distinguish **data collected**, **candidate interpretation**, **approved intent**, **mutation committed**, and **parity verified** as different claims.
- Stay provider-aware: editor differences and API availability are revalidated against the connected runtime/current official documentation.
- Keep Figma document data and repository data scoped to the user's intended files; treat annotations, generated snippets, and external mappings as untrusted inputs.
- This proposal must not add package dependencies, modify the active Skills registry, widen permissions, or change the current MCP contract.

## 4. Candidate architecture (conceptual only)

```text
Approved product/design intent           Existing production codebase
                |                                    |
                v                                    v
    Figma Plugin API via                        Repository inspector
    figma_query / figma_export            (agent/CLI or optional local library)
                |                                    |
                v                                    v
       Design Context Normalizer           Codebase Grounding Index
       (scope + dedupe + coverage)         (components/tokens/icons/assets)
                \                                   /
                 \                                 /
                  v                               v
                    Evidence-backed mapping/joins
                          |
                          v
                Existing design/code Skills
                 REUSE | ADAPT | CREATE
                          |
                          v
                 Implementation or HANDOFF
                          |
                          v
                 Runtime + visual/parity proof
```

This picture is a responsibility map, **not** an implemented data flow or a mandate to create another MCP tool. Repository inspection belongs with an agent's authorized source workspace or a reusable local module, **not** with the Figma plugin sandbox.

### P0-A. Context normalization and selective retrieval

Build a read-side projection on the existing Figma evidence surfaces, if measurement finds a real gap:

- Tree/scene hierarchy; frame, parent-child and ownership relationships.
- Auto Layout/Grid, constraints, sizing, spacing, responsive hints, clipping and stacking.
- Typography, fills, strokes, effects and per-property visual details **where material**.
- Component/instance identity, variants, component properties/Slots and reuse provenance.
- Variable/style definitions, aliases, collections, modes and bound consumer fields.
- Original assets and icon identities when a screenshot alone loses fidelity.
- Prototype/motion facts only when required; never infer nonexistent interaction behavior.
- Bound provenance, snapshot/revision, coverage, truncation, unsupported-editor flags and unresolved fields.

Make selection/subtree, projection, pagination, de-duplication and output budget explicit. Return references to large data rather than flooding model context. Check whether current `entity_graph` projections suffice **before** introducing an additional canonical schema. Any new projection must preserve evidence and avoid weakening mutation snapshot identity.

**Success test:** the agent receives enough information to implement a representative frame accurately without exhaustive node dumps or invented styles; omitted information is reported, not hidden.

### P0-B. Grounding Figma to the real codebase

Potential joins, using inspected project source and configurations:

| Join | Inputs | Proposed output and verification |
|---|---|---|
| Component map | Figma main component/key, properties, variants/Slots; code exports/props | Candidate code path/export, property correspondence, evidence, ambiguity and `REUSE/ADAPT/CREATE` decision |
| Token map | Figma variables/styles, modes, aliases; project theme/CSS variables/Tailwind/etc. | Semantic target token with real import/reference and mode parity; raw hex equality is only a tentative signal |
| Icon map | Figma vector/asset identity, project icon packages/local SVGs | Exact asset/package import candidate, provenance and licensing/availability checks |
| Layout/style translation | Normalized frame and style facts; actual framework and styling conventions | Reproducible relationships rather than screenshot-only pixel guesses |

Design and code remain **two distinct sources of truth**. A mapping needs explicit confidence/coverage and conflict reasons; name-only or value-only matches are *hypotheses*, not verified reuse. A manually confirmed mapping may be persisted for later runs with a stale-target detector, reviewable provenance, and a path for correction. Avoid uncontrolled fuzzy guesses becoming permanent high-authority overrides.

Reuse existing `figma-design-to-code`, `figma-code-connect`, and `figma-code-to-design` decision contracts instead of creating overlapping Skills. Do not generate source code as a claimed final result when only a HANDOFF was authorized.

**Success test:** on known fixtures, find and reuse the correct project component/token/icon, preserve relevant prop and theme semantics, and surface conflicts instead of quietly generating duplicates.

### P1-A. Semantic design diff and incremental synchronization

Explore a **design baseline -> scoped semantic diff -> affected code owners** workflow:

- Reuse exact target identities, current snapshot and existing `change_feed` where possible.
- Compare normalized before/after facts (node structure, layout, style/token bindings, component props, assets, interaction/motion when in scope).
- Express added/removed/changed identities and semantic paths, including uncertain or remapped identities.
- Tie candidate code impacts to previously **verified** design-to-code mappings; no global rewrite by default.
- Require re-baselining or a resync path on stale/incomplete journal cursors or scope changes.
- Treat change-feed event delivery, saved snapshot equality, code mutation, and rendered parity as separate proof obligations.

A journal entry alone cannot certify what changed semantically, and a design diff cannot certify that code was updated. Keep both boundaries explicit.

### P1-B. Explicit `figma_exec` escape-hatch policy

**Keep `figma_exec`.** It is necessary for newly available or not-yet-typed Plugin API operations. Improve the execution policy without falsely promising that arbitrary JavaScript can be proven safe.

Recommended agent-level routing:

1. **Read:** `figma_query` if modeled; native inspection only when the typed surface cannot provide the required fact, with bounded output and target binding.
2. **Write:** `figma_apply` first, including dry-run, `planHash`, confirmation, conflict handling and readback.
3. **Escape:** `figma_exec` only for a documented typed gap, with explicit intended targets, trace, expected postconditions and appropriate human/tool approval for consequential changes.
4. **Promote:** if an escape operation recurs or has high risk, evaluate a typed command behind the existing `figma_query`/`figma_apply` surface.

Current trace/operation metadata describes intent; it **does not** enforce read-only behavior, preflight arbitrary side effects, provide universal dry-run or guarantee rollback. Post-execution sync refresh is **not** automatically postcondition verification. An operation may partially mutate the document before throwing. A safe proposal should define recovery and independent readback for each relevant class of operation rather than infer safety from its JavaScript syntax.

### P2-A. Distribution and operator UX (improve existing work)

Do **not** recreate the current companion panel, bridge, packaging or checks. First audit their real workflows.

Candidate improvements:

- A documented, short installation path for MCP clients plus the distinct manual Figma-plugin import step.
- Repeatable npm versioning and GitHub Release assets (plugin manifest + compiled bundle), using existing package/build verification.
- Clear server/plugin `bundleRevision` compatibility and upgrade guidance; stale plugin/server must never silently claim verified writes.
- Contextual connection status, operation payload, trace, target scope, queue health, recoverable errors and diagnostics in the **existing** panel.
- Cross-platform setup checks only where supported/tested, without changing the current Node/runtime support promise casually.

A local npm install cannot by itself import a companion plugin into Figma. Keep that boundary honest.

## 5. Evaluation before implementation claims

Define a same-task comparison against the current baseline, and optionally Figwright, **before** broad adoption. An upstream tool count is not a benchmark.

Suggested cases: a static screen, a component with variants/Slots, themed tokens, a dense responsive page, an image/icon-heavy design, a changed-design incremental update, and a failure/rollback scenario. Use the same Figma files, target codebase, agent/model, task instructions, approvals and verification obligations.

| Measurement | What to record |
|---|---|
| Agent context | Advertised MCP schema tokens, Skills loaded, tool input/output tokens, total tokens per successful task |
| Operational efficiency | Calls, retry count, wall time, p50/p95 latency, bytes and truncation, target switches |
| Grounding accuracy | Correct component/token/icon matches, ambiguous candidates, unsupported properties, erroneous reuse |
| Output quality | Code integration/build evidence, semantic parity, responsive states, rendered visual comparison |
| Mutation safety | Conflict detection, unintended writes, rollback success/failure, recovery from partial state |
| Usability | Setup steps, reproducibility, visible connection/version mismatch, actionable errors |

Compare with a fixed scoring protocol and keep statuses `PASS`, `FAIL`, `NOT_RUN`, `INCONCLUSIVE`, `MISSING`, `BLOCKED` according to existing verification rules. Live claims require the exact target, loaded `bundleRevision`, evidence and representative task execution. A five-tool interface **may** save advertised schema tokens, but can still lose time/tokens to larger payloads or repeated generic calls; do not declare victory without measurements.

## 6. Priority backlog (ideas, not tickets)

| Priority | Candidate | Dependency / decision gate |
|---|---|---|
| P0 | Context coverage and token-cost baseline | Inspect current query projection and measure real tasks first |
| P0 | Selective design-context normalization | Implement only missing representational fidelity |
| P0 | Codebase grounding joins (component, token, icon) | Repository evidence, deterministic matching, ambiguous-case review |
| P1 | Semantic design diff / affected-code mapping | Stable identity and baseline coverage proven |
| P1 | `figma_exec` policy and recurring-operation promotion | Documented typed gaps and mutation-risk cases |
| P2 | Release/install/version-skew/operator UX polish | Audit existing UI, package and release flows first |
| Cross-cutting | Equal-task benchmark and failure evaluation | Must precede any reliability, quality, or token-saving superiority claim |

## 7. Explicit non-goals and open decisions

**Not authorized by this document:**

- Source code, manifests, dependencies, published packages, plugin installs, permissions, existing Skills, or MCP interface changes.
- New Figma file mutations, external releases, or CI workflow changes.
- Claims of paid Figma Dev Mode entitlement, universal arbitrary-JS rollback, full accessibility verification or benchmark superiority.
- Transplanting Figwright code, licensing assumptions, or rebuilding its 121-tool registry.

**Questions for a future design review:**

1. Which baseline tasks currently fail because `entity_graph` lacks fidelity, versus because the Skill did not consume available facts?
2. Should codebase mapping be agent/CLI-only, a separate local library, or an optional server-side adapter? How will permissions and repo root identity be bound?
3. What compact evidence schema joins Figma and code identities without introducing a second mutable source of truth?
4. Which mappings deserve persistence, who confirms them, and how is staleness detected?
5. What `figma_exec` cases actually need new typed operations, approval gates, or better rollback evidence?
6. Which distribution changes remove real friction not already solved by the existing panel/package?
7. What benchmark thresholds justify increasing runtime complexity?

## 8. References and status discipline

- Local active contracts: [CAPABILITIES](../CAPABILITIES.md), [SOURCE-ARCHITECTURE](../SOURCE-ARCHITECTURE.md), [DESIGN-LIFECYCLE](../DESIGN-LIFECYCLE.md), [FIGMA-API-CAPABILITY-MATRIX](../FIGMA-API-CAPABILITY-MATRIX.md), [PLUGIN-0.7.0-TYPED-CRUD](../PLUGIN-0.7.0-TYPED-CRUD.md).
- Existing relevant Skills: [figma-design-to-code](../../skills/figma-design-to-code/SKILL.md), [figma-code-connect](../../skills/figma-code-connect/SKILL.md), [figma-design-authoring](../../skills/figma-design-authoring/SKILL.md), [figma-verification](../../skills/figma-verification/SKILL.md).
- External inspiration (compare, do not copy blindly): [Figwright](https://github.com/awdr74100/figwright), [figma-codegen](https://github.com/awdr74100/figwright/blob/main/skills/figma-codegen/SKILL.md), [figma-build](https://github.com/awdr74100/figwright/blob/main/skills/figma-build/SKILL.md).
- Provider authority: [Figma Plugin API](https://developers.figma.com/docs/plugins/api/figma/) and [Figma MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/); revalidate against current provider/runtime before an implementation decision.

**Proposal status remains NOT IMPLEMENTED.** Future work should update active contracts only after an implementation and suitable source/runtime/live-evidence checks demonstrate the new behavior.
