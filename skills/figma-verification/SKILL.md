---
name: figma-verification
description: "Audit or verify a fixed Figma artifact against explicit design, system, accessibility, interaction, motion, or design-code obligations. Use when the terminal result is an evidence-backed verdict or findings report. Stay read-only unless repair is separately authorized; do not redesign, author, or infer unproved PASS."
---

# Figma Verification

Own **assessment**, not redesign. A valid verdict states exactly what was inspected, against which expected truth, on which artifact revision, with which evidence.

## Terminal job

Evaluate a fixed Figma target against bounded obligations and return dimension-scoped findings/verdicts. Complete when every requested dimension has evidence state, observed facts, expectation/source, and unresolved limitations; do not mutate the artifact as part of verification unless the user explicitly changes the job to repair.

Read `references/verification-method.md` for evidence selection and verdict mechanics. Read `references/provenance.md` only for audit/provider-conflict work.

When the input is a checklist or audit profile rather than an executed report, read `references/strict-audit-execution.md`. A profile declares obligations and probes only; it cannot contain verdicts. An `AuditReport` must bind the exact target, bundle, snapshot fingerprint, expected truth and evidence refs before any claim can become `PASS`.

## Decision advantage

This Skill earns its place by preventing **false PASS**. It binds the exact artifact and expected truth, chooses evidence capable of proving each requested claim, keeps dimensions independent, and never redesigns during acceptance. The result is a bounded verdict, not a style critique or a repair session.

## Skill I/O contract

**Minimum input**
- exact fixed target/revision and expected obligations/source;
- the requested verification dimensions;
- one proof source per claim that is actually capable of proving it.

**Escalate input only when** a claim remains inconclusive or generalizes beyond the sampled state/consumer. Do not collect every evidence type by default; structure cannot prove visual craft and a screenshot cannot prove reusable bindings or hidden interaction paths.

**Return** dimension states plus finding packets and overall bounded verdict. Keep raw evidence references/IDs sufficient for reproduction, but summarize rather than echoing full node/context dumps. See `references/evidence-recipes.md` for evidence selection and sampling patterns.

## Bind expected truth first

Before inspecting, identify what the artifact is supposed to satisfy:

- approved Product/Design truth;
- design-system/component/token contract;
- explicit accessibility obligation;
- approved Figma reference/baseline;
- production implementation or Code Connect mapping for parity claims;
- interaction/motion specification when temporal behavior is in scope.

A general preference such as “looks cleaner” is not an acceptance criterion. If expected truth is absent, return diagnostic findings without upgrading them into acceptance failure.

## Evidence vector

Use only dimensions material to the claim:

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

Each dimension independently ends in:

```text
PASS | FAIL | NOT_RUN | INCONCLUSIVE | MISSING | BLOCKED
```

Never collapse uninspected dimensions into one overall PASS. Overall readiness can only summarize the dimensions the request actually requires.

## Evidence selection

- **runtime:** connected target, executable operation/runtime behavior when the claim needs it;
- **structure:** node hierarchy, bounds, clipping, layout ownership, component/property/state structure;
- **system-reuse:** variables/styles/components/libraries/naming/source-of-truth and propagation;
- **visual:** rendered screenshot/export at sufficient resolution and representative content/state;
- **interaction:** reaction/action/state-path readback and representative path inspection;
- **temporal:** motion context/keyframes/timing plus rendered phases/video when timing/order is material;
- **accessibility:** only obligations that can be evidenced from the design/runtime available; do not infer full product accessibility from static Figma checks;
- **translation-parity:** verified design/code identity, mappings, target repository/runtime and visual/system correspondence.

Use the provider's structured evidence surface when it is stronger than re-deriving the same fact through general execution. Provider acknowledgement alone is not a postcondition when the resulting artifact can be inspected.

## Verification loop

1. Bind exact target ID/file/page/revision and expected truth.
2. Select required evidence dimensions; mark non-required dimensions out of scope rather than PASS.
3. Inspect structural/system evidence before using screenshots to explain failures that may be structural.
4. Render/execute only where visible/interactive/temporal/runtime claims require it.
5. Record each finding as `observed -> expected -> evidence -> consequence`.
6. Assign per-dimension state.
7. Return smallest actionable verdict and route repair to the owning authoring capability if requested.

## Artifact-class gate

Keep these terminal jobs separate:

- `AuditProfile` / checklist: obligations, applicability, expected source and minimum proof; status is `PLANNED` or `NOT_RUN`.
- `AuditReport`: read-only facts, findings and canonical dimension verdicts.
- `UpgradeRun`: mutation plan, changed entities, rollback and post-change verification.

Never copy a baseline `PASS` from a profile into a report without evidence. `PARTIAL` is not a verdict; split the claim into independently evidenced claims. `READY_FOR_PUBLISH` is lifecycle state, not acceptance state. Provider limitations need an exact operation, observed error/provider state, capability scope and unlock condition.

## Finding severity

Use severity for consequence, not visual annoyance:

- **blocker:** requested acceptance cannot be valid (wrong target, missing required state/path, broken mapping, inaccessible required action, etc.);
- **major:** material semantic/system/visual/interaction obligation fails;
- **minor:** localized defect with bounded consequence;
- **note:** evidence/context useful for follow-up but not a failure.

Do not turn every hardcoded value or pixel difference into a failure without an applicable system/parity obligation.

## Accessibility boundary

Figma can provide evidence for color contrast, visible focus treatment, target geometry, text scaling/layout pressure, color-only state cues, and prototype paths when those facts are inspectable. It generally cannot prove the complete semantics, screen-reader behavior, runtime keyboard model, DOM/accessibility tree, platform APIs, or real assistive-technology behavior of production code from a static design alone.

Report unsupported runtime obligations as `NOT_RUN`, `MISSING`, or `BLOCKED`; do not issue a blanket “accessible” verdict from design-only evidence.

## No redesign inside acceptance

Verification may identify the failing owner and a bounded correction direction, but it must not silently redesign the artifact. If the user asks to fix findings, route by cause:

- scene/depth -> `figma-scene`;
- layout -> `figma-layout`;
- tokens/type/visual/components -> corresponding system Skill;
- interaction -> `figma-prototype`;
- Motion -> `figma-motion`;
- whole composition -> `figma-design-authoring`;
- design/code mapping -> translation Skills.

After repair, verification may be run again against the changed exact bytes/artifact.

## Output contract

Return:

```text
Target / expected truth
Dimensions requested
Findings (observed -> expected -> evidence -> consequence)
Dimension states
Overall bounded verdict
NOT_RUN / blockers / proof gaps
```

A clean screenshot is not a system PASS. A valid component tree is not a visual PASS. A successful tool call is not a runtime/product PASS.

## Boundaries

- Domain authoring Skills own creation/repair decisions.
- `figma-native` owns raw targeting/execution mechanics.
- This Skill can compose provider read/proof surfaces, but provider tool names do not define its capability boundary.
- Production-code accessibility/runtime acceptance remains with the appropriate engineering/QA owner when Figma evidence cannot prove it.
