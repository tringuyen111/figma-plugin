# Progressive Authoring Workflow

Use this branch only when a Figma authoring job has several independent decision/proof boundaries or must survive a context/session boundary. A small direct edit should remain direct.

## Working vocabulary

- **ACTIVE DECISION** — the one unresolved question whose answer can change the next action.
- **DECISION-CHANGING DEPTH** — only the knowledge/evidence capable of changing the Active Decision; relevance, not a numeric resource count, controls loading.
- **CHECKPOINT** — the smallest durable record of fact, decision, failure, evidence, and unresolved truth needed to continue without re-reading everything.
- **FRONTIER** — the next work packet whose dependencies are satisfied and whose result can advance the terminal truth.
- **RE-ENTRY** — the earliest decision or assumption invalidated by new evidence; correction resumes there instead of stacking a workaround.

Use these terms consistently. They are control handles for the workflow, not decorative labels.

## Execution loop

```text
[Bind objective]
      |
      v
[Packetize observable work] ---> [one ACTIVE packet]
      |                                  |
      |                                  v
      |                         [Name ACTIVE DECISION]
      |                                  |
      |                                  v
      |                     [Load DECISION-CHANGING DEPTH]
      |                                  |
      |                                  v
      |                         [Note immediately]
      |                                  |
      |                                  v
      |                         [Execute -> observe]
      |                                  |
      +<--- RE-ENTRY on contradiction -- [Checkpoint + shed depth]
      |
      v
[Advance FRONTIER]
```

The plan is not a screenplay. It holds stable work identity, dependency/proof truth, evidence, recovery, and the current Frontier. Observed runtime evidence may replan the affected packet without rebuilding unrelated work.

## Work packet contract

Every material packet states:

- observable outcome and non-goals;
- the Active Decision, when a decision is still unresolved;
- real inputs/target and artifact/runtime entrypoint;
- dependencies that truly block correctness;
- expected postconditions and evidence capable of proving them;
- failure/recovery checkpoint;
- current `PENDING / ACTIVE / PASS / FAIL / BLOCKED / NOT_RUN` state.

Do not split by Figma API noun, file, code layer, or installed capability name when the parts have no independent outcome/recovery/proof.

## Progressive context protocol

1. Bind the Active Decision before loading more context.
2. Load only Decision-Changing Depth. Do not use a fixed number of references or Skills as a proxy for relevance.
3. Immediately record a compact checkpoint before loading additional depth:

```text
FACT       directly observed source/runtime truth
DECISION   selected mechanism and rejected material alternative
FAILURE    exact contradiction and earliest invalidated assumption
EVIDENCE   proof target/result and its boundary
UNKNOWN    missing truth that can still change the Active Decision
```

4. Distill mechanisms and decisions, not summaries of prose. Keep only the still-material checkpoint in active context.
5. Execute/observe when evidence is sufficient. On contradiction, use Re-entry instead of accumulating another layer of context or workaround.
6. Release branch detail after its decision is persisted. Re-open the exact reference only when new evidence invalidates that decision.

Skill discovery remains Agent-owned. This workflow may expose an unresolved concern, but it must not prescribe which sibling Skill must be activated to resolve it.

## Decision-depth examples

These examples identify **what depth is decision-material**, not which Skill must be selected.

| Active unresolved decision | Decision-changing depth | Return to the workflow with |
|---|---|---|
| responsive sizing / grid / flow | governing relation, owner geometry, sizing behavior, pressure cases | relation, invariant, affected IDs, pressure result |
| reusable component contract | semantic job, invariant anatomy, controlled variation, representative consumers | anatomy/API decision, affected identities, propagation proof |
| variable / mode / alias architecture | semantic role graph, collection/mode relationships, consumer bindings | role/binding decision, affected variable/consumer identities |
| text hierarchy / font geometry | role metrics, wrapping/reflow, localization and numeric pressure | role/style decision and pressure consequence |
| color / material / effect system | semantic roles plus perceptual distribution at occupied area/repetition | role distribution, material relation, visual evidence |
| planes / depth / spatial scene | clipping, persistence, overlay, occlusion, anchoring and input priority | plane graph and owned cues |
| interaction path / recovery | state family, triggers, conditions, navigation/overlay and recovery | state graph, reactions, path evidence |
| timing / choreography | temporal states, keyframes, timing/easing and reduced-motion consequence | timeline and temporal proof |
| fixed-artifact verdict | explicit claims, evidence dimensions and bounded acceptance criteria | dimension states/findings without silently redesigning |

## Representation choice

Choose the smallest representation that makes the **current relation** easier to perceive than prose. The Agent owns this judgment; deterministic work-plan code does not select a representation.

| Meaning to communicate | Usually useful | Keep text for |
|---|---|---|
| ordered work, handoff, recovery | flow or timeline | short step labels and exceptions |
| branch/choice | decision tree/table | conditions and consequences |
| lifecycle/state | state diagram | guards and state meaning |
| hierarchy/ownership | tree or typed graph | edge labels and role names |
| quantitative comparison/progress | bar, plot or compact metric card | units, values, caveats |
| repeated system contract | component specimen in consumers | semantic job, property/state labels |
| screen hierarchy/layout | wireframe/rendered composition | real content and action labels |
| exact multi-field mapping | table | exact values and bounded notes |
| one local fact or short rationale | concise text | the fact itself |

A representation earns its cost only when it exposes sequence, comparison, hierarchy, state, ownership, or spatial structure that prose would otherwise hide.

## Deterministic support

For a multi-packet job, initialize from `../templates/work-plan.json`, validate it, and render the current graph:

```bash
node skills/figma-design-authoring/scripts/work-plan.mjs validate path/to/plan.json
node skills/figma-design-authoring/scripts/work-plan.mjs render path/to/plan.json path/to/plan.svg
```

The JSON plan owns only durable work state: objective, obligations when used, dependencies, Frontier, evidence, failure/recovery, and completion state. The validator must not select Skills, cap context depth, or choose a visual representation. The SVG is an inspectable projection; JSON remains canonical.

## Completion

Planning structure can be `PASS` while behavioral uplift remains `NOT_RUN`. A packet completes only at its own proof boundary. The whole job is not complete while a required packet is `FAIL`, `BLOCKED`, or missing; optional dimensions remain explicitly `NOT_RUN` rather than disappearing from the plan.
