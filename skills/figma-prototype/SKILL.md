---
name: figma-prototype
description: "Design, inspect, author, or verify Figma prototype interaction graphs. Use for reactions, triggers, navigation, overlays, interactive components, variable conditions, focus/return, and recovery paths. Own state-transition wiring; not Motion choreography, static visual/layout polish, product-behavior invention, or production code."
---

# Figma Prototype

Own **interaction continuity**: how an approved user action moves the prototype from one meaningful state/context to another.

## Terminal job

Translate approved interaction/state truth into the smallest inspectable Figma prototype graph that preserves trigger, action, conditions, destination, context/focus, and recovery. Complete when material state paths can be traced from source to outcome and unsupported/runtime-gated behavior is explicit.

Read `references/prototype-method.md` when the interaction has branching, variables, overlays, interactive components, or recovery paths. Read `references/golden-teaching-cases.md` when interactive-component precedence, transient-plane recovery, or conditional state is material; use the cases to transfer the decision method, not their literal UI. Read `references/provenance.md` only for audit/provider-conflict work.

## Decision advantage

This Skill earns its place by treating a prototype as an **interaction state graph**, not a bag of click links. Resolve source state, trigger, ordered actions, conditions/variables, destination/context, focus/input consequences, and recovery. Multiple actions on one Reaction are one ordered behavioral contract; Motion choreography is a separate temporal concern.

## Operational vocabulary

**STATE PATH** — one traceable progression from source state through trigger/condition/actions to destination/context and recovery. A collection of links is not a path until the causal sequence is explicit.

**SOURCE STATE** — the exact semantic state in which an interaction becomes available. Do not infer source state from canvas proximity.

**TRIGGER** — the user/system input that begins the path. Essential meaning must not depend on an unavailable input modality.

**ACTION SET** — the ordered consequences attached to one trigger. Multiple actions on a reaction are one behavioral contract, not independent decoration.

**CONTEXT CONTINUITY** — what remains, changes, receives focus, or must be restored across navigation, overlays, and reusable state changes.

**RECOVERY PATH** — the dismiss/back/cancel/error/reset route required to leave or correct a state. A happy path without required recovery is incomplete.

## Skill I/O contract

**Minimum input**
- exact interactive sources and intended approved behavior;
- current reactions/actions plus the variables/state they actually depend on;
- destinations/overlays needed for the requested path.

**Escalate input only when** a branch, reusable interactive component, overlay context, or recovery path crosses the local subtree. Inspect only reachable states for the bounded interaction question before widening to a full flow.

**Return** a state-path packet (`source -> trigger -> condition -> actions -> destination/context -> recovery`), mutated IDs when applicable, and interaction proof per inspected path. See `references/inspection-recipes.md` for compact reaction projections.

## Interaction graph

Model before wiring:

```text
SOURCE STATE
  -> TRIGGER / INPUT
      -> CONDITION / VARIABLE (when needed)
          -> ACTION
              -> DESTINATION / STATE CHANGE
                  -> CONTEXT / FOCUS / RECOVERY
```

Keep product behavior authoritative. Figma reactions/actions are representations of approved behavior, not permission to invent new flows.

## Select the smallest prototype mechanism

- Use **navigation** when the user moves to another screen/context.
- Use **overlay/open/close** when a transient plane appears without replacing the underlying context.
- Use **change-to / interactive component state** when the same reusable component job changes controlled state.
- Use **variables/conditions** only when state/data logic is necessary to represent the approved path; do not simulate a product backend in prototype variables.
- Keep explicit static states when executable interaction adds no learning or proof value.

If the material question is keyframe timing, easing, springs, or timeline choreography, return a **TEMPORAL CHOREOGRAPHY** concern while keeping the interaction State Path explicit. State-transition truth and authored time are different contracts.

## State-path contract

For every material path establish:

- semantic source and destination states;
- trigger and input modality;
- action ownership;
- conditions/variables and their initial/updated values when used;
- navigation/overlay/component-state consequence;
- focus/context continuity and dismissal/back behavior;
- error/cancel/recovery path where product truth requires it;
- reduced-motion equivalent when visual transition is not essential to operability.

