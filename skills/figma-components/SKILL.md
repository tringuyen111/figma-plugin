---
name: figma-components
description: "Design, audit, repair, or evolve reusable Figma components and instance APIs. Use for component sets, variants, slots, properties, overrides, preferred instances, reuse, propagation, variant explosion, or detach cleanup. Own the semantic component contract; not product behavior, tokens, general layout, or code."
---

# Figma Components

Own reusable component **semantics, anatomy, configurability, and propagation**. Componentize repeated jobs, not repeated shapes.

## Terminal job

Given current product/design-system truth and representative consumers, produce or repair a Figma component contract that preserves semantic identity while exposing only intentional variation. Complete when the component API, instances, reuse path, and representative states/consumers are inspectable and coherent.

## Decision advantage

This Skill earns its place by designing a **designer-facing semantic API**, not mirroring the current layer tree. Infer invariant anatomy from consumer jobs, move independent content/visibility/swap/flexible dimensions into the right Configuration API mechanisms, and use override/detach patterns as evidence that the contract may be wrong. Variant count is a symptom; semantic independence and propagation are the decision variables.

## Working vocabulary

Use these terms literally when reasoning about a reusable contract.

- **SEMANTIC JOB** — the stable responsibility the component serves for its consumers. If two candidate variants serve materially different jobs, reopen the component boundary before adding API surface.
- **INVARIANT ANATOMY** — the semantic regions/relations that must remain present for the Semantic Job to stay true across allowed variation.
- **CONFIGURATION API** — the intentional choices exposed to consumers through properties, variants, swaps, Slots, or supported overrides. It is not a mirror of the internal layer tree.
- **CONSUMER PRESSURE** — a representative valid use that can falsify the contract: long/short content, density, theme, state, optional regions, or neighboring context.
- **PROPAGATION** — how a source-component change reaches existing instances/consumers while preserving valid consumer intent.
- **DETACH PRESSURE** — repeated need to detach or make compensating local overrides for valid consumers. Treat it as evidence that anatomy, configuration, layout, or semantic boundary may be wrong.

## Skill I/O contract

**Minimum input**
- exact component/set identity plus property definitions/options;
- shallow anatomy including named configurable descendants/slots;
- representative instances/overrides that exercise the disputed API.

**Escalate input only when** the boundary or propagation is ambiguous: inspect deep descendants, variable bindings, prototype behavior, or a neighboring consumer. Prefer a compact component-API projection over serializing every node property.

**Return** semantic job, invariant anatomy, property/slot/variant decisions, migration/propagation scope, affected component/instance IDs, and structure/system proof. See `references/inspection-recipes.md` for bounded inspection projections.

## Distillation and provider authority

Read `references/provenance.md` when auditing component semantics or provider changes. Current Figma exposes five component-property types: Boolean, Instance Swap, Text, Variant, and Slot. Choose among them by freedom/guardrail needs: Instance Swap constrains a replaceable nested instance; Slot permits flexible content while preserving the outer contract; Variant expresses controlled states/types.

Descriptions and semantic inner-layer/property names are part of agent/Dev Mode context. They improve discoverability but do not certify a correct component API; representative consumers and state/override behavior remain the proof.

## System-plane invariants

- One component owns one repeated semantic job.
- Reuse contract starts from invariant anatomy; properties/variants expose controlled differences rather than arbitrary freedom.
- Component identity, token/style consumption, layout ownership, and plane ownership are separate concerns.
- Widen a fix from instance -> component -> semantic role/foundation only with evidence from representative consumers.
- Repeated local overrides are diagnostic evidence, not a normal customization strategy.

## Component contract

Build in this order:

```text
semantic job
  -> invariant anatomy
  -> region ownership + content pressure
  -> required token / type / visual bindings
  -> controlled properties / slots / variants / states
  -> instances
  -> pressure + propagation proof
  -> authorized contextual overrides only when still necessary
```

Read `references/component-contract.md` when deciding component boundaries, property type, variant strategy, or migration. Read `references/golden-teaching-cases.md` when interactive-component composition, Slot constraints, or API migration is material; those cases show rejected alternatives, exact Figma construction, proof, and re-entry rather than only rules.

### Coordinate the inside before exposing the API

The component contract owns the **coordination** of its internal construction even when deeper layout, token, typography, interaction, or visual mechanisms fall outside this Skill's accountable job. Do not jump from a plausible layer tree directly to component properties.

For every invariant semantic region, determine together:

