---
name: figma-code-to-design
description: "Translate a real codebase or design-system implementation into reusable native Figma objects and views. Use to sync code tokens, themes, typography, components, states, or screens; reconcile code/Figma drift; or rebuild a library from current code. Own code-to-design semantics; not code changes or independent redesign."
---

# Figma Code to Design

Translate **production truth into design representation** without turning code structure into the Figma ontology blindly.

## Terminal job

Produce/update Figma variables/styles/components/views that faithfully represent verified production design semantics while remaining usable for design exploration and future design-to-code translation. Complete when mapped roles/components and representative visuals are reconciled against the running/source implementation.

## Decision advantage

This Skill earns its place by translating **production design semantics rather than implementation structure**. DOM/view hierarchy, CSS classes, and component props are evidence, not the Figma ontology. Reconcile code, current Figma, Code Connect, rendered UI, and system authority so Figma remains editable/reusable instead of becoming a traced snapshot of production.

## Operational vocabulary

**PRODUCTION TRUTH** — the verified code/runtime behavior or reusable system contract that may inform the design representation. Incidental implementation structure is not Production Truth by itself.

**DESIGN CONTRACT** — the editable/reusable Figma meaning that should represent Production Truth: role, component job/API, layout relation, visual/type system role, or state.

**RECONCILIATION** — deciding `REUSE | UPDATE_FIGMA | DESIGN_AHEAD | TRANSLATE | CREATE | OBSOLETE | CONFLICT` per semantic dimension rather than globally choosing code or Figma.

**REPRESENTATION GAP** — a difference caused by code and Figma having different useful ontologies, not necessarily a product mismatch. Translate responsibility instead of copying implementation syntax.

**TRANSLATION PARITY** — the explicit dimensions in which the resulting Figma representation must agree with verified production behavior/system truth. Visual parity does not prove reusable design semantics.

## Skill I/O contract

**Minimum input**
- exact code revision and relevant token/component sources;
- representative rendered behavior/visual evidence when appearance matters;
- current Figma/system assets that may already express those semantics.

**Escalate input only when** authority conflicts or representation gaps remain: inspect Code Connect/library evidence, deeper component consumers, then broader rendered states. A visual capture can prove appearance but must not substitute for reusable Figma semantics.

**Return** reconciliation matrix, created/updated/reused Figma identities, unresolved authority conflicts, and translation/system/visual proof for representative consumers. Do not return raw source or captured DOM structure as the design contract.

## Distillation and provider authority

Read `references/provenance.md` for audit/provider-conflict work. Prefer Code Connect, existing Figma consumers, and library/design-system search as translation evidence before reconstructing objects. A provider-native web/design capture can prove appearance and supply otherwise unavailable raster/image evidence, but it does not own reusable system semantics.

Keep the translation boundary explicit: implementation structure is evidence for semantic roles, not a one-to-one blueprint for Figma Frames/Groups/Components.

## System-plane invariants

- Production code and Figma are complementary representations, not one-to-one object models.
- Extract semantic contracts before translating implementation details.
- Existing Figma authority may legitimately differ from code; resolve conflict explicitly rather than choosing the newest-looking artifact by default.
- Reuse current Figma system/library assets when semantics match; do not duplicate the codebase as disconnected design objects.
- Keep code changes outside this Skill unless explicitly handed to engineering.

## Workflow

1. Bind the exact code revision, stack, token/theme source, component source, and representative rendered UI.
2. Extract semantic design contracts:
   - token roles and modes;
   - typography roles;
   - component jobs/anatomy/props/states;
   - layout relationships;
   - visual/material roles;
   - motion roles when encoded.
3. Inspect current Figma file/system for corresponding variables/styles/components/instances and Code Connect mappings.
4. Build a reconciliation matrix: reuse, update, wrap/translate, create, conflict, obsolete.
5. Materialize foundations before dependent components.
6. Reconcile components in dependency order.
7. Assemble/update representative views using the Figma system rather than disconnected primitives.
8. Compare against real/running code and fix semantic/visual drift.
9. Record unresolved code-vs-design authority conflicts; do not silently overwrite them.

Read `references/reconciliation.md` for mapping categories and proof.

## Translation rules

### Tokens
Map code tokens to Figma variables by semantic role, mode, scope, and code syntax. Preserve primitive/semantic/component layers only when they exist or are justified by current system truth.

### Typography
Map information/type roles to Text Styles and relevant variables. Do not create one Text Style per generated CSS class if several classes are implementation details for one semantic role.

### Components
Map production component API to Figma component contract, but respect representation differences. Code `children` may become Slot, an icon prop may become Instance Swap, pseudo-state CSS may become variants/states, and not every implementation prop belongs in the designer-facing API.

### Layout
Translate semantic layout relationships, not DOM nesting. A wrapper `<div>` with no design responsibility may not need a Figma Frame; a CSS layout owner usually does.

### Visual and motion
Translate stable semantic roles and reusable recipes; preserve local implementation details as local when they are not system contracts.

## Naming and reuse

Use naming that keeps the design/code bridge legible:

```text
Figma semantic path <-> verified code syntax/source
Figma component      <-> code component identity
Figma property       <-> code API meaning
```

Prefer existing Figma naming if it is authoritative and map it via code syntax/Code Connect instead of renaming everything to source identifiers.

## Proof

Use multiple layers when relevant:

- source/API/token inspection;
- Figma structure/binding readback;
- screenshots/renders at representative content/states;
- running code visual comparison when available;
- Code Connect/code-syntax consistency.

A syntactically valid generated Figma structure is not visual/system parity.

## Failure and correction

- **DOM tree copied into Frames:** re-extract design responsibilities.
- **Every CSS variable becomes a semantic token:** distinguish implementation values from stable design roles.
- **Every prop becomes a Figma variant:** choose property/slot/instance-swap/variable representation by designer-facing contract.
- **Existing Figma library ignored:** reconcile/reuse before creation.
- **Code screenshot copied as flat image:** use it only as visual evidence; build native reusable Figma structure for editable design truth.
- **Code wins every conflict automatically:** surface authority; approved design may be ahead of implementation or code may contain incidental drift.

## Boundaries

- Whole-system governance/publication, deep local token/type/component/layout/visual craft, deterministic design↔code mapping artifacts, reverse design-to-code implementation, and production code mutation remain separate concerns.
- This workflow owns Production Truth extraction, semantic Reconciliation, native editable Figma representation, and representative translation/system/visual proof.
