# Distillation provenance

Use this file only when auditing/updating **figma-components**, resolving a conflict with current provider behavior, or explaining why this Skill makes a specific decision. It is provenance, not runtime ceremony.

## Derived design/method basis

- OpenAI Skill Creator: concise SKILL.md control surface, progressive loading, conditional references, and deterministic helpers only where they improve reliability.
- SDLC Intelligence / skill-plugin-engineering: accountable outcome, independent Skill boundary, decision mechanism, failure/correction logic, exact evidence, and provider-interface separation.
- Product Design system composition + construction: semantic job → anatomy → slots → controlled variation → instances → overrides.

## Official Figma/provider basis

- [Component properties](https://help.figma.com/hc/en-us/articles/5579474826519-Explore-component-properties)
- [Slots vs swaps vs variants](https://help.figma.com/hc/en-us/articles/38741465279895-The-difference-between-slots-instance-swaps-and-variants)
- [Figma: create Skills for MCP](https://developers.figma.com/docs/figma-mcp-server/create-skills/)

Provider documentation is evidence for current Figma behavior; it is **not** the ControlMux ontology. Re-check current docs/typings/runtime when a provider detail can change execution.

## Installed Figma plugin Skills compared

`figma-use` WWDS components + `figma-generate-library`: property definitions, nested instances, variant sets, descriptions, library reuse.

## Public Agent Skill patterns compared

- Southleft component-set analysis and FigmaLint show state/property/token/readiness analysis as useful evidence.
- [Figma MCP Server Guide](https://github.com/figma/mcp-server-guide)
- [OpenAI Figma plugin Skills](https://github.com/openai/plugins/tree/main/plugins/figma/skills)
- [Southleft Skills for Figma](https://github.com/southleft/skills-for-figma)
- [Warp Figma Skills](https://github.com/warpdotdev/figma-skills)

Community sources are comparison evidence, not authority for Figma behavior.

## What this Skill distilled

- **Adopted:** Five property types including Slot; preferred instances for constrained swaps; descriptions/semantic naming as agent/dev context; inspect representative consumers before propagation.
- **Explicitly not copied:** Do not componentize visual repetition alone; do not use variants as a workaround for flexible slots.

## Revalidation triggers

Slot/property Plugin API support, library behavior, component metadata surfaces.

## 0.5.5 interactive-component composition

Revalidated against current Figma Interactive Components behavior: component variants can carry Change-to interactions inherited by instances; a direct instance interaction with the same trigger can take precedence, while different triggers can coexist. ControlMux keeps state vocabulary/component API ownership separate from prototype transition ownership.

## 0.5.6 behavioral teaching depth

Revalidated exact component-property API keys (including generated `#...` suffixes for non-variant properties), current Slot settings/limit-violation semantics, and the fact that instance `setProperties()` is not the mechanism for SLOT content. Detailed Golden Teaching Cases now teach interactive Toggle composition, constrained Slot proof, and consumer migration; Figma behavioral execution remains `NOT_RUN`.
