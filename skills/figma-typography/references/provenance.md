# Distillation provenance

Use this file only when auditing/updating **figma-typography**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- Product Design typography-as-geometry: information role, font metrics, measure, localization, numeric scanning, text-slot pressure.

## Official Figma/provider basis

- [Variables overview](https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes)
- [Agent-friendly Figma structure](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-use`: canonical font-load-before-mutation recipe; WWDS Text Styles and variable binding mechanics.

## Public Agent Skill patterns compared

- Design-system authoring Skills treat typography as a reusable foundation rather than one-off text properties.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Information role → Text Style/composite recipe → optional variables → slot/layout pressure; exact font family/style verification before mutation.
- **Explicitly not copied:** Do not encode hierarchy as an arbitrary size ladder or shrink local instances to hide shared slot/layout defects.

## 0.5.4 craft exemplar distillation

The 0.5.4 worked cases use the dense ControlMux companion to teach whole-scene type mass, repeated-role hierarchy, tabular scanning, localization, and font-metric pressure. Numeric weights/metrics are specimen relations and must map to verified current font styles.

Project-level render/self-review evidence lives under `design/exemplars/`; the Skill remains independently usable because the full transferable reasoning is local in `references/golden-teaching-cases.md`. Example self-review is not independent expert qualification or behavioral Skill uplift.

## Revalidation triggers

Bindable text properties, font APIs, variable bindings, fallback behavior.
