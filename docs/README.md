# Documentation map

Current package: `0.7.0` · Protocol: `10`.

This directory contains current contracts, not a release diary. Git history owns superseded implementation narratives. Generated evidence, screenshots, logs, packed archives, and build output stay outside the documentation tree.

## Start here

| Document | Purpose |
|---|---|
| `../README.md` | User-facing overview and first setup |
| `DEVELOPMENT.md` | Setup, build, clean, package, and verification lifecycle |
| `SOURCE-ARCHITECTURE.md` | Source ownership and consumed runtime topology |
| `CAPABILITIES.md` | Public tools, canonical Skills, authority, and evidence boundaries |
| `DESIGN-LIFECYCLE.md` | Identity, reuse, transfer, behavior, and design/code outcomes |
| `EXPORT.md` | Durable artifact egress contract |
| `PLUGIN-0.7.0-TYPED-CRUD.md` | Typed entity graph, patch planning, and mutation receipts |

## Future proposals (not implemented)

| Document | Purpose |
|---|---|
| [Grounded Figma-to-code roadmap](proposals/AGENT-GROUNDING-ROADMAP.md) | Proposed design-context normalization, codebase component/token/icon mapping, semantic diff, `figma_exec` policy, distribution UX, and benchmark plan. **No implementation authorized or claimed.** |

## Maintainer contracts

| Document | Purpose |
|---|---|
| `AGENT-SKILL-VALUE.md` | Capability quality, proof correctness, and I/O fitness |
| `CRAFT-EXEMPLARS.md` | Teaching-case quality and anti-copy rules |
| `DISTILLATION.md` | Provenance and ownership map for all 16 Skills |
| `SKILL-LEXICON.md` | Optional shared maintenance vocabulary |
| `TRAJECTORY-EVIDENCE.md` | Observable execution trajectory schema and proof boundary |
| `FIGMA-API-CAPABILITY-MATRIX.md` | Local Plugin API/provider authority boundary |

## Truth rules

- Source and manifests define what can be built.
- Tests and executable checks define only the scope they directly observe.
- `doctor` proves local package readiness, not a connected Figma runtime.
- Live evidence is valid only for its exact target and loaded `bundleRevision`.
- A historical version, timestamp, screenshot, or evidence filename is not current proof.
- External provider surfaces are revalidated from the connected schema or current official documentation before they affect execution.

When a document and executable source disagree, fix the active contract or the implementation explicitly; do not preserve both as competing truth.
