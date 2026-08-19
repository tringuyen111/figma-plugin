# Distillation provenance

Use this file only when auditing/updating **figma-visual-system**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- Product Design color composition + material/depth/shape: SYSTEM vs PERCEPTUAL COLOR, attention budget, minimum sufficient depth cues.

## Official Figma/provider basis

- [Figma MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Variables overview](https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-use` WWDS Paint/Effect Styles and variable binding; provider surfaces for shader effects/fills are treated as optional upstream capability.

## Public Agent Skill patterns compared

- Figma/Southleft design-system tooling reinforces separating reusable styles/tokens from visual QA.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Compose hue/temperature/lightness/chroma/area/repetition with surface and depth roles; bind reusable Figma Styles/Variables only after role ownership is clear.
- **Explicitly not copied:** Do not clone shader/provider breadth into the local kernel without a ControlMux-specific governance/verification advantage.

## 0.5.4 craft exemplar distillation

The 0.5.4 worked cases use a rendered operational companion specimen to teach occupied chroma area, repetition, neutral-field hierarchy, shape specificity, and overlay-only elevation. Literal colors are specimen evidence, not a product palette recommendation.

Project-level render/self-review evidence lives under `design/exemplars/`; the Skill remains independently usable because the full transferable reasoning is local in `references/golden-teaching-cases.md`. Example self-review is not independent expert qualification or behavioral Skill uplift.

## Revalidation triggers

Shader/effect/fill support, style APIs, plan/beta gates.
