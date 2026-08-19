# Distillation provenance

Use this file only when auditing/updating **figma-design-system**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- Product Design System composition + SDLC capability composition: stable invariants, source-of-truth, propagation scope, proof.

## Official Figma/provider basis

- [Create Skills for Figma MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)
- [Agent-friendly Figma structure](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-generate-library`: discovery first, get_libraries/search_design_system, foundations before components, validation after each bounded unit.

## Public Agent Skill patterns compared

- Figma official guide plus Southleft design-system Skills show focused token/component/audit workflows; ControlMux keeps whole-system governance as the owner here.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Discover existing code/Figma/libraries first; reconcile reuse/update/create/conflict; foundations before dependents; naming/descriptions/annotations improve agent context.
- **Explicitly not copied:** Do not make a new mini-system inside a feature or mirror code structure literally into Figma.

## Revalidation triggers

Library search/import/publish behavior, plan gates, new design-system MCP tools.

## 0.5.5 library lifecycle

Revalidated current Plugin API library mechanics: published identity/key import, publish-status inspection, and `teamlibrary` permission for enabled library-variable discovery. Publication and library enablement remain user/Figma authority boundaries. Cross-file consumption/migration is delegated to `figma-design-to-design`.
