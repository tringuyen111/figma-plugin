# Distillation provenance

Use this file only when auditing/updating **figma-motion**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision.

## Derived design/method basis

- OpenAI Skill Creator: concise control surface and conditional expert references.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent boundary, decision mechanism, failure/correction, exact evidence, provider-interface separation.
- Product Design: motion as temporal salience, state continuity, part/whole proof, reduced-motion semantics.
- Split from Prototype interaction in ControlMux Figma 0.5.2 because timeline/keyframe choreography has a distinct mechanism/proof surface.

## Official Figma/provider basis

- Figma MCP motion context: https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- Variables overview including Timing/Easing: https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes
- Figma Motion timeline: https://help.figma.com/hc/en-us/articles/41405906446999-Use-the-Figma-Motion-timeline

Provider documentation is evidence for current behavior, not ControlMux ontology. Re-check current tool schema/typings/runtime when Motion APIs, feature gates, export-video support, or editor scope affect execution.

## Installed Figma plugin Skills compared

- `figma-use-motion`: timeline/keyframes/animation styles/easing, feature gating, video proof.
- `figma-implement-motion`: design-context + motion-context merge, transform/path edge cases, production handoff. Its production implementation job remains inside current `figma-design-to-code`; a dedicated ControlMux motion-to-code Skill is still an eval candidate.

## Public Agent Skill patterns compared

Public motion/animation skills support separate temporal expertise but do not define ControlMux's capability boundary. Community sources remain comparison evidence only.

## What this Skill distilled

- **Adopted:** approved transition -> animated subject/property -> phases/keyframes -> timing/easing/cohort -> temporal proof.
- **Explicitly not copied:** prototype reaction/state-machine authoring; decorative animation recipes; screenshot-as-time-proof.

## Revalidation triggers

Motion feature flags/APIs, Timing/Easing variables, structured motion context, video export, animated-component/library behavior.
