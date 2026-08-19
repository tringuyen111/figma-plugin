# Distillation provenance

Use this file only when auditing/updating **figma-scene**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- Product Design material/depth/shape + construction system: semantic containment ≠ plane/input graph; silhouette and surface ownership.

## Official Figma/provider basis

- [Agent-friendly Figma structure](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Figma MCP tools](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-use`: node types, Frame/Group/Section behavior, clipping/transform/plugin API mechanics.

## Public Agent Skill patterns compared

- Deep-component inspection Skills in `southleft/skills-for-figma` show the value of recursive scene evidence without making traversal itself the design ontology.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Reason from TREE/BOUNDS/PLANE/SURFACE/INPUT/TRANSFORM; use semantic names; reserve Frame/Group/Section for their real responsibilities.
- **Explicitly not copied:** Do not infer depth from z-index/shadow alone or create one Frame per visual cluster.

## 0.5.4 craft exemplar distillation

The 0.5.4 worked cases use request-detail drill-down to teach semantic containment versus transient plane/input priority, silhouette ownership, and minimum sufficient depth cues. The bottom-sheet form is conditional evidence, not a universal secondary-detail pattern.

Project-level render/self-review evidence lives under `design/exemplars/`; the Skill remains independently usable because the full transferable reasoning is local in `references/golden-teaching-cases.md`. Example self-review is not independent expert qualification or behavioral Skill uplift.

## Revalidation triggers

New scene node types, effects/material APIs, editor-specific constraints.
