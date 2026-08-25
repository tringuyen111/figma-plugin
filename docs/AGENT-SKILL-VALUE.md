# Agent and Skill value

Current package: `0.7.0` · Protocol: `10`.

## Governing order

```text
1. capability and decision quality
2. proof correctness
3. I/O fitness and runtime performance
```

Token or call reduction cannot compensate for a worse decision, artifact, recovery path, or verdict. Skill and reference length is diagnostic, not a target to minimize.

## What earns Skill complexity

A Skill should provide at least one of:

- a non-obvious domain model or representation;
- a decision mechanism that changes what a generic executor would choose;
- trade-off and failure discrimination;
- a causal re-entry path after contradictory evidence;
- authority, reuse, propagation, or migration reasoning;
- domain-specific completion and proof semantics;
- deterministic support for fragile or repetitive evidence collection.

More Plugin API names are not sufficient when the provider already exposes the mechanics.

## I/O fitness

Optimize the boundary around reasoning:

```text
source truth
-> active decision frontier
-> smallest sufficient evidence
-> provider/local execution
-> bounded result projection
-> decision, mutation, or verdict
-> matching proof
-> compact durable result when needed
```

Relevant metrics include tool calls, retries, escalation count, bridge request/response bytes, queue latency, execution latency, and total latency. Context size may be measured diagnostically but does not authorize deleting decision-critical methodology.

## Evidence selection

| Need | Preferred evidence |
|---|---|
| target or runtime ambiguity | `figma_status` and exact instance/page identity |
| sparse structure | typed query or compact native projection |
| design-system reuse | library, variable, component, and binding identity |
| bounded design-to-code node | exact design context plus repository truth |
| component API | property definitions, anatomy, Slot constraints, main identity |
| visual craft | render at relevant scale and state |
| prototype | reaction graph, reachability, state and recovery path |
| motion | timeline/keyframe evidence; temporal render when the claim requires it |
| native property gap | bounded `figma_exec` projection |

Do not use a cheaper evidence type that cannot prove the claim, or a richer type that cannot change the current decision.

## Accountable local execution

Mutation-capable `figma_exec`, typed `figma_apply`, and `figma_export` require a stable `traceId` and structured `operation`. `capability` and `attempt` remain optional attribution fields.

```text
traceId     stable logical-operation identity
attempt     retry number; sequential independent steps remain 1
operation   label, kind, phase, target, and expected postconditions
```

Retries keep the trace and increment `attempt`. The metadata gate prevents silent intent omission, but it does not grant authority or turn postconditions into PASS. Queue, execution, bytes, errors, and retries remain observed runtime evidence.

## Progressive execution

Complex authoring keeps one active decision/frontier visible and loads only context that can change it. The work-plan schema validates state and evidence; it does not prescribe Skill routing, context budgets, or a fixed representation.

Choose representation by the relation that must be understood. Flow, tree, state diagram, graph, table, bar, component specimen, or wireframe is useful only when it makes a material relation clearer than prose.

## Teaching cases

Golden Teaching Cases encode decision transfer:

```text
product truth
-> mediocre/default attempt
-> expert observation
-> plausible alternatives
-> selection and construction
-> rendered critique
-> causal correction
-> anti-copy boundary
```

Literal values remain specimen evidence. A visually strong self-review is not independent qualification or proof of behavioral Skill uplift.

## Deterministic evidence helpers

Repeated predictable inspection may use bounded scripts or schemas close to the owning Skill. They collect or validate evidence; they do not replace domain judgment. Work plans, transfer packets, ledgers, translation packets, reuse registries, and trajectory logs prove their own structure/mechanism only.

## Evaluation

`evals/skill-value.json` compares same-task arms while preserving the governing order above. `evals/craft-exemplars.json` separates product binding, self-review, independent review, Figma execution, and behavioral comparison. `evals/agent-execution.json` separates tested mechanism from representative agent behavior.

`figma-motion-to-code` remains a conditional reference under `figma-design-to-code` with status `REFERENCE_BRANCH_MATERIALIZED_NOT_RUN`. A separate Skill requires representative evidence of an independent accountable job.
