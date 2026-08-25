---
name: figma-design-authoring
description: "Compose approved product and behavior truth into coherent Figma screens, flows, states, and system-aware views. Use for product UI design, redesign, creation, or updates where structure, layout, components, type, color/depth, responsiveness, and motion must cohere. Do not invent unresolved behavior or production code."
---

# Figma Design Authoring

Own the bridge from **approved Product Design truth** to a coherent Figma artifact. Do not start from Figma objects; start from what the user must find, understand, compare, decide, and do.

## Terminal job

Produce or repair the bounded Figma design so semantic, layout, component, style/type, plane/input, and state/time relations agree. Complete when visible composition and reusable/native structure are both checked at the fidelity required by the design question.

## Decision advantage

This Skill earns its place by compiling **approved Product Design truth into one coherent Figma scene across simultaneous graphs**. It prevents API-first drawing and local-polish drift: every visible choice must agree with semantic, layout, component, style/type, plane/input, and state/time relations, then re-enter the whole composition after local decisions.

## Working vocabulary

Use these terms literally inside this workflow; do not rotate synonyms when the distinction changes the decision.

- **ACTIVE DECISION** — the smallest unresolved design decision that can change the next action. If two independent decisions can change different actions, separate them instead of pretending one packet owns both.
- **DESIGN RESPONSIBILITY** — the semantic or structural obligation a region/relation must enforce. Choose the responsibility before choosing the Figma object that expresses it.
- **DECISION-CHANGING DEPTH** — additional context or methodology capable of changing the Active Decision, its proof requirement, or its correction. Background that cannot change the decision does not earn context.
- **FIDELITY** — the minimum representation detail needed to answer the Active Decision and falsify the current decision. Escalate only when the lower level cannot carry the required proof.
- **ATTENTION BUDGET** — the limited visual salience available to express task priority. If every region asks for equal attention, hierarchy has failed even when the layout is technically valid.
- **PRESSURE** — a valid content, geometry, state, mode, input, or consumer variation capable of exposing a broken invariant.
- **RECOMPOSITION** — changing the causal relation/structure when local adaptation cannot preserve the intended invariant. It is not a synonym for polishing or resizing.
- **WHOLE-SCENE CHECK** — re-evaluating the simultaneous semantic/layout/component/style/plane/state graphs after a local decision. A locally correct edit that creates a cross-graph contradiction is not complete.

## Skill I/O contract

**Minimum input**
- approved/current product behavior and bounded design question;
- real or representative content/states/constraint pressure;
- only the current Figma/system/code evidence needed for that question.

**Escalate input by fidelity**, not by curiosity: topology -> structural frame -> system specimen -> rendered composition -> interaction/motion proof only when the Active Decision requires it. Reuse design-system search/context before broad local inspection when provider evidence is stronger.

**Return** the design decision/changes, Design Responsibilities/representations chosen, affected IDs, unresolved Product truth, and the minimum proof that supports the claimed Fidelity. A concise result is preferred, but never omit a material design rationale or failed evidence dimension merely to save output.

WHEN choosing proof for authored structure, system reuse, layout, visuals, content, interaction, or motion, READ `references/authoring-proof.md` because each claimed fidelity dimension requires its own matching evidence.

## Progressive authoring workflow

When the job has several independent decision/proof boundaries or must survive a context/session boundary, **READ** `references/progressive-workflow.md` because it defines the work-packet graph, **ACTIVE DECISION**, **DECISION-CHANGING DEPTH**, rolling **CHECKPOINT**, **RE-ENTRY**, and **FRONTIER** semantics. Use `templates/work-plan.json` plus `scripts/work-plan.mjs` only when durable state materially reduces omission or context loss. WHEN another tool generates or consumes the plan, READ `schemas/work-plan.schema.json` because it is the canonical machine contract for that durable state.

Keep one active packet. Load only context capable of changing its Active Decision, note the mechanism/fact/failure/evidence immediately, execute or inspect when evidence is sufficient, then shed branch detail that no longer changes the Frontier. A small direct edit remains direct and does not earn planning ceremony. Skill discovery and selection remain Agent-owned; this workflow may expose an unresolved concern but does not prescribe which sibling Skill must be activated.

