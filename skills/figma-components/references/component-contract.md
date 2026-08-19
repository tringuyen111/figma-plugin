# Component Contract Method

## Boundary falsifier

A candidate is probably not one component when variants require materially different:

- semantic job;
- anatomy/slot ownership;
- primary action ownership;
- state semantics;
- content pressure rules;
- evolution/release cadence.

Shared color, radius, or title/body/action shape is insufficient.

## Property decision table

| Need | Prefer |
|---|---|
| edit a string | Text property |
| optional layer/feature | Boolean property |
| replace one nested component | Instance Swap + preferred instances |
| flexible/repeating/freeform region | Slot |
| controlled state/type/size dimension | Variant property |
| theme/density/value change across many consumers | Variable/mode, not component permutation by default |

## Slot contract

A Slot should define:

- semantic purpose;
- allowed/recommended content kind;
- layout ownership and gaps;
- min/max count when material;
- pressure/wrap/reflow expectations;
- interaction ownership;
- whether nested component properties remain available;
- preferred instances when useful.

## Proof set

Validate at least:

- default instance;
- every material state/type axis;
- long/short text pressure;
- optional/empty slot/property state;
- one dense repeated consumer;
- one materially different context/density/theme if supported;
- instance update propagation after changing the main component.
