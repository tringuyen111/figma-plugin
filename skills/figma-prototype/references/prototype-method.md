# Prototype method

## Mechanism selection

| Active question | Prefer | Avoid |
|---|---|---|
| move to another context/screen | navigation action | duplicating the destination as a fake overlay |
| transient modal/menu/popover | overlay/open/close relation | a full navigation that loses background context |
| same reusable control changes state | interactive component / change-to | separate unrelated screens for every local state |
| branch based on prototype state | variable + condition | variables that simulate backend truth not needed for the interaction question |
| timing/keyframe choreography | return a temporal-choreography concern | forcing authored-time concerns into reaction wiring |

## State-path matrix

For each path record only material fields:

```text
source | trigger | condition | action | destination | context/focus | recovery
```

Use the matrix to expose missing exits, ambiguous destinations, and state loops before authoring.

## Interaction stress

Check representative cases:

- primary path;
- cancel/dismiss/back;
- disabled/unavailable path;
- alternate input path when essential behavior would otherwise depend on hover/drag;
- repeated component instance when the behavior is shared;
- overlay over the real underlying plane/context.

## Completion evidence

A prototype claim is ready only for the paths actually inspected. Record untested branches as `NOT_RUN` rather than inferring them from neighboring states.