| Decision | Ask | Failure signal |
|---|---|---|
| Region job | What meaning must remain stable across consumers? | Generic `header/body/footer` survives even though consumers need different jobs. |
| Content freedom | Fixed, optional, swappable, repeating, or freeform? | Variant/property API exposes arbitrary freedom or forces detach. |
| Layout owner | Which ancestor owns flow, sizing, alignment, wrapping, and overflow? | Children contain compensating offsets/absolute placement to survive normal content. |
| Pressure behavior | What happens with long text, missing content, extra actions, density, or resize? | The normal specimen looks correct but one representative pressure case breaks anatomy. |
| System bindings | Which existing token, type role, visual role, or nested component must be consumed? | Local hard-coded styling becomes part of a supposedly reusable contract. |
| Public API | Which differences should become Text/Boolean/Instance Swap/Slot/Variant? | Internal implementation details leak into the designer-facing API. |

Only expose the public component API after these relationships are coherent. The Skill does not need to reproduce every specialist algorithm locally, but it must keep the resulting invariants visible enough to coordinate them.

Keep cross-domain dependencies as **unresolved concerns**, not Skill routes:

- **GEOMETRIC VIABILITY** — when sizing, wrapping, Grid/Auto Layout responsibility, or Slot Pressure can change whether the contract survives a representative consumer, require the Layout Owner, sizing/adaptation Invariant, affected identities, and one pressure-case result before finalizing the Configuration API.
- **SYSTEM-VALUE VIABILITY** — when the component would introduce or reshape semantic values, aliases, modes, or bindings, require the semantic role/binding decision plus affected value/consumer identities before local hard-codes enter the contract.
- **TEXT-METRIC VIABILITY** — when text-role choice or font metrics can change hierarchy or Consumer Pressure, require the chosen text role/style and the metric consequence that the component must absorb.

These concerns describe missing decision depth. They do not prescribe which sibling Skill must be selected; Agent capability discovery remains outside this workflow.

**Near-miss:** a `Card` with a well-named `Content` Slot and clean properties is still a weak component when the title, actions, and Slot rely on hand offsets, local fills, or one happy-path width. A stronger construction first gives each semantic region an owner and pressure behavior, consumes existing system bindings, then exposes the Slot/property API and proves long-title plus maximum-actions consumers without detach.

## Anatomy and slots

Name stable semantic regions such as identity, value, metadata, leading media, primary action, trailing action, state marker, disclosure, or flexible content region. Avoid generic `header/body/footer` when a more specific job name exists.

Use a **Slot** when a semantic region is stable but needs flexible/repeating/freeform composed content while the surrounding component contract remains authoritative. A Slot is not a generic escape hatch; define content expectations, min/max/recommended children, layout behavior, and pressure rules.

Use an **Instance Swap** when one nested instance position is intentionally replaceable but rigidly constrained. Prefer preferred instances to guide valid substitutions.

## Property selection

- **Text**: intentionally editable text content.
- **Boolean**: optional visibility/presence or another true/false exposure Figma supports.
- **Instance Swap**: replace one nested component while preserving the slot/anatomy position.
- **Slot**: flexible child composition/repetition.
- **Variant**: controlled state/type/size/emphasis/orientation dimension represented by variants.

Variants are for controlled dimensions of the same job. If two variants require unrelated anatomy/action ownership/state semantics, split the component instead of inflating one API.

## Variant/state model

Keep dimensions independent when they represent independent choices:

```text
Type=Primary|Secondary|Ghost
Size=Small|Medium|Large
State=Default|Hover|Pressed|Disabled
Density=Compact|Regular
```

Do not encode multiple dimensions into one opaque value such as `PrimaryLargeHover`. Avoid combinatorial explosion: if a dimension can be expressed by a Text/Boolean/Instance Swap/Slot/property or variable mode without variant permutations, prefer the simpler truthful representation.

## Interactive component composition contract

A reusable component may own a **state vocabulary** without owning the executable transition graph. Keep these responsibilities explicit:

```text
COMPONENT CONTRACT
  Semantic Job -> Invariant Anatomy -> Configuration API -> state vocabulary

INTERACTION PATH
  trigger -> actions / conditions -> state change / navigation -> resulting state

TEMPORAL CHOREOGRAPHY
  timeline / keyframes / timing / easing -> perceived transition
```

For interactive components, model state variants such as `Off | On`, `Collapsed | Expanded`, or `Default | Hover | Pressed` here. Keep approved interaction-path behavior and temporal choreography as separate decision concerns rather than encoding them into variant names. Instances inherit variant interactions; a regular interaction added directly to an instance with the **same trigger** can override the variant interaction, while different triggers can coexist. Treat unexpected instance behavior as a possible precedence problem before rewriting the component.

