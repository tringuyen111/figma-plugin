# Distillation provenance

Use this file only when auditing/updating **figma-tokens**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- Product Design token relationships + System composition: role before value, propagation scope, primitive→semantic→component only when justified.

## Official Figma/provider basis

- [Variables overview](https://help.figma.com/hc/en-us/articles/14506821864087-Overview-of-variables-collections-and-modes)
- [Agent-friendly Figma structure](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-use` WWDS variables + `figma-generate-library`: collections, modes, aliases, scopes, code syntax, library discovery.

## Public Agent Skill patterns compared

- Southleft token import/export/setup Skills show independent token workflows and interoperability pressure.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Model Color/Number/String/Boolean plus Timing/Easing where relevant; separate Style composite reuse from Variable atomic/contextual reuse; explicit scopes and code syntax.
- **Explicitly not copied:** Do not deduplicate equal values across different semantic roles; do not force three token layers on a genuinely flat source.

## Revalidation triggers

Variable types/scopes, Extended Collections/plan gates, mode limits, library import behavior.
