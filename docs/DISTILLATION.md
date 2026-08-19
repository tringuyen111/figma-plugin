# Skill distillation map — Figma Plugin 0.5.6

Tài liệu này trả lời **mỗi Skill được chưng cất từ đâu, sở hữu quyết định gì và cố ý không copy gì**. Execution bình thường chỉ load provenance của Skill đang active.

## Source hierarchy

1. **Product/Design truth** — meaning, composition, reuse responsibility, interaction/state intent và proof need.
2. **System Plane invariants / SDLC capability engineering** — owner, boundary, source-of-truth, side effect, propagation, evidence, completion.
3. **Official/current Figma provider** — product/API/MCP facts.
4. **Installed Figma plugin Skills** — operational know-how và provider-specific gotchas/workflows.
5. **Public Agent Skills** — comparison/counterexample evidence; không phải authority.

Không bind được một standalone “System Plane” artifact riêng trong package; baseline đó được trace về SDLC capability-engineering + invariants canonical của ControlMux Figma.

## Matrix

| Skill | Internal method distilled | Official / installed Figma evidence | Public comparison | Verdict 0.5.6 |
|---|---|---|---|---|
| `figma-native` | provider/interface separation; exact target/postcondition evidence | Plugin API typings/runtime, `use_figma` guidance | provider/native Figma Skills | KEEP — all-editor runtime substrate |
| `figma-scene` | 2.5D plane/input, silhouette/surface ownership | Figma structure + native nodes | component/deep inspection patterns | KEEP + CRAFT — plane/silhouette worked cases |
| `figma-layout` | construction responsibility + constraint-space adaptation | Auto Layout/Grid/sizing guidance | Figma/Warp screen authoring | KEEP + CRAFT — pressure/recomposition worked cases |
| `figma-tokens` | semantic role -> token -> mode/value; propagation | Variables/modes/alias/scope/code syntax | token inventory/import/export Skills | KEEP — system role over equal-value dedup |
| `figma-typography` | typography-as-geometry + text-slot pressure | Text Styles, Variables, font-loading mechanics | design-system generation patterns | KEEP + CRAFT — type-mass/pressure worked cases |
| `figma-visual-system` | contextual color + material/depth/shape | paints/effects/styles/current visual surfaces | lint/a11y as proof-adjacent evidence | KEEP + CRAFT — perceptual distribution worked cases |
| `figma-components` | semantic job -> anatomy -> controlled variation | five property types incl. Slot; design-system builder | component analysis/lint Skills | KEEP — freedom/guardrail selection |
| `figma-prototype` | state machine -> trigger/condition/action -> destination/recovery | reactions/actions, prototype variables, native execution | reaction/state inspection patterns | **NEW/SPLIT** — independent interaction mechanism |
| `figma-motion` | transition choreography -> keyframes/timing/easing/cohort -> temporal proof | Motion context, installed `figma-use-motion`, Timing/Easing variables | motion implementation patterns | **REVISED** — no longer owns Prototype logic |
| `figma-design-system` | system invariants/source/propagation | library/design-system search + `figma-generate-library` | design-system inventory Skills | KEEP — cross-capability reconciliation owner |
| `figma-design-authoring` | six design graphs -> Figma representation | `figma-generate-design`, agent-friendly file structure | Warp/Figma screen authoring | KEEP + CRAFT — end-to-end Product Design teaching case |
| `figma-verification` | fixed target + expected truth -> evidence vector -> bounded verdict | metadata/context/screenshot/system/motion/Code Connect proof surfaces | lint/a11y/audit Skills | **NEW** — read-only assessment outcome |
| `figma-code-connect` | deterministic component/code translation artifact | current structured Code Connect + template guidance | Code Connect agent Skills | KEEP — mapping semantics/migration/proof |
| `figma-code-to-design` | complementary code/design representations | generate-design/library + Code Connect evidence | code-to-Figma authoring patterns | KEEP — semantic reconstruction, not DOM tracing |
| `figma-design-to-design` | cross-file identity/update-path strategy: reuse/wrap/fork/migrate/sync | published keys, team-library/import mechanics, provider library/asset transfer | library/component migration patterns | **NEW** — independent Design→Design lifecycle owner |
| `figma-design-to-code` | design context -> repo mapping -> implementation proof | `get_design_context`, installed design-to-code + motion implementation guidance | implement-design Skills | KEEP — repo truth + runtime/visual proof |

## 0.5.2 migration conclusions

### Prototype split

0.5.1 `figma-motion` owned both Prototype and Motion. Audit showed independent jobs:

```text
Prototype: trigger/action/condition/navigation/overlay/state path
Motion: keyframe/timing/easing/timeline choreography
```

User approved split; 0.5.2 removes Prototype logic from `figma-motion` and adds `figma-prototype`. Cross-references/evals/docs are migrated by meaning; no hidden combined owner remains.

### Verification promotion

Structural/visual/system/accessibility/parity checks previously lived only as completion logic inside authoring Skills. A fixed-artifact review has different authority (read-only), mechanism and output. 0.5.2 adds `figma-verification`; authoring Skills keep local self-proof for their own changes, while standalone audit/acceptance routes to Verification.

### Motion-to-code remains a branch, not a Skill

Installed Figma `figma-implement-motion` demonstrates substantial Figma-specific production mechanics. 0.5.3 distills that complexity into `figma-design-to-code/references/motion-translation.md`: static design context and Motion context are reconciled by node identity, timing/easing/transform-origin evidence is preserved, static-vs-animated transform ownership is explicit, repeated motion implementation is factored, reduced-motion meaning is preserved, and temporal runtime proof is required when claimed.

