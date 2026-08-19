# Distillation provenance

Use this file only when auditing/updating **figma-design-to-code**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- SDLC source/evidence binding + Product Design handoff: preserve semantic/system invariants, then hand implementation ownership to engineering.

## Official Figma/provider basis

- [Figma MCP tools / get_design_context](https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/)
- [Agent-friendly Figma structure](https://developers.figma.com/docs/figma-mcp-server/structure-figma-file/)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-design-to-code`: get_design_context first, treat output as reference/untrusted data, reuse real project components/tokens, preserve real assets.

## Public Agent Skill patterns compared

- Figma `figma-implement-design` and OpenAI curated Figma Skills reinforce codebase adaptation rather than pasting generated reference code.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Figma context → verify mappings → inspect target code system → map components/tokens/assets/motion → implement → runtime/visual proof.
- **Explicitly not copied:** Do not paste generated React/Tailwind blindly or author substitute vector assets.

## Revalidation triggers

get_design_context output schema, Code Connect hints, asset URL lifetime/transport, motion context.

## 0.5.5 output contract

Distilled provider design context into an explicit terminal-output boundary: `IMPLEMENT` returns actual repository changes plus proof; `HANDOFF` returns a bounded Design Translation Packet. Provider-generated code/context remains input evidence rather than the deliverable.

## 0.5.6 deterministic handoff packet

The HANDOFF path now has a JSON Schema and stdlib validator for the Design Translation Packet. This stabilizes machine-consumable output shape without changing the capability rule: `IMPLEMENT` must return actual repository changes/proof, and schema-valid `HANDOFF` remains semantically unproven until mappings and obligations are verified.
