# Distillation provenance

Use this file only when auditing/updating **figma-prototype**, resolving provider conflicts, or explaining its capability boundary.

## Derived design/method basis

- SDLC Intelligence / skill-plugin-engineering: independent accountable outcome, stateful reasoning representation, exact proof, migration without duplicate active truth.
- Product Design: state families, interaction continuity, plane/input relations, modality continuity, reduced-motion semantics.
- Split from ControlMux Figma `figma-motion` in 0.5.2 because reaction/state-machine authoring and Motion timeline authoring have independent triggers, mechanisms, failure modes, and proof.

## Official Figma/provider basis

- Figma Plugin API reactions/actions/interactive component behavior: https://developers.figma.com/docs/plugins/api/Reaction/
- Variables in prototypes: https://help.figma.com/hc/en-us/articles/14506587589399-Use-variables-in-prototypes
- Figma MCP / write-to-canvas guidance: https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/

Provider docs/API are execution evidence, not ControlMux ontology. Re-check current Plugin API/runtime when reaction/action/condition fields or editor support affect execution.

## Installed Figma plugin Skills compared

- `figma-use` for native reaction/action inspection and mutation.
- `figma-use-motion` is intentionally *not* the owner here; it covers timeline/keyframe Motion.

## Public Agent Skill comparison

Public Figma component/deep-inspection Skills commonly expose reactions and state behavior as a distinct inspection concern. They are comparison evidence only, not provider authority.

## What this Skill distilled

- **Adopted:** approved state truth -> trigger/condition/action -> destination/context/recovery -> interaction proof.
- **Not copied:** no provider-tool wrapper Skill, no timeline/keyframe methodology, no backend simulation through prototype variables.

## Revalidation triggers

Reaction/action API shape, conditional/variable prototype behavior, interactive-component provider support, editor gating.

## 0.5.5 interactive-component composition

Revalidated current Interactive Components semantics, including inherited variant interactions, same-trigger instance precedence, state memorization/reset considerations, and the boundary between portable variant behavior and main-component navigation wiring.

## 0.5.6 behavioral teaching depth

Added detailed Interactive Component, transient Select, and local-validation teaching cases plus a local accessibility proof boundary. Prototype evidence can prove authored Figma interaction/state/recovery behavior, not production DOM/accessibility-tree, complete keyboard/screen-reader, platform accessibility API, or real assistive-technology behavior. Figma behavioral execution remains `NOT_RUN`.
