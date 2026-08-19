# Distillation provenance

Use this file only when auditing/updating **figma-code-connect**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- SDLC translation-artifact boundary + Product Design component semantics: both Figma and code identities must be independently bound.

## Official Figma/provider basis

- [Template migration guide](https://developers.figma.com/docs/code-connect/templates-migration-guide/)
- [Writing template files](https://developers.figma.com/docs/code-connect/template-files/)
- [Figma MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

Installed `figma-code-connect` and `figma-generate-library` Code Connect guidance: inspect property definitions, resolve code component, map verified correspondences, validate before publish.

## Public Agent Skill patterns compared

- Figma official MCP repository is the primary public Agent Skill reference; community patterns are secondary.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Prefer template files for new work; use current MCP suggestion/context/mapping tools when available; migrate legacy parsers only after verified parity.
- **Explicitly not copied:** Do not delete legacy parser mappings before replacement proof; do not invent prop correspondences from similar names.

## Revalidation triggers

Code Connect CLI/template API, MCP mapping tools, plan/published-component requirements.