Choose representation from the relation that must become easier to perceive: flow/tree/state/graph/table/chart/specimen/wireframe/render only when that representation exposes structure prose would hide. Deterministic work-plan code validates state/evidence and renders an already-formed graph; it does not choose the representation for the Agent.

## Distillation and provider authority

Read `references/provenance.md` for audit/provider-conflict work. Resolve the destination and only the context needed for the Active Decision; then inspect Code Connect/existing screens/libraries before authoring. This reuse-first sequence is supported by both Figma’s published screen-authoring workflow and independent public Agent Skills.

For web/code sources, generated/captured canvas output may be used as **visual evidence**, while native Variables/Styles/Components/Auto Layout remain the reusable design representation. Never promote a pixel-accurate capture into design-system truth by appearance alone.

## System-plane scene model

Hold these graphs simultaneously:

```text
SEMANTIC        page -> region -> content -> action/state
LAYOUT          layout owner -> flow/grid -> sizing -> spacing -> adaptation
COMPONENT       job -> anatomy -> slot -> property/state -> instance
STYLE / TYPE    semantic role -> token/style -> mode -> consumer
PLANE / INPUT   clip / persist / overlay / anchor / occlude / input priority
STATE / TIME    state family -> transition -> prototype path / motion choreography
```

Never use one graph as a proxy for the others.

## Bind truth before authoring

Establish:

- approved/current product behavior and task boundary;
- real content/data pressure and material states;
- usable viewport geometry and input capabilities;
- current Figma file/design-system/library truth;
- relevant code/system truth when the design must align to production;
- current visual/brand authority.

If product behavior is unresolved, expose the gap instead of using Figma to silently decide it.

## Active decision and fidelity

Choose the minimum representation that can answer the Active Decision:

| Question | Minimum faithful representation |
|---|---|
| journey / IA / grouping | topology/flow |
| task progression / recovery | typed interaction flow |
| hierarchy / grouping / density | low-fi frame + structural graph |
| color/type/material/craft | rendered visual composition |
| repeated system contract | system/component specimen in real consumers |
| micro-control/state anatomy | control/state specimen in context |
| interaction path/recovery | prototype state-path evidence |
| timing/choreography | Figma Motion evidence |

Do not force every task through every fidelity stage.

## Whole-scene composition loop

1. **Meaning**: establish reading/action priority.
2. **Responsibility**: assign each structural, layout, component, style/type, and plane Design Responsibility to the relation/object that must enforce it.
3. **Relations**: choose alignment/grid, spacing, slots, token/style roles, and plane relations.
4. **Visual distribution**: allocate type mass, contrast, hue/chroma, negative space, shape, depth, imagery, and motion according to the Attention Budget.
5. **Adaptation**: preserve semantic/system invariants while geometry/disclosure/presentation responds to Pressure; Recompose only when adaptation cannot preserve them.
6. **Native compile**: choose the Figma objects that truthfully express each responsibility.
7. **Whole-scene check**: render/inspect part -> whole -> representative state/mode/consumer, then re-evaluate the simultaneous graphs for contradiction.
8. **Recomposition**: fix the smallest causal relation, not the nearest visible symptom.

## Craft quality ladder

Do not equate a validator-clean or technically correct artifact with a finished design. For visible Product UI, calibrate the requested result on this ladder:

```text
VALID       relationships and native structure are not broken
COHERENT    hierarchy, grouping, type, color, plane, and interaction tell the same story
CRAFTED     rhythm, density, optical alignment, visual mass, negative space, silhouette, and state treatment are deliberately refined
PRODUCT-FIT the composition expresses the actual task frequency, information pressure, audience, and product character rather than a generic UI pattern
```

If the user asks for polished/high-quality/production-grade design, do not stop at `VALID`. Reach at least `CRAFTED`, and `PRODUCT-FIT` when product character is part of the brief, unless missing truth or render evidence forces a truthful `PARTIAL`.

