---
name: figma-design-system
description: "Build, reconcile, audit, or evolve a reusable Figma Design System across foundations, components, layout, motion, libraries, naming, publishing, and code alignment. Use when the terminal outcome is a shared system/library rather than one object. Own system-level authority, reuse, propagation, distribution, and reconciliation; local object-level craft remains outside the terminal job."
---

# Figma Design System

Own the **whole reusable system**: shared vocabulary, source-of-truth, composition, publishing, propagation, and reconciliation between Figma and code.

## Terminal job

Produce or repair a Figma system whose foundations and components have explicit ownership, naming, reuse, variation, publishing, and code-handoff contracts. Complete when system-level conflicts are resolved, representative consumers prove the contract, and no superseded active truth remains hidden.

## Decision advantage

This Skill earns its place by governing **cross-capability reuse, authority, propagation, and distribution**. It decides what belongs in the system, where it belongs, which source wins a conflict, and how a change reaches consumers. It must not become a super-workflow that reimplements local value/component/type/layout craft; keep those local decisions explicit while retaining system-level reconciliation, propagation, distribution, and publication responsibility.

## Operational vocabulary

**SYSTEM ROLE** — a reusable semantic responsibility that belongs to the shared system rather than one feature instance. Repetition alone does not make a value/component/system-worthy.

**SYSTEM AUTHORITY** — the authority allowed to define one disputed system dimension. Different dimensions may have different System Authorities; do not choose one file globally because it is newest.

**PROPAGATION PATH** — how an approved system change reaches libraries, instances, bindings, mappings, and representative consumers. A copied value has no propagation path by itself.

**DISTRIBUTION CONTRACT** — whether a system asset is local, published, subscribed/imported, or otherwise shared, plus the update relationship consumers are expected to retain.

**CONSUMER PROOF** — representative real usage that demonstrates the shared contract survives actual content/state/mode/density pressure. Definitions alone do not prove a system.

**MIGRATION TRUTH** — the explicit state of old/new identities, consumers, compatibility, cutover, and removal. Two competing active systems are not a completed migration.

## Skill I/O contract

**Minimum input**
- bounded system scope and authority sources;
- inventory summaries for the affected foundations/components/styles/libraries;
- representative consumers that prove reuse/propagation.

**Escalate input only when** a conflict or blast radius crosses the current scope: expand from item -> semantic role -> foundation -> distribution deliberately. Prefer inventories/diffs over full node trees or screenshots of every page.

**Return** reconciliation decisions (`reuse/update/create/conflict/deprecate`), ownership/source, propagation/publication impact, unresolved authority conflicts, and proof by relevant evidence dimension. See `references/inventory-recipes.md` for bounded inventory shapes.

WHEN establishing a system audit or reconciliation baseline, READ `references/system-audit.md` because it defines bounded inventory, conflict, propagation, and proof dimensions before system-level decisions widen.

## Distillation and provider authority

Read `references/provenance.md` when auditing the system or provider evolution. Discovery is upstream-first: inspect current file/code evidence, then available libraries/design-system search before creating local replacements. Figma’s own Skill guidance explicitly treats Skills as reusable workflows for extending an existing design system rather than working around it.

Provider plan/beta limits are execution constraints, not reasons to change semantic ownership. If a remote library capability is unavailable, report that limitation before inventing a disconnected local substitute.

## System-plane model

Treat the design system as several coupled planes with one authoritative owner per decision:

```text
FOUNDATION     tokens / typography / visual roles / motion roles
STRUCTURE      components / slots / layout conventions
DISTRIBUTION   local vs library / publish / update propagation
TRANSLATION    code syntax / Code Connect / code-to-design / design-to-code
CONSUMPTION    screens / states / modes / products / brands
EVIDENCE       structural + visual + downstream proof
```

Do not let a package/library boundary decide semantic capability boundaries.

## Discovery before creation

Bind exact current truth from both sides that matter:

- Figma pages, components, sets, instances, variables/collections/modes, styles, descriptions, library relationships, and representative screens;
- code tokens, component APIs, naming conventions, themes/densities/platform rules, and existing Code Connect mappings when code is in scope;
- approved product/brand/design-system authority;
- current Figma plan/runtime capabilities where a feature is gated.

Produce a gap/conflict map before system mutation:

```text
exists in code only
exists in Figma only
same concept, same contract
same name, different contract
same contract, different name
obsolete/duplicate
unknown authority
```

## Reuse order

Prefer:

