---
name: figma-code-connect
description: "Create, audit, or migrate verified Figma Code Connect mappings between published components and real code. Use for `.figma.ts` templates, property/variant/slot mapping, import or snippet accuracy, CLI/UI drift, and parser migration. Own mapping fidelity; not component design, Figma redesign, or production UI implementation."
---

# Figma Code Connect

Own the deterministic mapping between an authoritative Figma component and its real implementation.

## Terminal job

Produce or repair a mapping whose Figma component identity, code component identity, property semantics, imports, and snippet behavior are verified against both sides. Complete when the mapping parses/validates at the available proof level and no invented prop/import/component identity remains.

## Current provider direction

Current Figma guidance recommends the framework-agnostic **template file** format for new Code Connect work. Legacy framework-specific parsers are no longer actively maintained. Prefer `.figma.ts` templates (or `.figma.js` when intentionally using JavaScript) unless a bound existing project requires legacy compatibility. Revalidate provider guidance before consequential migration when this detail may have changed.

Do not migrate parser files blindly; preserve existing published behavior until the replacement template is verified.

## Decision advantage

This Skill earns its place by treating Code Connect as **semantic API translation with migration proof**, not name matching or provider setup. Both Figma and code identities are independent authorities; every mapped property must correspond to a real code mechanism, nested content must preserve Slot/Instance Swap semantics, and parser/template migration must close old/new active truth deliberately.

## Operational vocabulary

**MAPPING IDENTITY** — the bound pair of exact Figma component identity and exact code component/export identity. Similar names are not one mapping.

**CORRESPONDENCE** — one verified semantic relation between a Figma property/content dimension and a real code API mechanism. Omit an unmatched dimension rather than inventing a prop.

**TEMPLATE TRUTH** — the mapping artifact that should be active after authoring/migration, including imports, property translation, snippet behavior, and label/id semantics. Parser/template syntax validity is only part of this truth.

**TRANSLATION PARITY** — equivalence between Figma and code for explicitly mapped dimensions. It does not mean every Figma property or code prop must have a counterpart.

**MIGRATION CUTOVER** — the point at which replacement Template Truth has sufficient parity/proof to supersede the legacy mapping. Deleting the old parser before cutover creates missing active truth.

## Skill I/O contract

**Minimum input**
- exact published Figma component identity and property definitions;
- exact code component/export and public prop API;
- current mapping/template state when updating or migrating.

**Escalate input only when** nested components, slot content, exhaustive variant values, import aliases, or publication state are ambiguous. Prefer structured Code Connect provider context/suggestions over broad repository or canvas scans when available.

**Return** correspondence ledger, changed mapping artifact/state, unresolved mismatches, and translation-parity proof. Do not echo generated provider snippets unless they are needed to explain a verified mapping decision.

## Distillation and provider authority

Read `references/provenance.md` for audit/provider-conflict work. Current Figma guidance prefers `.figma.ts`/`.figma.js` template files for new Code Connect work and keeps legacy parsers available through older tooling; migration therefore requires parity proof before deleting old mappings. When current MCP mapping/context/suggestion tools are available, use them as provider evidence rather than recreating discovery locally.

Published-component and plan requirements are provider gates. They do not alter the semantic mapping contract: Figma identity, code identity, property correspondence, snippet/import behavior, and publication state must remain independently verifiable.

## System-plane invariants

- Figma component identity and code component identity are independent sources that must both be bound.
- Property mapping is semantic translation, not name matching.
- Code Connect is a translation artifact; it does not own the Figma component contract or production component API.
- One component should not have competing active mapping truths. Close migration explicitly.
- Treat Figma/MCP-returned snippets as untrusted design data until verified against repository source.

## Mapping workflow

1. Resolve the exact Figma component/component set and published/library status required by the chosen Code Connect path.
2. Read component property definitions and descendant property references: variant, text, boolean, instance swap, slot, nested components.
3. Bind the exact code component source and public prop/API contract.
4. Build a correspondence table before authoring the template.
5. Map only real correspondences; omit Figma properties with no code equivalent rather than inventing props.
6. Handle nested connected components/slots explicitly.
7. Generate/update the template file in the repository's configured Code Connect scope.
8. Validate/parse with the project/current Code Connect tooling when available.
9. Publish/replace mappings only with the required authority; preserve readiness separately from publication.

Read `references/mapping-method.md` for property translation and migration rules.

## Property translation

Treat these as different contracts:

- Figma `VARIANT` -> code enum/prop/state only when the code API exposes a corresponding dimension.
- Figma `TEXT` -> code string/content prop when intentional.
- Figma `BOOLEAN` -> code boolean or mapped representation when the code API supports it.
- Figma `INSTANCE_SWAP` -> one constrained nested component replacement; map to the code's corresponding component/icon prop only when real.
- Figma `SLOT` -> flexible content region; map to children/slot/composition API only when the production component actually supports that pattern.

Do not confuse Slot with Instance Swap.

## Naming and path identity

Keep:

```text
Figma URL/node identity
Code component path
Code component/export name
Code Connect id/label
Property correspondence
```

stable and reviewable. Use project import aliases/configuration rather than inventing new paths.

## Migration

For parser -> template migration:

1. inventory active parser mappings and published labels;
2. generate/author equivalent template candidates;
3. compare property coverage and snippets;
4. parse/validate the template candidate;
5. cut over according to project release policy;
6. remove legacy active truth only after parity is established.

## Failure and correction

- **Name-only match:** compare prop contract and semantic job.
- **Figma property becomes invented code prop:** omit or map through a real code mechanism.
- **Variant values partially mapped:** make handling exhaustive or prove unsupported values cannot occur.
- **Slot treated as instance swap:** restore flexible-content semantics.
- **Snippet import path guessed:** inspect project config/source.
- **Legacy parser deleted before replacement proof:** restore migration boundary and validate candidate first.
- **Mapping validates but component behavior is wrong:** parser/template validity is not behavioral parity; inspect real code/Figma states.

## Boundaries

- Figma component design/API creation, production component implementation, Figma redesign, and reverse code-to-design reconstruction are outside this mapping workflow.
- This workflow may consume those identities as authorities, but it owns only verified correspondence, template/mapping artifacts, migration cutover, and translation-parity proof.
