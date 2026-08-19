# Distillation provenance

Use this file only when auditing/updating **figma-layout**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- Product Design construction + spatial composition + responsive constraint-space reasoning.

## Official Figma/provider basis

- [Agent-friendly Figma structure](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Official figma-use Skill](https://github.com/figma/mcp-server-guide/tree/main/skills/figma-use)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-use`: Auto Layout preference, sizing enum/context rules, `createAutoLayout` helper where supported.

## Public Agent Skill patterns compared

- Published screen-authoring Skills consistently discover/reuse layout systems before hardcoding geometry.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Layout owner → flow/grid → sizing → spacing → pressure/adaptation; resize/stress proof; distinguish canvas position from child relation.
- **Explicitly not copied:** Do not equate responsive design with device labels or preserve nominal grids after comparison semantics break.

## 0.5.4 craft exemplar distillation

The 0.5.4 worked cases use the real ControlMux request-log pressure problem to teach bounded/flexible field ownership, vertical workspace allocation, and content/viewport stress. Literal widths are specimen evidence, not a reusable breakpoint recipe.

Project-level render/self-review evidence lives under `design/exemplars/`; the Skill remains independently usable because the full transferable reasoning is local in `references/golden-teaching-cases.md`. Example self-review is not independent expert qualification or behavioral Skill uplift.

## Revalidation triggers

Auto Layout/Grid/Layout Guide API changes and helper availability.