Do not use variant names as hidden business logic. State vocabulary should describe the reusable UI state contract; product-specific navigation/business behavior stays outside the component unless the approved reusable contract genuinely owns it.

## Naming as API

Component and property names are part of the interface used by designers, agents, libraries, and Code Connect.

Prefer:

```text
Controls/Button
Navigation/Model Selector
Data/Request Row
Feedback/Toast

Properties:
Type
Size
State
Leading icon
Trailing icon
Label
Loading
Content
```

Inside the component, name semantic layers (`label`, `leadingIcon`, `supportingText`) rather than auto-generated node names.

## Reuse decision

Before creating a new component:

1. inspect local matching components and representative instances;
2. inspect accessible library components when available;
3. compare semantic job, anatomy, state behavior, property API, token model, and ownership;
4. **reuse** when contract matches;
5. **extend** when it is the same job with one supported missing dimension;
6. **wrap** when a visual/library asset is reusable but its public API is incompatible and wrapping preserves authority;
7. **create** only when existing roles cannot express the job truthfully.

Do not merge three visually similar blocks if their jobs/state/evolution differ materially.

When reuse identity must survive another operation, context/session, file, or library boundary, **READ** `references/reuse-registry.md` and persist the selected identity with `references/reuse-registry.schema.json`. WHEN initializing that durable registry, start from `templates/reuse-registry.json` because it preserves the schema's required starter shape before validation. Validate it using `scripts/validate-reuse-registry.mjs`. Keep `LOCAL_VERIFIED`, library discovery, imported cross-file proof, stale identity and `NOT_RUN` distinct; appearance alone never upgrades a registry entry.

## Native execution discipline

- Prefer guarded typed component mutation for modeled property lifecycle, Slot creation/reset, variant-set construction, and instance-property changes. When a newly produced component entity is immediately consumed by later mutations in the same causal transaction, use the runtime's modeled transaction-local identity mechanism instead of splitting the work only to discover provider IDs. Use the narrow native escape hatch only for component APIs not yet modeled, followed by bounded component readback. Exact operation names and identity-edge syntax belong to the native execution contract.
- Inspect `componentPropertyDefinitions` on the main component/component set, not only one variant.
- For TEXT/BOOLEAN/INSTANCE_SWAP properties, keep the full property key returned by Figma, including the unique `#...` suffix. Do not reconstruct API keys from visible labels.
- For SLOT properties, inspect `slotSettings` and representative `SlotNode.limitViolations`; a successful edit does not prove slot constraints are satisfied. `InstanceNode.setProperties()` does not set SLOT content.
- Traverse descendants to understand where text/boolean/instance-swap properties bind.
- Prefer instances and property/variant changes over detaching.
- Keep deterministic names and return created/mutated ids.
- When creating variants, verify set membership, names/properties, instance behavior, and visual result.
- Add useful component descriptions and documentation links when the system has them; descriptions explain intent/constraints, not merely appearance.

## Migration and propagation

Classify scope:

- `INSTANCE`: one consumer misuses an otherwise correct contract.
- `COMPONENT`: repeated anatomy/property/state defect.
- `SEMANTIC ROLE`: the meaning is represented inconsistently across component families.
- `FOUNDATION`: cross-family visual/interaction relationship is wrong.

Before changing shared component structure, inspect densest consumer, long/short content, material states, supported themes/densities, and at least one neighboring context.

## Failure and correction

- **Component by shape repetition:** reopen semantic job/evolution/state evidence.
- **Variant explosion:** move independent content/visibility/swap/flexible dimensions to their proper property types or variables.
- **Slot used as anything-goes subtree:** restore semantic slot constraints or split component.
- **Instance Swap used for arbitrary freeform content:** use Slot if the region truly needs flexible composition.
- **Detach Pressure:** repeated detach operations mean valid consumers are escaping the contract; inspect missing Configuration API, Invariant Anatomy, layout, or semantic-boundary rules before accepting detach as normal.
- **Many local overrides:** determine whether component contract is defective or consumers actually represent another job.
- **Global change from one odd instance:** prove propagation scope before touching the shared component.

## Capability boundary

This Skill owns the reusable component contract: Semantic Job, Invariant Anatomy, Configuration API, state vocabulary, consumer reuse, and Propagation. It does not own general layout mechanics, token architecture, typography recipes, visual composition, executable interaction paths, temporal choreography, fixed-artifact verdicts, code mapping, or whole-system publication governance. When one of those concerns becomes decision-material, preserve the unresolved concern and required return; normal Agent capability discovery decides whether additional Skill context is useful.