```text
local authoritative asset
-> published/subscribed library asset
-> compatible accessible library asset
-> extend/wrap existing asset
-> create new
```

Reuse is semantic, not visual. Compare job, API/properties, token/style model, ownership, and update path.

## System naming contract

Naming is a public interface for people, agents, library search, Dev Mode, and code translation.

Establish conventions for:

- variable collections and slash paths;
- Text/Paint/Effect Styles;
- component families and component sets;
- property axes and values;
- semantic inner-layer names when machine inspection matters;
- motion role names;
- deprecated/legacy aliases during migration.

Names should survive literal value changes and avoid screen-specific coupling.

## Build/reconcile order

Use only phases that the current system needs, but preserve dependency truth:

1. **Authority and scope**: freeze the bounded system outcome and current sources.
2. **Foundations**: tokens/variables, typography, visual roles, motion roles where justified.
3. **System structure**: components in dependency order with properties/slots/variants and layout contracts.
4. **Distribution**: library/local ownership, publication/update behavior, descriptions/docs.
5. **Translation**: code syntax, Code Connect, code/design mapping.
6. **Consumers**: representative screens/states/modes/brands/densities.
7. **Migration**: remove superseded active truth only after replacement parity/proof.

Do not create components before their required variable/style foundations exist unless the source intentionally has no such system.

## Resolve system dimensions without absorbing local craft

The system workflow coordinates these semantic dimensions only when they affect the shared terminal result:

| System concern | Required system-level return |
|---|---|
| value architecture | role/mode/alias/source decision + affected consumer graph |
| typography system | information-role contract + reusable type identity + pressure proof |
| visual system | shared visual roles/material language + representative perceptual proof |
| layout convention | reusable geometric invariant + pressure/adaptation rule |
| component contract | semantic job/API/state/slot compatibility + consumer proof |
| interaction state | reusable state-path obligation that must survive system reuse |
| temporal system | reusable Temporal Role/easing/timing semantics + reduced-motion meaning |
| verification | exact shared-system claim + required evidence dimension, without self-approving it |
| code mapping | correspondence/parity obligation between design identity and production identity |
| cross-file identity | intended upstream/update relationship for consumption, migration, or synchronization |

Do not turn this matrix into a capability route table. Resolve the system-level consequence and leave local craft depth to normal Agent capability discovery when it becomes decision-changing.

## Library and publication reasoning

Before publishing or replacing a shared asset, record:

```text
asset identity
owner/source
consumers
version/change intent
compatibility impact
migration rule
proof targets
```

Publishing is an authority/release side effect, not an automatic step. If the user has not authorized publication, keep the candidate local and report readiness separately. Inspect `getPublishStatusAsync()` where supported to distinguish unpublished/current/changed readiness, but do not turn readiness into a publication claim. Library enablement is likewise a Figma/user action; local `figma.teamLibrary` inspection requires the `teamlibrary` permission and does not grant authority to enable libraries.

Once another file must **consume, migrate, or synchronize** the system, return the exact source/target identities and intended upstream/update relationship as a cross-design transfer concern. This workflow remains accountable for the system source/governance itself; normal Agent capability discovery owns what executes the transfer job.

## Proof matrix

A system claim needs more than valid objects. Check:

- foundation uniqueness and alias/mode resolution;
- naming consistency and searchability;
- component APIs and representative states;
- dense/real-content consumers;
- theme/density/brand/platform modes that exist;
- visual part <-> whole coherence;
- Code Connect/code syntax mappings when claimed;
- library update/migration behavior when claimed;
- no accidental hardcoded bypass where the system contract requires bindings.

## Failure and correction

- **Feature-local mini design system:** search/reuse existing roles before invention.
- **Library copied as loose values:** preserve reusable identity/update path where authority allows.
- **System = folder taxonomy:** reconstruct source, semantics, variation, consumers, and propagation.
- **Everything standardized:** preserve controlled contextual variation; consistency is stable invariants, not pixel sameness.
- **One broken screen triggers foundation rewrite:** test local/component explanations before widening scope.
- **New system coexists silently with old one:** close migration truth; remove/deprecate superseded discovery and consumers after proof.

## Native/runtime boundary

Use the installed Figma execution surface as mechanics, not as the design-system ontology. Prefer bounded structured inventory/mutation/readback when it can express the decided system relation; use the narrow native escape path only for an uncovered provider operation. Preserve missing provider capabilities explicitly rather than hallucinating them, and do not convert tool availability into publication/library authority.
