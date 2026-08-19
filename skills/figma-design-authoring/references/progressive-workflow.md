# Progressive Multi-Skill Workflow

Use this branch only when a Figma authoring job has several decision/proof boundaries, needs more than one specialist capability, or must survive a context/session boundary. A small direct edit should remain direct.

## Execution loop

```text
[Bind objective]
      |
      v
[Packetize work] --ASSIGNS_PRIMARY_OWNER--> [one active packet]
      |                                           |
      |                                           v
      |                                  [Load decision-critical depth]
      |                                           |
      |                                           v
      |                                  [Note immediately]
      |                                           |
      |                                           v
      |                                  [Execute -> observe]
      |                                           |
      |                                           v
      +<--REPLANS_ON_CONTRADICTION-- [Checkpoint + shed depth]
      |
      v
[Activate next ready packet]
```

The plan is not a screenplay. It holds stable identity, dependency/proof truth and the current frontier; observed runtime evidence may replan the affected packet without rebuilding unrelated work.

## Work packet contract

Every material packet states:

- observable outcome and non-goals;
- one primary capability owner;
- optional specialist activated only for one unresolved decision;
- real inputs/target and artifact/runtime entrypoint;
- dependencies that truly block correctness;
- expected postconditions and evidence capable of proving them;
- failure/recovery checkpoint;
- current `PENDING / ACTIVE / PASS / FAIL / BLOCKED / NOT_RUN` state.

Do not split by Figma API noun, file, code layer or Skill name when the parts have no independent outcome/recovery/proof.

## Progressive context protocol

1. Load the universal entrypoint and bind the active packet.
2. Load at most the decision-critical specialist depth for that packet. A second deep resource is justified only when the two sources discriminate the same decision.
3. Immediately record a compact note before loading more:

```text
FACT       directly observed source/runtime truth
DECISION   selected mechanism and rejected material alternative
FAILURE    exact contradiction and earliest invalidated assumption
EVIDENCE   proof target/result and its boundary
UNKNOWN    missing truth that can still change the active decision
```

4. Distill mechanisms and decisions, not a summary of prose. Keep at most the still-material checkpoint in active context.
5. Execute/observe before activating the next specialist. On contradiction, re-enter the earliest invalid packet rather than stacking another Skill or workaround.
6. Release branch detail after its decision is persisted. Re-open the exact reference only if new evidence invalidates that decision.

Never preload every potentially relevant Figma Skill. `figma-design-authoring` keeps whole-scene ownership; a domain Skill owns only the decision that earned activation.

## Specialist activation

| Active unresolved decision | Load owner | Return to authoring with |
|---|---|---|
| responsive sizing/grid/flow | `figma-layout` | relation owners, pressure rule, affected IDs |
| semantic component API/reuse | `figma-components` | job/anatomy/property/reuse decision + proof |
| variable/mode/alias architecture | `figma-tokens` | semantic roles, collections/modes, bindings |
| type roles/font geometry | `figma-typography` | role metrics, pressure result, style IDs |
| color/material/effect system | `figma-visual-system` | role distribution, material owners, style evidence |
| planes/depth/spatial scene | `figma-scene` | plane graph and owned visual cues |
| interaction path/state recovery | `figma-prototype` | state graph, reactions and path evidence |
| timing/choreography | `figma-motion` | timeline/keyframes and temporal proof |
| fixed-artifact verdict | `figma-verification` | dimension states and findings; no redesign |

## Representation compiler

Start from the reasoning shape, then use the smallest representation that makes the relation easier to perceive than prose.

| Meaning to communicate | Prefer | Keep text for |
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

On the canvas, paragraphs must earn occupied area by being the content users need to read. Prefer hierarchy, spacing, alignment, enclosure, icons, paths, progress and data marks for relationships that do not require prose. Do not replace clear text with decorative diagrams; a visualization must expose sequence, comparison, hierarchy, state, ownership or spatial structure.

## Deterministic support

For a multi-packet job, initialize from `templates/work-plan.json`, validate it, and render the current graph:

```bash
node skills/figma-design-authoring/scripts/work-plan.mjs validate path/to/plan.json
node skills/figma-design-authoring/scripts/work-plan.mjs render path/to/plan.json path/to/plan.svg
```

The SVG is an inspectable projection; JSON remains canonical. Update rolling notes after every material context load or runtime contradiction, then render again when topology/frontier changes.

## Completion

Planning structure can be `PASS` while behavioral uplift remains `NOT_RUN`. A packet completes only at its own proof boundary. The whole job is not complete while a required packet is `FAIL`, `BLOCKED`, or missing; optional dimensions remain explicitly `NOT_RUN` rather than disappearing from the plan.
