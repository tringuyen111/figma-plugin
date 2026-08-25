# Skill distillation map

Current package: `0.7.0` · Protocol: `10`.

This document records where each Skill gets its decision value, what it owns, and what it intentionally does not duplicate.

## Source hierarchy

1. Product, design, and code truth.
2. Capability ownership, authority, propagation, and evidence invariants.
3. Current official or connected Figma provider facts.
4. Installed provider guidance and operational techniques.
5. Public examples and comparison repositories.

Lower sources may teach mechanics or offer counterexamples; they do not override higher authority.

## Canonical map

| Skill | Distilled decision mechanism | Deliberate boundary |
|---|---|---|
| `figma-native` | exact target, native execution, bounded postconditions | no broad design-quality verdicts |
| `figma-scene` | containment vs plane/input relation, silhouette and cue ownership | no decorative depth by default |
| `figma-layout` | geometric responsibility, pressure, adaptation vs recomposition | no fixed-screen pixel copying |
| `figma-tokens` | semantic role to variable/mode/alias and consumer propagation | no equal-value-only deduplication |
| `figma-typography` | text role, font metrics, type mass, and content pressure | no typography as decoration only |
| `figma-visual-system` | system roles plus perceptual color/material/shape distribution | no token-valid-equals-crafted shortcut |
| `figma-components` | semantic job, anatomy, controlled variation, Slots, and reuse | no component-for-every-group rule |
| `figma-prototype` | trigger, condition, action, destination, focus, and recovery graph | no timeline ownership |
| `figma-motion` | subject, keyframes, timing, easing, cohorts, and temporal proof | no navigation/state-graph ownership |
| `figma-design-system` | foundations, naming, libraries, governance, and propagation | no ownership of every consumer migration |
| `figma-design-authoring` | six design graphs compiled into one coherent artifact | no replacement for approved product truth |
| `figma-verification` | fixed target plus expected truth to bounded evidence/verdict | read-only by default; no redesign in acceptance |
| `figma-code-connect` | deterministic component/code mapping and template proof | no general design-to-code implementation |
| `figma-code-to-design` | production semantics reconstructed as native reusable Figma truth | no DOM screenshot tracing |
| `figma-design-to-design` | reuse/wrap/fork/migrate/sync by identity and future update path | no pixel-similarity completion shortcut |
| `figma-design-to-code` | repository mapping, implementation or explicit handoff, runtime/visual proof | no claim that provider context is final code |

## Boundary decisions

Prototype and Motion remain separate because interaction graphs and temporal choreography have different sources, failure modes, and proof. They may compose in one feature without becoming one capability.

Verification remains independent because authoring completes with a changed artifact and self-proof, while verification starts from a fixed artifact and returns a claim-scoped verdict.

Motion-to-code remains a conditional reference under `figma-design-to-code`. Its current status is `REFERENCE_BRANCH_MATERIALIZED_NOT_RUN`; it becomes a separate Skill only if representative executions prove an independent trigger, outcome, and proof boundary.

Export remains a runtime primitive, not a Design Skill. Its value is typed durable egress, timeout/size control, persistence, and compact MCP output.

## Evidence architecture

Each registry entry declares deep editor scope and evidence policy. Frozen cases use these dimensions:

```text
runtime | structure | system-reuse | visual
interaction | temporal | accessibility | translation-parity
```

`figma-verification` never converts an unrequested or unobserved dimension to PASS. Teaching-case self-review, schema validity, local mechanism tests, and behavioral uplift remain separate evidence claims.

## Provider provenance

The connected provider schema is stronger evidence for the active session than a remembered tool list. `src/capabilities/provider-evidence.ts` therefore remains a non-authoritative snapshot with live revalidation required.

Official anchors:

- https://developers.figma.com/docs/figma-mcp-server/tools-and-prompts/
- https://developers.figma.com/docs/figma-mcp-server/create-skills/
- https://developers.figma.com/docs/figma-mcp-server/write-to-canvas/
- https://developers.figma.com/docs/plugins/api/Reaction/
- https://developers.figma.com/docs/plugins/api/ComponentNode/

Public repositories are comparison evidence only.

## Frozen evaluation boundary

`evals/skill-boundaries.json` covers all 16 owners. `evals/skill-value.json` preserves capability quality, proof correctness, and I/O fitness as an ordered comparison. `evals/agent-execution.json` validates local planning/evidence mechanisms without claiming representative behavioral superiority. Their explicit `NOT_RUN` states remain until matching executions occur.