When several plausible compositions remain or the artifact is merely clean rather than strong, **READ** `references/golden-teaching-cases.md` because the worked cases show evidence -> alternatives -> decision -> exact Figma construction -> render critique -> correction -> anti-copy transfer. Treat the cases as reasoning demonstrations, never as layout/style templates.

## Compile design responsibility to Figma

Examples:

```text
owns bounds/layout/clipping          -> Frame / Auto Layout
perceptual transform grouping only  -> Group
canvas organization                 -> Section
shared comparison field             -> Grid Auto Layout / guides as appropriate
reusable semantic job               -> Component / Component Set
controlled variation                -> property / variant / slot / instance swap
reusable semantic value             -> Variable / mode / alias
reusable composite visual recipe    -> Text/Paint/Effect Style
transient plane                     -> owned frame + overlay/prototype relation
state continuity                    -> explicit states + Prototype for interaction path; Motion for choreography when earned
```

Keep deep domain decisions explicit instead of embedding tool-specific folklore in the whole-scene workflow. If another decision mechanism becomes material, name the unresolved concern and required return; normal Agent capability discovery remains responsible for any additional Skill selection.

## Reuse before invention

Before drawing primitives from scratch:

1. inspect current screen and local design-system assets;
2. inspect local/shared components, variables, and styles accessible to the file;
3. compare semantic contract/API/system authority, not just appearance;
4. reuse or extend compatible assets;
5. create new roles/components only where current system cannot express the meaning truthfully.

Keep naming semantic and machine-readable so future agents can navigate the scene.

## Product-design depth

### 2.5D and material
Model plane relations separately from semantic nesting. Use surface tone, border, clipping, overlap, shadow, scrim, blur, scale, and motion only when they express real depth/focus/persistence relations.

### Color
Solve semantic role and perceptual composition separately. Inspect hue/temperature/lightness/chroma at real occupied area/repetition; do not certify composition from token correctness alone.

### Typography
Treat text roles and font metrics as geometry. Test real strings, localization, numeric scanning, wrap/reflow, and whole-page type mass.

### Components
Reuse repeated semantic jobs with invariant anatomy and controlled variation. Similar boxes are not automatically one component.

### Responsive
Adapt to constraint space, not device labels: width, height, usable viewport, content pressure, input mode, and state can change independently.

### Interaction and Motion
Keep interaction-path reasoning separate from temporal choreography. Triggers/actions/conditions/navigation/overlay/recovery belong to the state-path decision; timeline/keyframe/timing/easing belong to the temporal decision. Preserve state meaning and operability when motion is reduced. If either decision needs depth outside this Skill, keep the unresolved concern explicit and let normal capability discovery select any additional help.

## Native/runtime discipline

Use the runtime's bounded query and guarded typed-mutation path for modeled operations; use the native escape hatch only for an uncovered/provider-gated API, and use typed artifact egress when the result is a durable file. Keep target identity explicit, drain/read change state before dependent patches, preserve stable continuation identity, mutate incrementally, inspect before mutate, use async Plugin API methods where required, and return bounded readback/render evidence. Exact transaction/reference syntax belongs to the native execution contract, not this Design workflow. Runtime facts do not become Design or verification verdicts automatically.

## Failure and correction

- **API-first design:** return to semantic/design responsibility before selecting Figma objects.
- **Clean tokens/components but poor screen:** inspect whole-scene visual distribution and part<->whole interaction.
- **Beautiful screenshot but weak structure:** inspect component/layout/token/plane graphs and rebuild ownership without sacrificing the visible design.
- **Every region becomes a card:** reopen grouping/silhouette/plane ownership.
- **Brand color everywhere:** restore dominant/support/accent distribution.
- **Responsive = breakpoint copy:** identify the actual invariant that fails under geometry/content/input pressure.
- **Agent invents missing UX:** mark blocked Product truth and stop that decision branch.

## Capability boundary

This Skill owns coherent Figma authoring across the whole scene; it does not own every deep domain method or fixed-artifact acceptance verdict. When an unresolved concern requires depth outside this accountable job, name the concern, required return, and proof consequence, then let normal Agent capability discovery decide whether additional Skill context is useful. Do not encode sibling-Skill routes or activation order inside this workflow.
