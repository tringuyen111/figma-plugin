# Distillation provenance

Use this file only when auditing/updating **figma-native**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- SDLC capability/provider separation + execution evidence rules. Product Design is intentionally non-owner here.

## Official Figma/provider basis

- [Figma MCP tools / use_figma](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Official figma-use Skill](https://github.com/figma/mcp-server-guide/tree/main/skills/figma-use)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-use`: Plugin API authority, page reset, font loading, async discipline, affected-ID return, atomic error recovery, efficient helpers such as query/set/createAutoLayout when the runtime exposes them.

## Public Agent Skill patterns compared

- OpenAI/Figma published `figma-use`; Southleft provider-specific Skills reinforce keeping provider mechanics self-contained.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Keep native execution small; inspect current typings/runtime; use incremental calls; return exact changed IDs/evidence; stop and diagnose on execution error.
- **Explicitly not copied:** Do not copy Figma tool names into ControlMux capability identity. Do not assume helper extensions exist merely because upstream `use_figma` has them.

## Revalidation triggers

Plugin API typings, editor support, helper API availability, MCP execution semantics, and beta gates.

## 0.5.5 typed artifact egress

ControlMux adds local `figma_export` as a deterministic egress primitive rather than a design capability. The primitive is intentionally separate from hosted provider asset/video tools: live provider surfaces remain preferred when their transfer semantics are stronger, while local export guarantees bounded local artifact persistence for PNG/JPG/SVG/PDF/JSON/MP4/GIF/WEBM when supported by the active Figma runtime.


## 0.5.6 export reliability

Durable `figma_export` now persists artifact bytes on the leader before follower RPC, reserves binary-frame overhead in the protocol ceiling, uses an export-specific forwarded deadline, and returns a local artifact descriptor/resource link instead of forwarding base64 artifact bytes. Default persistence is private and ephemeral; chunked Plugin→leader streaming remains not implemented.
