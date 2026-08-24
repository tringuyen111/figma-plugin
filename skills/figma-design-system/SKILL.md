---
name: figma-design-system
description: "Build, reconcile, audit, or evolve a reusable Figma Design System across foundations, components, layout, motion, libraries, naming, publishing, and code alignment. Use when the terminal outcome is a shared system/library rather than one object. Own cross-capability governance; delegate local specialist decisions."
---

# Figma Design System

Own the **whole reusable system**: shared vocabulary, source-of-truth, composition, publishing, propagation, and reconciliation between Figma and code.

## Terminal job

Produce or repair a Figma system whose foundations and components have explicit ownership, naming, reuse, variation, publishing, and code-handoff contracts. Complete when system-level conflicts are resolved, representative consumers prove the contract, and no superseded active truth remains hidden.

## Decision advantage

This Skill earns its place by governing **cross-capability reuse, authority, propagation, and distribution**. It decides what belongs in the system, where it belongs, which source wins a conflict, and how a change reaches consumers. It must not become a super-Skill that reimplements token/component/type/layout methods; compose those owners while retaining the system-level reconciliation and publication decision.

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

## Compose dedicated capabilities

Use these as the deep owner when material:

- `figma-tokens`: variables, modes, aliases, scopes, code syntax, extended collections.
- `figma-typography`: fonts, Text Styles, type roles and geometry.
- `figma-visual-system`: color/material/shape/effect composition.
- `figma-layout`: layout conventions and responsive geometry.
- `figma-components`: component APIs, variants, slots, instances.
- `figma-prototype`: reusable prototype interaction/state behavior where it belongs to the system contract.
- `figma-motion`: temporal system, Timing/Easing roles, and reusable Motion.
- `figma-verification`: fixed-system audit/acceptance; this Skill still owns system creation/repair.
- `figma-code-connect`: deterministic component mapping.
- `figma-design-to-design`: consume/reuse/wrap/fork/migrate/sync system assets across Figma files while preserving the intended identity/update path.

This Skill remains accountable for cross-capability consistency and the system-level terminal result.

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

Once another file must **consume, migrate, or synchronize** the system, hand the transfer job to `figma-design-to-design`; this Skill remains owner of the system source/governance itself.

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

ControlMux Figma exposes `figma_status`, read-only `figma_query`, guarded `figma_apply`, raw `figma_exec`, and typed `figma_export` as the local runtime/egress kernel. Prefer typed query/apply for common inventory, structure, handoff, and file-owned cleanup; use raw execution only when no typed operation exists. Preserve missing provider capabilities explicitly rather than hallucinating them.
