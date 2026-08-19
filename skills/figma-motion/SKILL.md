---
name: figma-motion
description: Design, inspect, author, and systematize Motion timelines and animation behavior in Figma. Use for manual keyframes, timeline coordination, animation styles, animated components, timing/easing variables, springs, property animation, temporal salience, reduced-motion alternatives, and motion handoff. Own Motion choreography and reusable temporal language; do not own prototype reactions/navigation/conditions, static layout/visual-system decisions, product behavior invention, or production implementation.
---

# Figma Motion

Own **temporal choreography and salience** after the state/interaction meaning is known. Motion should explain change or reinforce consequence; it is not decoration.

## Terminal job

Translate an approved transition/motion intent into the smallest Figma Motion representation that preserves identity, origin/destination, consequence, rhythm, and accessibility. Complete when keyframes/timing/easing/timeline relations and representative temporal evidence are inspectable, with unsupported/provider-gated behavior explicit.

Read `references/motion-method.md` for timeline/timing/easing decisions. Read `references/provenance.md` only for audit/provider-conflict work.

If the material question is trigger/action/navigation/overlay/interactive-component state logic or prototype variables/conditions, use `figma-prototype` first. Prototype may initiate a transition whose visual choreography is then owned here.

## Decision advantage

This Skill earns its place by reasoning about **temporal continuity and choreography**, not by decorating transitions. Select authored time only when timing changes comprehension, feedback, plane continuity, emphasis, or perceived physical relation. Reuse temporal roles when the relationship is shared; equal millisecond values alone do not prove one motion token.

## Skill I/O contract

**Minimum input**
- exact animated subject(s), resting/start/end intent, and the temporal question;
- only the timeline/keyframe/timing/easing data for those subjects;
- reduced-motion obligation when the motion carries meaning.

**Escalate input only when** coordination, transform origin, mask/path behavior, or multi-node sequencing changes the diagnosis. Use rendered phase/video evidence only for claims that structure/keyframe data cannot prove perceptually.

**Return** subject identity, temporal model/role, keyframes/timing/easing/cohort decisions, reduced-motion meaning, and temporal proof. Do not return all timeline tracks when the caller only needs one motion role or discrepancy.

## Motion model

For each authored motion establish:

```text
source/rest state
-> animated property/subject
-> keyframe phases
-> timing/easing relation
-> coordination/timeline cohort
-> settle/final state
```

Keep state meaning authoritative. Motion represents the transition; it must not become the only evidence of the resulting state.

## Representation

Use Figma Motion when authored timeline/keyframe timing, property animation, animation styles, springs, or reusable animated components are material. Keep static states when time behavior adds no design/proof value.

Motion system roles may include:

```text
motion/duration/instant
motion/duration/fast
motion/duration/standard
motion/duration/deliberate

motion/easing/standard
motion/easing/enter
motion/easing/exit
motion/easing/emphasized
```

Use Timing/Easing variables only when they express a shared temporal role. Do not mint a token for every object/distance combination.

## Timing/easing reasoning

- Too short -> change becomes imperceptible.
- Too long -> motion becomes an obstacle.
- Distance, scale/visual weight, consequence, sequence, and product rhythm interact; no universal duration table proves quality.
- Springs are appropriate only when their physical response fits the product/system language.
- Stagger should reveal sequence/causality, not create decorative delay across scan-heavy UI.
- Preserve reduced-motion meaning by keeping state/result legible without requiring the animation.

## Coordination

When multiple nodes share a timeline/cohort, reason about common lifecycle first. Reuse identical motion definitions instead of copy-pasting per node; parameterize the values that legitimately vary such as delay/offset/target.

Keep static layout transforms distinct from animated transforms where they would otherwise overwrite/double-apply each other. Preserve per-element transform origin when rotation/scale depends on it.

## Native/provider execution

- Inspect current Motion API/tool support before authoring; Motion provider surfaces can be feature-gated/evolving.
- Use current public field/enum names and fail closed on unsupported API rather than retrying blindly.
- Return mutated node IDs plus relevant timeline/style identifiers.
- Prefer structured provider motion context when it exposes stronger temporal evidence than manually reconstructing the same data.
- Static screenshot/export proves only a resting frame. When timing/order/choreography is material and video export is available, verify representative phases/video.

## Proof

Use the cheapest evidence that proves the claim:

- keyframe/style/timing readback for authored Motion structure;
- timeline/cohort inspection for multi-node coordination;
- sampled rendered phases/video when visual order/timing is not self-evident;
- reduced-motion resting/result states when motion carries material meaning.

Do not label a timeline correct merely because all keyframes serialize. Temporal craft requires time-aware evidence when the claim includes timing/order/perception.

## Failure and correction

- **Glow/motion everywhere:** restore attention budget; keep temporal salience for meaningful change.
- **Same duration everywhere:** classify distance/weight/consequence/rhythm before reusing a role.
- **Motion hides state result:** make final/resting state understandable without animation.
- **Repeated snippets drift:** factor shared animation identity and parameterize controlled differences.
- **Static + animated transforms fight:** separate layout transform ownership from Motion transform ownership.
- **Prototype logic appears here:** move triggers/actions/conditions/navigation to `figma-prototype` and keep only choreography here.
- **API unsupported:** preserve `NOT_SUPPORTED`/`PARTIAL`; do not fabricate a custom provider capability.

## Boundaries

- `figma-prototype` owns reactions, triggers/actions, navigation/overlay, conditions/variables, and interaction state paths.
- `figma-design-authoring` owns approved whole-scene/state intent.
- `figma-tokens` owns variable mechanics/naming; this Skill owns semantics of timing/easing roles.
- `figma-components` owns component anatomy; this Skill owns reusable Motion behavior/animated components.
- `figma-verification` owns a fixed-artifact temporal verdict when assessment is the terminal job.
- `figma-design-to-code` currently owns production implementation of exported motion context; `figma-motion-to-code` remains an eval candidate, not an installed Skill.
