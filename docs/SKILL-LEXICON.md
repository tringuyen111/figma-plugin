# Skill Semantic Lexicon

Status: `MAINTAINER_REFERENCE_ONLY`

This lexicon exists to prevent semantic drift across the Figma Skill family. It is **not** runtime context and MUST NOT become a file that every Skill loads. Each independently invokable Skill keeps its own decision-critical vocabulary locally; maintainers use this document to keep shared terms compatible across those local definitions.

A term earns a place here only when the distinction changes Agent behavior. Prefer one stable term over rotating synonyms.

## Shared control terms

**AUTHORITY** — the source allowed to determine a truth or decision. Available data, an executable tool, or a visually plausible artifact is not automatically authority. When authorities conflict, preserve the conflict until the stronger source is established.

**ACTIVE DECISION** — the smallest unresolved decision that can change the next action. Keep one Active Decision per deep reasoning packet; separate independent decisions instead of hiding them inside one vague task.

**DECISION-CHANGING DEPTH** — additional context/methodology capable of changing the Active Decision, its evidence requirement, or its correction. Detail that only adds background is not decision-changing depth.

**CHECKPOINT** — the smallest durable state needed to resume after a context/session boundary: current decision, material facts/failures/evidence, and Frontier. A checkpoint is not a dump of all branch context.

**EVIDENCE** — an observed fact, artifact, readback, render, trajectory, or source statement relevant to a claim. Evidence can inform a decision without being sufficient to close it.

**PROOF** — evidence sufficient for one explicit claim at its required fidelity. Proof is claim-scoped: a structural readback can prove structure while visual craft, live runtime behavior, or user fitness remain unproven.

**RELATION** — a dependency that must remain meaningful across allowed change, such as sibling alignment, component-to-consumer contract, token-to-consumer binding, or plane/input ordering. Current coordinates or literal values are evidence about a relation, not the relation itself.

**RESPONSIBILITY** — the semantic or structural obligation an artifact, region, contract, or source must satisfy. Prefer this generic term when no concrete enforcing object needs to be named.

**OWNER** — the concrete object or source that enforces a specific responsibility. Never use bare `owner` when the kind matters; qualify it as **Layout Owner**, source authority, interaction owner, or another explicit relation.

**INVARIANT** — a relation or meaning that must remain true while allowed variation changes. Name the invariant before deciding whether a mutation is a repair or merely a visual patch.

**PRESSURE** — a valid variation capable of falsifying an invariant: content length, locale, viewport, density, state, mode, input, consumer, or another supported condition. Pressure is not an arbitrary pathological edge case.

**CONSUMER** — a real or representative artifact/context that uses the contract under examination. A definition table alone does not prove a reusable contract until representative consumers resolve correctly.

**IDENTITY** — the properties and update relationship that make an artifact the same reusable thing across context or time. Equal appearance does not establish identity.

**PROPAGATION** — the path by which an authoritative change reaches dependent consumers. A local copy with equal values has no propagation relationship unless one is explicitly preserved.

**COMPATIBILITY** — whether a replacement, transfer, or adaptation can preserve the required contract without losing meaning; transformed compatibility must name what changes.

**PARITY** — equivalence across two representations for explicitly named dimensions. Parity is dimension-scoped: visual parity does not imply structural, behavioral, system, or runtime parity.

**CUE ECONOMY** — the minimum perceptual/structural cues required to communicate a real relation or hierarchy. Additional cues must earn a distinct responsibility; more borders, shadows, surfaces, or emphasis are not stronger proof.

**FIDELITY** — the minimum representational detail needed to answer the Active Decision and falsify it. Escalate fidelity when a lower-fidelity representation cannot carry the needed proof, not because more detail is available.

**REPRESENTATION** — the form chosen to make a decision-relevant relation perceivable: prose, flow, graph, table, specimen, wireframe, render, or another faithful form. Representation serves reasoning; it is not a fixed route from label to output type.

**RE-ENTRY** — the earliest decision point that must be reopened when new evidence falsifies an assumption or downstream result. Repair from re-entry instead of stacking local compensations over a bad premise.

**FRONTIER** — the first unresolved decision or obligation whose resolution can materially advance the job. Keep future detail shallow until it reaches the frontier.

## Design relation terms

**ADAPTATION** — preserving the same semantic relation while geometry, disclosure, values, or presentation adjust under pressure.

**RECOMPOSITION** — changing a relation or structural arrangement because adaptation alone cannot preserve the invariant. Do not use `recomposition` as a synonym for resizing or cosmetic polish.

**PLANE** — a depth/input/focus relation such as persistent, overlay, modal, occluding, or anchored behavior. Plane is about interaction/depth responsibility, not merely a visually raised rectangle.

**SURFACE** — a visible material region expressed through tone, border, fill, depth, or clipping. A Surface does not automatically define semantic grouping, component identity, or Plane behavior.

## Anti-drift rules

- Use `RESPONSIBILITY` for a generic obligation and a qualified `OWNER` only when a concrete enforcing object/source matters.
- Keep `EVIDENCE` distinct from `PROOF`; do not upgrade a claim because evidence merely exists.
- Keep `PRESSURE` tied to supported variation and an explicit `INVARIANT`.
- Keep `ADAPTATION` distinct from `RECOMPOSITION`.
- Keep `SURFACE` distinct from `PLANE`, semantic container, and component.
- A Skill may define a narrower local term when its accountable job needs one; the local definition must not silently contradict these shared meanings.
