# Design System Audit Matrix

Use this matrix to record only material findings.

| Plane | Identity/source | Reuse unit | Variation | Consumer proof | Conflict |
|---|---|---|---|---|---|
| Variables | collection/path | variable/alias | mode/brand/density | bound nodes | |
| Typography | text role/style | Text Style | mode/platform/scale | real text slots | |
| Visual | semantic visual role | variable/style | theme/state | representative surfaces | |
| Component | semantic job | component/set | property/slot/variant | instances/screens | |
| Layout | layout relation | component/convention/token | density/viewport | stressed consumer | |
| Prototype | interaction/state path | interactive component/reaction contract | state/input/context | reachable path | |
| Motion | transition role | variable/style/component | state/reduced motion | phase evidence | |
| Code bridge | code/design mapping | Code Connect/code syntax | platform/framework | code consumer | |

## Reconciliation decision

For each material row choose:

```text
REUSE | UPDATE | CREATE | DEPRECATE | SPLIT_ROLE | MERGE_ROLE | CONFLICT
```

The disposition must name the owning source and affected consumers. `CREATE` is not the default when search finds no exact name; first test semantic compatibility and alias/extension options.

## Scope ladder

When resolving a defect, choose the smallest supported scope:

```text
INSTANCE -> COMPONENT -> SEMANTIC_ROLE -> FOUNDATION -> DISTRIBUTION
```

Do not widen without evidence from neighboring consumers.

## Propagation test

Before a shared change, sample at least one consumer that depends on the same invariant and one materially different context if the role claims to span that context. If the change needs repeated local exceptions, reopen the system boundary instead of normalizing the exceptions.

## Publication boundary

A source object being correct locally does not prove library distribution readiness. Keep local construction proof, system coherence, publication authority, and downstream consumer update state separate.