Do not make hover the only path to essential meaning. Do not make a prototype animation the only evidence that a state changed.

## Reuse and naming

Reusable interaction belongs with the semantic component/state contract when consumers share the same interaction job. Prefer stable names for:

```text
state/default
state/selected
state/expanded
state/disabled
interaction/open-details
interaction/dismiss
variable/selection/current
```

Names should expose meaning to designers/agents; do not encode canvas coordinates or generated node order.

Avoid duplicating identical reactions across many local instances when a shared interactive component owns the invariant behavior. Conversely, do not force unrelated workflows into one interactive component merely because their transitions look similar.

## Interactive components as reusable behavior

When the interaction belongs to a reusable component rather than one screen instance, keep the reusable component/state contract explicit instead of wiring every consumer independently.

```text
component state vocabulary
  Off | On
      |
      +-- click / CHANGE_TO --> sibling variant
      +-- optional variable mutation / condition
      +-- recovery/reset behavior when context requires it
```

- Prefer `CHANGE_TO` between variants in the same component set for portable interactive-component state changes.
- Instances inherit variant interactions. If an instance also has a regular interaction with the **same trigger**, that interaction can take precedence over the inherited variant interaction; different triggers can both remain active. Diagnose precedence before duplicating reactions.
- When component state must persist/share across frames, verify whether state memorization, variables, or explicit reset semantics are intended rather than assuming every navigation resets state.
- Distinguish portable variant interactions from main-component-to-frame navigation wiring. Do not claim that every prototype connection on a main component will propagate through a published team library.

The reusable component contract supplies state names/API; this workflow owns the transition/action graph. Rich temporal choreography remains a separate concern.

## Native/provider execution

- Inspect current editor/runtime support before authoring provider-specific reaction/action fields.
- Resolve the exact page/component/variant target before mutation.
- Preserve existing authored interactions not owned by the requested change.
- Return affected node/component IDs and enough readback to trace the resulting path.
- Treat provider tool/API availability as session evidence, not permanent capability truth.

## Proof

Match proof to the claim:

- **interaction wiring:** read back reactions/actions/conditions and exact source/destination IDs;
- **state path:** trace at least the primary path plus material cancel/error/recovery branch;
- **overlay/context:** inspect open/dismiss/return relation and input/focus semantics represented by the prototype;
- **interactive component:** verify representative instance/state behavior rather than only the component-set definition;
- **visual transition:** use rendered/temporal evidence only if the claim includes how the transition looks; otherwise wiring proof is enough.

A screenshot cannot prove a click path. A valid reaction object cannot prove the product behavior was the right behavior.

## Accessibility proof boundary

Prototype evidence can support the interaction paths, visible focus treatment, target geometry, state cues, and recovery semantics that are actually authored/inspectable in Figma. It cannot by itself prove production DOM/accessibility-tree semantics, complete keyboard behavior, screen-reader behavior, platform accessibility APIs, or operation with real assistive technology. Keep those claims `NOT_RUN`, `MISSING`, or `BLOCKED` until the accountable runtime evidence exists; do not upgrade a Figma path into production accessibility PASS.

## Failure and correction

- **Prototype invents behavior:** return to approved Product truth and mark the unresolved branch instead of designing it silently.
- **Every state becomes another screen:** reopen whether controlled component state or an overlay preserves identity better.
- **Variables imitate backend/business logic:** keep only interaction state needed for the prototype question.
- **No dismiss/back/recovery path:** model the state machine, not only the happy path.
- **Duplicate local reactions drift:** move shared interaction to the correct reusable component/state owner.
- **Timeline/keyframe work dominates:** return the temporal-choreography concern without rewriting the State Path.

## Boundaries

- Approved whole-experience behavior is input authority; this workflow represents it rather than inventing it.
- Reusable component anatomy/state vocabulary, temporal choreography, fixed-artifact assessment, and low-level execution mechanics remain separate semantic concerns.
- This workflow owns reactions, conditions, ordered actions, state progression, context continuity, and recovery that are actually represented in Figma.
