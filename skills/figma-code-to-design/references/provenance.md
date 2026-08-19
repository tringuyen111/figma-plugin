# Distillation provenance

Use this file only when auditing/updating **figma-code-to-design**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- Product Design system/reuse graphs + SDLC representation separation: production form and design form are complementary, not 1:1.

## Official Figma/provider basis

- [Figma MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Agent-friendly Figma structure](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-generate-design` and `figma-generate-library`: inspect Code Connect/existing screens/libraries, reconcile foundations/components, use web capture only as a reference when appropriate.

## Public Agent Skill patterns compared

- Warp authoring workflow and Figma screen-generation Skills support reuse-first reconstruction rather than primitive tracing.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Extract semantic contracts from code → reconcile with current Figma → materialize reusable native system → compare representative visuals.
- **Explicitly not copied:** Do not convert DOM/component tree 1:1 into Figma layers/components; do not let visual capture become the system source of truth.

## Revalidation triggers

generate_figma_design behavior, library search, Code Connect context, asset transport.
