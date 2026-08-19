# Layout Method

## Comparison matrix

| Need | Primary relation | Figma representation |
|---|---|---|
| ordered reading/action | one-dimensional flow | Auto Layout row/column |
| repeated comparison | stable shared axes | Grid Auto Layout or aligned nested flows |
| wrapping cards/items | flow with wrap/min/max pressure | wrapping Auto Layout/Grid |
| master-detail | two regions with independent pressure | nested layout owners |
| form | label/control/help/error anchors | row/grid + vertical field flow |
| overlay child | anchored independent plane | absolute child inside owning frame |
| reference alignment only | visual guide | layout guide |

## Pressure test

For each layout owner, test at least:

- shortest and longest realistic text;
- one localization/text-scale pressure case when material;
- narrow/wide and short/tall usable geometry;
- empty/loading/error state if it changes geometry;
- repeated dense consumer;
- alternate input target size if pointer/touch both matter.

## Re-entry rule

When a local spacing/sizing fix multiplies into overrides, move outward:

```text
child -> local layout owner -> component anatomy -> semantic token -> whole-scene mode
```

Stop at the smallest level that explains the evidence. Do not broaden to the design system from one broken instance.
