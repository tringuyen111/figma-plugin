# Golden Teaching Cases — Figma Scene

Use these cases to learn **scene/plane/silhouette ownership**. Do not copy “bottom sheet” as a universal pattern. Transfer the relation that made the plane necessary.

## Contents

- [Case 1 — Request detail as a transient plane](#case-1--request-detail-as-a-true-transient-plane)
- [Case 2 — Nested radii with wrong semantics](#case-2--failurerecovery-nested-radii-that-are-mathematically-tidy-but-semantically-wrong)

## Case 1 — Request detail as a true transient plane

### Scene question

The user taps a request row in the compact ControlMux companion and wants queue time, execution time, capability attribution, trace id, payload size, and error detail when present.

The selected request is semantically part of Request Log, but its detail temporarily needs higher visual/input priority without replacing the user’s current place in the log.

This is where semantic containment and plane relation diverge.

### Weak implementations

#### Weak A — expand the row inline

The row grows from ~50px to ~220px and pushes neighboring requests out of view.

Why it fails: request detail is transient focus, not normal row anatomy. Expanding inline damages the log’s comparison density and changes geometry for every investigation.

#### Weak B — permanent diagnostics panel

Add a “Diagnostics” card under Requests and populate it with the selected request.

Why it fails: a secondary detail mode becomes a permanent primary region, consuming space even when no request is selected.

#### Weak C — draw a floating rounded rectangle without plane semantics

The screenshot looks like a modal, but the object is simply placed over the page with no overlay/focus relationship.

Why it fails: visual overlap alone does not prove `BLOCKS_INPUT_TO`, focus ownership, anchor/recovery, or prototype state.

### Expert plane model

Model the selected-request state as:

```text
Request Row
  --TRIGGERS--> Request Detail Plane

Request Detail Plane
  --OVERLAYS--> Base Companion Scene
  --OCCLUDES--> lower viewport content
  --BLOCKS_INPUT_TO--> Base Companion Scene
  --RECEIVES_INPUT_BEFORE--> Base Companion Scene
  --FOCUS_WITHIN--> detail controls
  --RETURNS_FOCUS_TO--> originating Request Row
```

The detail is semantically “inside” the request investigation workflow but visually/input-wise above the page.

### Alternative plane forms

#### Side inspector

Good when the host has persistent horizontal workspace and comparison between base content and detail should remain simultaneous.

Reject for the compact companion because width is scarce and the inspector would force the working log into an unusable narrow column.

#### Full navigation destination

Good when detail has deep independent workflow and should be addressable as a new location.

Reject because this request detail is short-lived inspection and the user should return to the same log position.

#### Bottom sheet / compact overlay

Choose because it:

- preserves narrow width;
- keeps base context visible under a scrim;
- supports short detail payloads;
- has clear dismiss/recovery behavior;
- communicates transient focus rather than navigation.

### Concrete scene construction

Use the compact specimen only to make ownership visible:

```text
Base Scene [Frame 420x844]
  ... normal content ...

Prototype/overlay state:
  Scrim
  Request Detail Sheet
```

#### Scrim

```text
owner: overlay state, not the page background
bounds: viewport
fill: neutral dark at ~0.28 alpha in the specimen
input: blocks base interaction
```

The alpha is not a style recipe. Tune it against actual surface lightness so base context remains legible but clearly de-prioritized.

#### Sheet

```text
Frame: Request Detail Sheet
  anchored to bottom
  horizontal inset: ~9 specimen px
  bottom inset: ~9 specimen px
  vertical Auto Layout
  clipContent: true
  radius: ~22 specimen px
  fill: Overlay surface
  one overlay elevation/shadow
```

The **sheet owns the silhouette**. Its children normally do not need their own outer borders/radii.

Inside:

```text
Handle                    minimal affordance
Header                    title + close action
Request hero              kind + label/time + status
Metric field              2-column quiet sub-surface
Technical rows            one shared list surface / dividers
Error block               only when error exists
```

Do not turn Total, Queue, Execution, Attempt, Capability, Trace, and Payload into seven independent cards.

### Silhouette and depth reasoning

Use the minimum cue stack that communicates the plane:

```text
scrim + overlap + one overlay silhouette + one elevation
```

Do **not** also add heavy borders, inner shadows, blur on every nested cell, and a second raised surface. Those cues would exaggerate the same relation repeatedly.

### First render critique

Reject if:

- the scrim is so dark that the user loses place/context;
- sheet shadow is weaker than shadows on base cards, contradicting plane priority;
- every metric/technical row owns another rounded white card, producing “card in card in card”;
- close control has more visual mass than the request status/identity;
- sheet content exceeds the available height with no internal overflow policy;
- the base remains interactive or focus recovery is undefined.

### Failure/re-entry

Symptom: the sheet “looks detached and floaty.”

Bad correction: increase shadow blur to 60px.

Diagnose:

```text
plane relation
-> sheet already overlaps correctly
-> scrim barely changes base priority
-> base surface contrast remains equally strong
```

Correct the **relative plane cues** first: scrim/base de-emphasis and overlay surface relation. Increase shadow only if overlap/depth remains ambiguous after those cues are correct.

Symptom: sheet feels like a stack of boxes.

Diagnose silhouette ownership: outer sheet already owns the transient object boundary. Replace nested card borders with spacing, subtle sub-surface tone, and dividers where the child does not own an independent object.

### Prototype relation

When executable interaction is part of the artifact:

```text
row click -> open overlay
close / Escape / scrim policy -> dismiss
focus enters sheet
on dismiss -> focus returns to originating row
```

`figma-scene` owns the plane model; `figma-prototype` owns executable trigger/action/focus-state path.

### Anti-copy rule — persistent desktop inspector

In a wide desktop workspace where users select layers continuously and need detail visible while comparing the canvas, a persistent right inspector may be the correct plane. Turning that into a bottom sheet would hide context and add needless modal churn.

Transfer:

```text
focus/persistence/input relation -> plane choice
```

not:

```text
secondary detail -> bottom sheet
```

---

## Case 2 — Failure/recovery: nested radii that are mathematically tidy but semantically wrong

### Situation

A shell radius is `20`, inner panel radius is `16`, cell radius is `12`, and chip radius is `999`. The inset geometry looks mathematically smooth.

### Why it can still fail

All four layers claim separate silhouettes even though the inner panel and cells are only grouping/content regions. The hierarchy reads as four nested objects.

### Expert correction

1. identify which level is the real bounded object;
2. let descendants inherit clipping or use dividers/spacing;
3. retain independent silhouette only for a true child object/action/status;
4. then tune radius trajectory for the boundaries that remain.

Geometric consistency is subordinate to **boundary ownership**.
