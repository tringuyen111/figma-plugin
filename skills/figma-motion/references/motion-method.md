# Motion method

## Select authored time only when it changes the answer

| Active question | Motion response |
|---|---|
| precise property timing/keyframes | timeline/manual keyframes |
| reusable authored animation identity | animated component / animation style |
| shared temporal values | Timing/Easing variables |
| coordinated multi-node lifecycle | timeline cohort / shared lifecycle |
| only source/final state matters | keep static state specification |
| reaction/navigation/condition logic | hand to `figma-prototype` |

## Phase model

Sample meaningful phases rather than arbitrary frame count:

```text
rest/start -> commit/peak change -> settle -> final
```

Add phases only when stagger, overshoot, masks/path motion, or multi-object choreography changes the diagnosis.

## Temporal invariants

Preserve or deliberately change:

- subject identity;
- origin/destination;
- plane relation;
- action/result feedback;
- transform origin/layout relationship;
- reduced-motion result meaning.

## Reuse falsifier

Equal duration/easing values do not automatically mean one semantic motion role. Conversely, one role may resolve differently for distance/weight/platform constraints. Reuse the temporal relationship, not merely the current literal number.
