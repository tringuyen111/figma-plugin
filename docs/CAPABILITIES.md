# Capability architecture

Current package: `0.7.0` · Protocol: `10` · Canonical Skills: `16`.

Figma Plugin separates design judgment, verification, provider evidence, and the local execution kernel.

```text
Product / Design / Code truth
              |
              v
domain Figma Skills
              |
              v
evidence and execution selection
              |
              v
five local MCP tools
              |
              v
local server / bridge / companion
              |
              v
native Figma Plugin API
```

## Public local tools

| Tool | Responsibility | Boundary |
|---|---|---|
| `figma_status` | connection, target, routing, queue, and health | no canvas mutation |
| `figma_query` | typed inventory and design facts | read-only |
| `figma_apply` | planned typed mutations | dry-run by default; explicit confirmation for writes |
| `figma_exec` | native Plugin API escape hatch | accountable operation metadata required |
| `figma_export` | durable artifact egress | local path/metadata result; no large binary text result |

The package does not expose a tool for every Figma noun. Domain meaning remains in Skills; repeated high-risk mechanics can become typed operations behind the existing query/apply surface.

## Canonical Skills

| Skill | Accountable outcome | Deep editor scope |
|---|---|---|
| `figma-native` | setup, target routing, Plugin API execution, bounded readback | Design, FigJam, Slides |
| `figma-scene` | scene structure, plane/depth, clipping, and silhouette ownership | Design |
| `figma-layout` | Auto Layout, Grid, constraints, sizing, and responsive geometry | Design |
| `figma-tokens` | variables, collections, modes, aliases, scopes, and token reuse | Design |
| `figma-typography` | text role, fonts, styles, metrics, and typography geometry | Design |
| `figma-visual-system` | color, material, shape, effects, and depth composition | Design |
| `figma-components` | component APIs, variants, properties, Slots, instances, and reuse | Design |
| `figma-prototype` | triggers, actions, conditions, navigation, overlays, and state paths | Design |
| `figma-motion` | keyframes, timing, easing, timelines, and animated components | Design |
| `figma-design-system` | foundations, naming, libraries, propagation, and governance | Design |
| `figma-design-authoring` | approved product/design truth compiled into a coherent Figma artifact | Design |
| `figma-verification` | fixed-artifact audit with claim-scoped evidence and verdict | Design |
| `figma-code-connect` | deterministic Figma component to code-component mappings | Design |
| `figma-code-to-design` | production semantics reconstructed as reusable native Figma truth | Design |
| `figma-design-to-design` | cross-file reuse, wrap, fork, migrate, or sync with explicit identity | Design |
| `figma-design-to-code` | implementation in the real production codebase or an explicit handoff | Design |

`src/capabilities/skill-registry.ts` is canonical for identity, outcome, deep editor scope, and evidence policy. Manifest editor support does not imply that every domain Skill has deep methodology for every editor.

## Decision and evidence contract

Capability quality and proof correctness precede I/O efficiency:

```text
decision quality
-> proof correctness
-> I/O fitness
```

A Skill earns complexity through a non-obvious decision model, trade-off, failure discrimination, causal re-entry, domain completion semantics, or deterministic evidence support. API vocabulary by itself is not capability value.

Evidence dimensions remain separate:

```text
runtime
structure
system-reuse
visual
interaction
temporal
accessibility
translation-parity
```

Allowed states are `PASS`, `FAIL`, `NOT_RUN`, `INCONCLUSIVE`, `MISSING`, and `BLOCKED`. A passing structural check does not promote an unrun visual, temporal, accessibility, or UAT claim.

## Reuse contract

Choose the reusable unit that owns the actual change:

| Responsibility | Typical Figma mechanism |
|---|---|
| semantic value | Variable, alias, or mode |
| composite visual value | Text, Paint, or Effect Style |
| reusable structure | Component or nested component |
| controlled variation | property, variant, Slot, or Instance Swap |
| interaction behavior | reusable state path and prototype reactions |
| motion behavior | timing/easing role, timeline, animation style, animated component |
| code relationship | code syntax and Code Connect |
| cross-file distribution | published identity, import, and explicit update relationship |

Before creating a new reusable asset, bind identity, owner/source, name, consumers, allowed variation, override rule, propagation, migration/deprecation, and proof.

## Design compilation

Product design authoring keeps six graphs coherent before compiling them to Figma:

```text
semantic
layout
component
style / type
plane / input
state / time
```

Frames, Auto Layout, components, Slots, variables, surfaces, prototype reactions, and motion timelines are selected by responsibility. A visually raised rectangle is not automatically a new interaction plane; token correctness is not visual craft; pixel similarity is not system or behavior parity.

## Components, prototype, and motion

These concerns compose but do not share one owner:

- Components define semantic job, anatomy, properties, variants, Slots, and state vocabulary.
- Prototype defines trigger, condition, action, navigation, overlay, and state progression.
- Motion defines keyframes, timing, easing, cohorts, and temporal settle behavior.

Inherited component reactions and direct instance reactions can compete. Diagnose trigger precedence before duplicating behavior.

## Provider boundary

`src/capabilities/provider-evidence.ts` is an observed snapshot, not a runtime guarantee. When provider capability affects a decision, authority is:

```text
connected provider schema/runtime
> current official documentation
> installed provider guidance
> packaged snapshot or memory
```

The official Figma MCP surface evolves independently of this local five-tool kernel. Prefer a structured provider operation when it gives stronger semantics or proof, but do not redefine the local runtime or Skill topology merely to mirror provider tool names. `runtimeRevalidationRequired` remains true.

Current official anchors:

- https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/
- https://developers.figma.com/docs/plugins/api/figma/
- https://developers.figma.com/docs/plugins/api/ComponentNode/

## Authority boundaries

- `teamlibrary` permission supports inspection of accessible library data; it does not grant silent library publication or enablement.
- A local component key is not proof that a published asset is importable.
- Code Connect publication is distinct from Team Library publication.
- Operation metadata describes intent; it does not authorize a mutation or prove its postconditions.
- `doctor`, schema validation, and bundle smoke do not prove live Figma behavior.

## Evaluation state

`evals/skill-boundaries.json`, `evals/skill-value.json`, `evals/craft-exemplars.json`, and `evals/agent-execution.json` preserve mechanism, self-review, and behavioral comparison as separate claims. Behavioral uplift remains `NOT_RUN` until representative same-task executions establish it.
