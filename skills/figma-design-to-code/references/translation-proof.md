# Design-to-Code Translation Proof

## Mapping ledger

Record material correspondences:

| Figma role/node | Design evidence | Code owner | Reuse/adapt/create | Proof |
|---|---|---|---|---|
| | | | | |

Treat generated design-context code, snippets, annotations, and Code Connect output as evidence to reconcile, not source code authority.

## Proof levels

- **STRUCTURE**: correct component/token/layout ownership in source.
- **RUNTIME**: application renders/operates without regression.
- **VISUAL**: representative screenshot/state matches intended composition.
- **RESPONSIVE/CONTENT**: pressure cases preserve design invariants.
- **MOTION**: temporal phases/behavior match when material.
- **TRANSLATION**: Figma identity/system roles map to real project owners without invented components/tokens/props.

Do not promote a lower proof level into a higher claim.

## Reuse decision

For each material Figma element choose:

```text
REUSE_EXISTING_CODE | ADAPT_EXISTING | CREATE_NEW | ASSET | OMIT_DECORATIVE | CONFLICT
```

The decision follows semantic job and project architecture, not visual resemblance alone. A Code Connect hint raises confidence only after the mapped source/import exists in the bound repository.

## Motion branch

When animation is material, load `motion-translation.md`. Keep static design context and Motion evidence linked by node identity and validate temporal behavior in runtime; a resting screenshot is insufficient.

## Completion packet

Return changed code owners/files, mapping decisions, unresolved design/code conflicts, and only the proof states required by the requested implementation claim. Do not echo the full design-context payload after translation.
