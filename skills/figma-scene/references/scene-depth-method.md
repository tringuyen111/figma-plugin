# Scene, Plane, Depth, and Shape Method

## Decision graph

```text
semantic relation
  -> structural owner
  -> plane relation
  -> silhouette owner
  -> minimum visible cue
  -> native Figma representation
  -> part + whole proof
```

## Plane vocabulary

Use only relations supported by the artifact:

- `CONTAINS` / `GROUPS_WITH`: semantic/perceptual belonging.
- `CLIPS`: visible child output is bounded by an owner.
- `SCROLLS_WITH` / `PERSISTS_OVER`: viewport persistence.
- `OVERLAYS` / `OCCLUDES`: front/back visibility.
- `ANCHORS_TO`: transient placement relative to a trigger.
- `BLOCKS_INPUT_TO` / `RECEIVES_INPUT_BEFORE`: interaction priority when relevant.
- `FOCUS_WITHIN` / `RETURNS_FOCUS_TO`: focus ownership when represented by the design/prototype.

## Minimum cue ladder

Prefer the lightest cue that communicates the real relation:

1. proximity, alignment, whitespace;
2. surface tone or divider;
3. clipping or silhouette boundary;
4. overlap/occlusion;
5. shadow or scrim;
6. translucency/blur;
7. transform/scale/motion when the relationship itself changes.

Multiple cues should agree. A recessed-looking dark surface plus a large floating shadow is often contradictory.

## Silhouette ownership

Trace:

```text
role -> boundary claim -> owner -> shape family -> radius/stroke/effect
```

A child earns an independent silhouette when it is a separate object/action scope, a distinct plane, an explicit state shape, or an authoritative Design-System component. Otherwise inherit the parent boundary or use a weaker cue.

## Nested radius check

Inspect together:

- outer radius and character;
- inset distance;
- inner radius trajectory;
- border thickness;
- contrast between surfaces;
- whether a second boundary is needed at all.

Correct swollen/pinched corners by fixing role/geometry, not by adding shadow.

## Part/whole proof

Inspect:

1. component/region close-up;
2. whole scene at intended viewport;
3. repeated consumer or adjacent plane;
4. light/dark or material state when supported.

The claim is partial if only structure or only screenshot evidence exists for a change that requires both.
