# Code-to-Design Reconciliation

## Mapping categories

For every material code/design concept classify:

- `MATCH`: same semantic contract and representation is healthy.
- `REUSE`: Figma asset already expresses the code role.
- `UPDATE_FIGMA`: code is authoritative and Figma is stale.
- `DESIGN_AHEAD`: Figma authority intentionally leads code; do not overwrite.
- `TRANSLATE`: same job but representation/API differs.
- `CREATE`: no valid design representation exists.
- `OBSOLETE`: old Figma/code concept is no longer active.
- `CONFLICT`: authority cannot be resolved from evidence.

## Authority matrix

Resolve conflicts using the source that owns the disputed truth, not file freshness:

| Dispute | Strongest normal evidence |
|---|---|
| shipped behavior/API | production source + runtime |
| approved future UX | approved Product/Design truth |
| reusable Figma contract | current library/component/variable source |
| design-to-code identity | verified Code Connect + code source |
| visual appearance | rendered production + approved visual reference |

If authority differs by dimension, preserve a split verdict rather than selecting one artifact globally.

## Representation translation

Translate responsibility, not implementation syntax:

```text
CSS/JS token role -> Figma variable/style role
component public API -> component property/slot/variant contract
DOM/view nesting -> semantic/layout/plane ownership, not literal frame nesting
runtime pseudo-state -> designer-facing state/variant only when useful
children/composition -> Slot or nested component when semantics warrant
```

A capture can prove pixels/content but does not prove native Figma system structure.

## Proof targets

A high-confidence sync should cover:

- token/mode values and aliases;
- typography metrics with real font;
- component API/property correspondence;
- representative states/long content;
- layout at at least one pressure condition;
- visual comparison against the running implementation when available.

## Re-entry

When the design matches visually but is structurally weak, re-enter at semantic/system translation instead of polishing the screenshot. When the structure is reusable but appearance drifts, re-enter at rendered comparison without replacing correct system ownership.
