# Golden Teaching Cases — Figma Visual System

Use these examples to learn **perceptual composition plus reusable system mapping**. Literal colors are specimen values, not universal palette recommendations.

## Contents

- [Case 1 — Quiet operational field](#case-1--quiet-operational-field-with-selective-semantic-chroma)
- [Case 2 — Shadows masking hierarchy problems](#case-2--failurerecovery-adding-shadows-to-solve-a-surface-hierarchy-problem)

## Case 1 — Quiet operational field with selective semantic chroma

### Visual question

The ControlMux companion shows connection health, request quality, request types, success/failure, and a continuous log. Many states have colors available, but the screen is primarily a sustained operational workspace, not a marketing surface.

The challenge is to keep semantic color useful without creating a rainbow dashboard.

### Weak first pass

A generic agent often does this:

- green Connection card when healthy;
- blue Requests card;
- green Success metric card;
- purple Latency metric card;
- every READ row blue-tinted;
- every WRITE row amber-tinted;
- every EXPORT row purple-tinted;
- gradients/shadows added to make the UI “modern.”

Every mapping can be individually understandable while the whole composition is noisy. The problem is **occupied chroma area and repetition**.

### Expert system/perception split

First define system roles:

```text
Surface/Canvas
Surface/Base
Surface/Subtle
Border/Default
Text/Primary
Text/Secondary
State/Healthy
State/Failure
Request/Read
Request/Write
Request/Export
Elevation/Overlay
```

Then separately decide how much of each role should be visible in this scene.

A concrete light specimen:

```text
Canvas            #F4F4F7
Base surface      #FFFFFF
Subtle field      #F8F8FA
Default line      #DEDEE4
Primary text      #111114
Secondary text    #6F6F78
Healthy           #218258
Failure           #B94248
Read              #2D6DB6
Write             #A66316
Export            #7755A7
```

These values are examples. The important relation is:

```text
large occupied area -> quiet neutrals
small semantic marks -> controlled chroma
failure/exception -> enough salience to interrupt scanning
```

### Where color is allowed to carry mass

#### Connection healthy

Use green on a small dot/icon/status text. Keep the Connection surface neutral.

Why: healthy is the normal background condition. Painting the entire surface green spends a large attention budget on “nothing needs action.”

#### Request types

Use blue/amber/purple on compact kind marks and the request-mix bar. Keep row backgrounds neutral.

Why: type is useful for scan categorization but should not dominate the label/status/latency comparison.

#### Failure

Use red on status/error detail and optionally a very light local error field. Failure is exceptional and deserves stronger contrast than healthy state, but avoid turning the entire page red from one failed row.

### Surface hierarchy

For the base scene, try plane separation in this order:

```text
canvas neutral
-> base surface lightness difference
-> thin low-contrast border/divider
-> clipping/silhouette
```

No base card needs a large shadow if lightness/border already separates it from the canvas.

Reserve a real shadow/scrim combination for the request-detail overlay because that is an actual raised/transient plane.

### Shape grammar

Use shape specificity proportional to object specificity:

```text
large work surfaces   moderate shared radius
metric sub-fields     smaller quiet radius, no independent border
kind/status marks     compact rounded shape
icon controls         control-family radius
overlay sheet         larger transient-plane silhouette
```

Do not make every button, row, fact cell, status, and card a capsule. Pill shape has high visual specificity and should be reserved for roles that benefit from it.

### First render comparison

#### Candidate A — higher saturation everywhere

The palette is technically consistent but:

- category color covers ~30–40% of the viewport;
- the eye jumps among blue, amber, purple, green before reading labels;
- normal state has nearly as much salience as failure;
- the Request Log becomes a color mosaic.

Reject.

#### Candidate B — quiet field, chroma in small semantic anchors

- >80% of large area remains neutral;
- category color is concentrated in icons/mix segments;
- healthy is visible but not loud;
- failure can interrupt scanning without recoloring the entire row/page;
- overlay depth is expressed by plane cues rather than colorful fill.

Choose for this operational product.

The exact area percentages are not a universal formula; they are a way to reason about distribution.

### System mapping in Figma

Prefer semantic variables/styles such as:

```text
color/surface/canvas
color/surface/base
color/surface/subtle
color/border/default
color/text/primary
color/text/secondary
color/state/healthy
color/state/failure
color/request/read
color/request/write
color/request/export
```

Composite reusable recipes may become Paint/Effect Styles where appropriate:

```text
Surface/Base
Surface/Overlay
Border/Default
Elevation/Overlay
```

Do not create `Blue 500`, `Blue 500 12%`, `Blue card shadow` as new semantic roles simply because local rendering differs. First test backdrop, opacity, area, and repetition.

### Failure/re-entry example — same green token looks wrong on one surface

Symptom: the healthy green appears muddy in the header status but clean in the Connection icon.

Bad correction: mint `green/header`.

Diagnose:

```text
same token
+ different neutral backdrop
+ different occupied area / border proximity
-> different perceived result
```

Hold the semantic token constant first. Adjust surrounding surface/border/alpha relation if that fixes perception while preserving meaning. Split the token only if the semantic role or durable mode requirement truly differs.

### Accessibility without flattening composition

Check required contrast and non-color state cues. But do not “solve” accessibility by making every text/line high contrast. Secondary hierarchy still needs relative quietness while meeting obligations.

For request status, pair color with text/status glyph so meaning survives reduced color discrimination.

### Anti-copy rule — expressive brand/marketing surface

A launch or onboarding hero may intentionally allocate much more chroma, imagery, and expressive shape because its job is emotional orientation and brand expression. The operational ControlMux distribution should not be copied there.

Transfer the rule:

```text
task hierarchy + repetition + occupied area -> visual distribution
```

not “neutral backgrounds are always more professional.”

---

## Case 2 — Failure/recovery: adding shadows to solve a surface hierarchy problem

### Situation

Three nested panels use nearly identical lightness. The agent adds progressively stronger shadows to each nested panel so the layers are distinguishable.

### Why it fails

The design is inventing 3D elevation to compensate for unresolved surface roles. Every shadow adds depth semantics and visual noise.

### Better correction

1. name the real plane/surface roles;
2. remove any boundary that has no independent object/plane meaning;
3. separate remaining roles with lightness/temperature or divider first;
4. add shadow only to the plane that actually floats/overlays.

The result often uses **fewer** effects while creating a stronger depth model.
