---
name: figma-tokens
description: Design, audit, migrate, and apply reusable Figma Variables and token architecture. Use for variable collections, modes, aliases, primitive/semantic/component token layers, scopes, code syntax, theming, density, language/context modes, extended collections or multi-brand systems, token naming, duplicate/drift cleanup, and Design-to-Code token mapping. Do not own typography recipes, component anatomy, visual color composition, or motion behavior even when those domains consume variables.
---

# Figma Tokens

Own **reusable design values and their semantic mapping** in Figma. Treat variables as a relationship system, not a bag of constants.

## Terminal job

Given code/design-system truth and current Figma variables, produce a coherent variable architecture with explicit identity, semantic roles, modes, aliases, scopes, code syntax, reuse rules, and migration impact. Complete when every material token has one authoritative meaning and representative consumers resolve correctly.

## Decision advantage

This Skill earns its place by distinguishing **semantic role identity from raw value equality** and by reasoning through the consumer graph. Decide whether a value is primitive, semantic, component-scoped, mode-dependent, or not reusable at all from meaning and propagation—not from repeated literals. A correct token decision includes migration/blast radius, scope, aliasing, and code-facing identity where relevant.

## Skill I/O contract

**Minimum input**
- material collections/modes/variables involved in the requested role;
- representative consumers or intended consumer classes;
- current code/design naming authority when translation is required.

**Escalate input only when** alias lineage, scope, mode behavior, or consumer impact is ambiguous. Prefer filtered variable/consumer records over exporting every variable in the file. Load values for every relevant mode only when the decision spans those modes.

**Return** token identities/roles, collection+mode placement, alias/scope/code-syntax decisions, migration/consumer impact, and `system-reuse` proof. Do not return a giant token dump when the caller needs a role decision or changed subset.

## Distillation and provider authority

Read `references/provenance.md` when auditing token architecture or provider changes. Current Figma variables include Color, Number, String, Boolean, Timing, and Easing; apply only types relevant to the owned semantic value. Styles remain useful for composite recipes, while variables provide atomic/contextual values, modes, and aliases.

Never derive canonical code syntax from a Figma token name when an authoritative code token already exists. Preserve existing system naming over generic defaults; use slash hierarchy to expose semantic grouping, not to encode implementation trivia.

## System-plane invariants

- One semantic decision has one token owner/source of truth.
- Equal raw values do not prove equal roles; different mode values can realize the same role.
- Distinguish foundation value, semantic role, and component-specific contract.
- Widen migration only when consumer evidence proves shared impact.
- Naming is an API for designers, agents, and code handoff; avoid value-encoded or feature-local names unless the role is truly local.

## Token architecture

Prefer the smallest architecture justified by the source:

```text
Primitive       raw scale/value candidates
   ↓ aliases
Semantic        product/design meaning
   ↓ optional aliases
Component       stable per-component contract when needed
   ↓
Consumer
```

Do not manufacture three layers if the source is genuinely flat and small. Do not flatten a mature semantic system merely for fewer variables.

Read `references/token-system.md` for layer, collection, mode, naming, and migration decisions.

## Figma variable model

Reason independently about:

- **Collection**: governance/mode boundary, not merely a visual folder.
- **Mode**: alternate resolution of the same roles such as light/dark, density, platform, locale, or brand context when the system actually supports them.
- **Alias**: identity-preserving relationship to another variable.
- **Scope**: where a variable should appear in property pickers; set specific scopes instead of leaving broad defaults.
- **Code syntax**: valid Web/iOS/Android representation used in handoff; map to the real codebase naming.
- **Extended collection**: parent/derived collection for multi-brand inheritance when the Figma plan/runtime supports it; do not fake this with duplicate disconnected collections.

Variable types include color, number, string, boolean and current Figma timing/easing forms. Domain semantics still belong to the consuming capability: timing/easing naming comes from `figma-motion`, typography role composition from `figma-typography`.

## Naming grammar

Use slash hierarchy to expose semantic structure in Figma. Prefer names such as:

```text
Primitives:
color/neutral/50
color/blue/600
space/4
radius/medium

Semantic:
color/surface/canvas
color/surface/raised
color/text/primary
color/action/primary
space/stack/tight
space/region/separation

Component when justified:
button/background/default
button/foreground/disabled
button/gap
```

Reject names whose identity depends on the current literal value (`gray-243`) or one screen (`settings-card-blue`) unless that screen-local decision is intentionally not a shared token.

When a migration or generated token set needs a conservative machine check for slash-path syntax/duplicates, pipe the proposed names to `scripts/validate_token_names.py`. The script checks grammar/duplicates only; semantic correctness still requires the reasoning above.

```bash
printf '%s\n' 'color/surface/canvas' 'space/group/medium' | python scripts/validate_token_names.py
```

## Reuse and propagation contract

For each material variable record:

```text
identity -> semantic role -> collection -> mode values/aliases
-> allowed scopes -> code syntax -> representative consumers
-> owner/source -> migration/deprecation rule
```

Before creating a variable:

1. search local collection/name;
2. inspect aliases and existing consumer bindings;
3. inspect code syntax/source tokens when code is authoritative;
4. reuse if semantics match;
5. extend only if the same role needs a supported mode/consumer mapping;
6. create a new role only when existing roles cannot express the meaning truthfully.

## Native execution discipline

- Use async variable APIs when available.
- Check for an existing variable by name + collection before create; Figma can permit confusing duplicate names.
- Create primitives before semantics that alias them.
- Set variable scopes explicitly.
- Set code syntax only from verified code/platform naming; do not invent production identifiers.
- Import a library variable before local aliasing when the API/runtime requires a local imported object.
- Return created/mutated variable and collection ids from `figma_exec`.
- Inspect representative bound nodes after changes; a variable table alone does not prove correct use.

## Migration method

1. Bind exact old and target role/value/mode truth.
2. Classify change scope: local consumer, semantic role, collection/mode, foundation.
3. Map old -> target tokens before deletion/rename.
4. Rebind representative consumers and inspect mode behavior.
5. Migrate remaining consumers deterministically when evidence supports it.
6. Remove/deprecate superseded tokens only after no active consumer requires them.

## Failure and correction

- **Token = deduplicated number:** restore relationship/role identity.
- **New gray for every surface:** inspect surface/plane mapping and visual composition before expanding taxonomy.
- **`ALL_SCOPES` everywhere:** narrow scopes to actual property classes.
- **Light/dark duplicated raw tokens:** preserve semantic role and resolve through modes/aliases.
- **Brand forks whole system:** prefer parent semantic contract with authorized brand overrides/extended collection where supported.
- **Code syntax invented from Figma names:** verify codebase token source first.
- **Renaming breaks handoff:** treat token path/code syntax as API; plan migration and downstream consumers.

## Boundaries

- `figma-verification` owns a fixed-artifact audit/verdict; this Skill owns authoring/repair decisions in its domain.

- `figma-visual-system` chooses perceptual color/material relationships; this Skill materializes reusable value roles.
- `figma-typography` owns text-role/style recipes and consumes number/string variables as appropriate.
- `figma-components` owns component anatomy and may consume component-level tokens.
- `figma-motion` owns motion semantics for timing/easing variables.
- `figma-design-system` owns whole-system reconciliation and publication strategy.
