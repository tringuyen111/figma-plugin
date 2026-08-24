---
name: figma-scene
description: "Model, inspect, repair, or author Figma scene structure and 2.5D plane relationships. Use for Frame/Group/Section choice, layer ownership, clipping, masks, z-order, overlays, fixed/scroll relations, silhouettes, or transforms. Own structural/depth semantics; not child layout, tokens, component APIs, typography, or product behavior."
---

# Figma Scene

Own the native **scene and plane representation** of a Figma artifact. Treat Figma as a 2D affine scene with 2.5D visual/input relations, not as a flat list of rectangles.

## Terminal job

Given product/design truth plus current Figma evidence, produce or repair a scene in which structural containment, clipping, surface ownership, stacking, and transient planes express the intended relationships. Complete when the relevant native objects and plane relations are inspectable and the visible result is checked at the required scale.

## Decision advantage

This Skill earns its place by separating **semantic nesting, construction ownership, and 2.5D plane relations**. The visible symptom is rarely the owner: clipping may belong to an ancestor Frame, silhouette to one surface, and overlay/input priority to another plane. Diagnose the earliest relation that explains the defect before adding another wrapper, radius, shadow, or z-order exception.

## Skill I/O contract

**Minimum input**
- exact node/region and the scene question to resolve;
- parent/child bounds plus the local clipping/visibility/ordering relations involved;
- current rendered evidence only when the claim is perceptual or plane/depth-related.

**Escalate input only when** ownership cannot be inferred from the local subtree: inspect the nearest meaningful ancestor/overlay consumer, then a screenshot at the scale where occlusion/silhouette is judged. Do not dump the full page tree by default.

**Return** the selected owner/representation, causal relation changed or preserved, affected node IDs, and separate `structure` / `visual` proof states when both are material.

## Distillation and provider authority

Read `references/provenance.md` only for audit/provider-conflict work. The scene ontology comes from responsibility/plane reasoning; Figma documentation supplies the available node representations. Semantic layer names, annotations, and clean structure improve agent interpretation, but naming does not replace geometry/plane proof.

When a new Figma material/effect feature appears, classify it first: scene relation, visual-system representation, or provider-only effect. Do not expand this Skill merely because the Plugin API adds another node/effect type.

## System-plane invariants

- Give every structural or plane decision one owner. Container ownership, visible surface ownership, component ownership, and interaction-plane ownership may be different nodes.
- Keep semantic containment separate from visual/input ordering. `belongs-to` does not imply `overlays`, `clips`, `blocks-input-to`, or `persists-over`.
- Choose the smallest representation that owns the real responsibility. Do not create Frames, shadows, or rounded surfaces merely because the tool offers them.
- Widen a change from instance -> repeated scene role -> shared system only when neighboring evidence supports that propagation.
- A clean layer tree is not visual proof; a good screenshot is not structural proof.

## Scene model

Hold these relations separately:

```text
TREE       parent / child / sibling order
BOUNDS     explicit bounds / child extents / coordinate context
PLANE      behind / above / clips / overlays / occludes / persists
SURFACE    silhouette / fill / stroke / radius / effect owner
INPUT      receives first / blocks / focus relation when represented
TRANSFORM  translation / rotation / scale / affine geometry
```

Use `references/scene-depth-method.md` when plane, material, silhouette, or transform reasoning is material.

## Representation selection

### Frame
Use a Frame when a region owns explicit bounds, clipping, a coordinate/surface context, prototype/container behavior, or child layout responsibilities. A Frame may be visually transparent; do not infer a card surface from structural ownership.

### Group
Use a Group when layers only need shared selection/transform/perceptual grouping and their combined child bounds are sufficient. Do not use Group where clipping, responsive bounds, or layout ownership is required.

### Section
Use Section for canvas-level organization and documentation. It is not a substitute for a layout Frame or reusable Component.

### Plane
Create a distinct visual plane only when focus, persistence, occlusion, independent movement, or interaction priority changes. Examples: sticky toolbar, modal + scrim, anchored menu, tooltip, floating inspector.

## Depth and shape method

1. Name the semantic owner.
2. Name plane relations explicitly: `CLIPS`, `SCROLLS_UNDER`, `PERSISTS_OVER`, `OVERLAYS`, `ANCHORS_TO`, `BLOCKS_INPUT_TO` when they are real.
3. Assign silhouette ownership to the first node whose boundary communicates an object/region/plane.
4. Choose the minimum sufficient cue set: spacing/alignment -> surface tone/divider -> clipping/overlap -> shadow/scrim/blur only when the relation still needs it.
5. Inspect nested radii and clipping at actual insets; do not apply one radius formula blindly.
6. Check whole-scene shape mass. Repeated rounded boxes or shadows can erase hierarchy even when each local object is valid.


## Craft calibration

A correct z-order or clipping tree can still produce crude depth. For polished work, judge **relative plane priority, cue economy, silhouette count, radius trajectory, occlusion, and whether visible depth is proportional to the actual focus/persistence relation**. Do not make every structurally valid owner visually loud.

When an overlay, inspector, shell, nested surface, or clipping repair has several plausible scene models, **READ** `references/golden-teaching-cases.md`. The worked cases show typed plane relations, rejected plane forms, exact Figma ownership, render critique, and anti-copy boundaries.

## Native execution discipline

When operating through ControlMux Figma:

- Resolve target with `figma_status` when window/page truth is ambiguous.
- Use `figma_exec` with plain Plugin API JavaScript, top-level `await`, and compact `return` values.
- Inspect parent/type/absolute bounds/clipping/effects/opacity before mutation.
- Prefer async node lookup on dynamic-page files.
- Return every created or materially changed node id.
- After a write, read back structural properties and export/screenshot the smallest scene that proves the visible relation when needed.

## Naming and reuse

Name scene nodes for semantic/plane responsibility, not implementation accidents:

```text
App Shell
Workspace
Routing Table
Inspector Overlay
Modal / Confirm Delete
Menu / Model Selector
```

Avoid `Frame 12`, `Rounded Box`, `Shadow Card`, or names that encode raw coordinates. Reuse a shared Component/Style/Token when a stable repeated contract exists; scene similarity alone does not prove reuse.

## Failure and correction

- **Frame-everything:** remove containers that own no bounds/layout/clip/surface responsibility.
- **Group used as responsive container:** promote the real owner to Frame/Auto Layout without inventing a visible surface.
- **Shadow ladder as z-index:** reopen plane relations; remove fake planes before tuning shadows.
- **Rounded shell + rounded panel + rounded table + rounded header:** move silhouette ownership outward and let children inherit clipping when they do not own an independent object.
- **Overlay looks right but interaction relation is wrong:** model anchor/persistence/input ownership separately from semantic nesting.
- **Local transform nudges everywhere:** inspect shared geometry/component/layout ownership before adding per-instance corrections.

## Boundaries

- `figma-verification` owns a fixed-artifact audit/verdict; this Skill owns authoring/repair decisions in its domain.

- `figma-layout` owns flow/grid/sizing/responsive child geometry.
- `figma-visual-system` owns color/material composition language and reusable visual styles.
- `figma-components` owns reusable component anatomy/properties/instances.
- `figma-design-authoring` owns the higher Product-Design-to-Figma composition decision.
- `figma-native` owns setup and low-level execution correctness.