This remains `REFERENCE_BRANCH_MATERIALIZED_NOT_RUN`; no separate Skill exists until representative executions prove an independent job rather than a provider-shaped split.

## 0.5.3 capability/value deepening

0.5.3 deliberately **does not slim Skills for token economy**. All 16 canonical Skills now expose a local `Decision advantage` and `Skill I/O contract`. Methodology may grow when it adds a non-obvious decision mechanism, trade-off, failure discrimination, correction/re-entry or falsifiable proof.

I/O optimization is pushed to the task boundary:

- request the smallest evidence that can decide the current question;
- escalate only when a material ambiguity/proof obligation remains;
- return a compact decision/evidence packet instead of echoing provider context;
- prefer structured provider evidence when it expresses the needed semantics;
- use bounded native projections when generic Plugin API inspection would otherwise return noisy trees.

New bounded inspection references cover component API projections, token bindings/consumers, prototype reactions, design-system inventory and verification evidence. They collect evidence; they do not replace the Skill's judgment.

`evals/skill-value.json` freezes a four-arm comparison (`BASE_SAME_TOOLS`, `OFFICIAL_FIGMA_SAME_TOOLS`, `CONTROLMUX_SAME_TOOLS`, `CONTROLMUX_HYBRID`) and lexicographic quality order. Behavioral uplift remains `NOT_RUN` until representative executions occur.

## 0.5.4 craft-depth / exemplar deepening

0.5.4 keeps the 15-Skill topology and adds **positive craft transfer** rather than another guardrail layer. Five craft-core Skills now have local `golden-teaching-cases.md` references grounded in approved ControlMux companion product truth plus rendered teaching specimens.

The cases deliberately include strong worked paths and explicit anti-copy/counterexample boundaries so the agent learns a decision relation rather than a visual template. The distillation target is:

```text
what mediocre execution misses
-> what an expert notices
-> which variables change the decision
-> which plausible alternative is rejected and why
-> exact Figma construction
-> rendered causal critique/re-entry
-> when not to reuse the pattern
```

Project-level visual self-review is tracked separately from behavioral qualification in `evals/craft-exemplars.json`. No claim of independent design quality or Skill superiority is made from author self-review alone.

## Evidence architecture

Each Skill registry entry now declares deep `editors` and evidence policy. Frozen behavioral cases declare `evidenceRequired` using:

```text
runtime | structure | system-reuse | visual
interaction | temporal | accessibility | translation-parity
```

`figma-verification` is claim-scoped: it never turns unrequested/uninspected dimensions into PASS.

## Provider evidence architecture

Current connected provider schema is stronger evidence than a remembered docs list for the active session. Package snapshot remains deliberately non-authoritative and requires live revalidation.

Observed high-value surfaces on 2026-08-19 include:

- general native executor (`use_figma`);
- design context / metadata / screenshot;
- variable definitions / libraries / design-system search;
- motion context / video export;
- web capture;
- structured Code Connect context/list/suggestion/read/write operations.

This does **not** create matching ControlMux Skills or MCP tools automatically.

## Current official anchors

- https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- https://developers.figma.com/docs/figma-mcp-server/create-skills/
- https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/
- https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/
- https://developers.figma.com/docs/plugins/api/Reaction/
- https://help.figma.com/hc/en-us/articles/14506587589399-Use-variables-in-prototypes
- https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
- https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties
- https://developers.figma.com/docs/code-connect/templates-migration-guide/

## Public comparison anchors

- https://github.com/openai/plugins/tree/main/plugins/figma/skills
- https://github.com/southleft/skills-for-figma
- https://github.com/southleft/figma-console-mcp-skills
- https://github.com/warpdotdev/figma-skills

Public repositories are comparison evidence only.

## Frozen behavioral eval surface

`evals/skill-boundaries.json` có positive/near-miss/completion/evidence cases cho đủ **16 Skill**. `evals/skill-value.json` bổ sung decision-delta, minimum input, escalation, output packet và I/O focus cho từng owner. Cả hai vẫn `FROZEN_NOT_RUN`: topology approval + validator PASS không được nâng thành behavioral uplift. `figma-motion-to-code` đã materialize dưới dạng conditional reference branch, chưa là Skill.


## 0.5.5 lifecycle distillation

0.5.5 promotes `figma-design-to-design` because cross-file/library reuse has its own trigger, strategy set, authority, migration proof and future-update semantics. It does **not** create a Skill for export: `figma_export` is deterministic typed egress. `figma-design-to-code` now separates actual repository implementation from an explicit handoff packet. Components/Prototype/Motion gain an explicit composition contract so reusable state vocabulary, reaction wiring and temporal choreography remain separate but interoperable.


## 0.5.6 reliability / behavioral distillation

0.5.6 giữ topology 16-Skill và deepens execution instead of proliferating capabilities. `figma_export` moves durable artifact ownership to the leader, so follower RPC carries metadata instead of base64 artifact bytes; protocol v9 also reserves binary-frame overhead and propagates an export-specific deadline. Artifact persistence is private-by-default with 24h ephemeral cleanup unless the user selects an absolute managed export directory.

`figma-design-to-design` gains a deterministic Transfer Ledger + packet schema for source/target binding and idempotent resume. `figma-design-to-code` gains a HANDOFF packet schema. `figma-components` and `figma-prototype` gain detailed Golden Teaching Cases; their behavioral Figma execution remains `NOT_RUN`.
