---
name: figma-visual-system
description: "Design, inspect, repair, or systematize Figma visual composition. Use for color, paints/styles, surfaces, borders, radius, shadows, blur, material, shape, imagery, and depth when hierarchy or brand character is the main problem. Own perceptual visual decisions; not token taxonomy, type roles, component anatomy, or behavior."
---

# Figma Visual System

Own the **perceptual visual language** that turns semantic/layout/plane truth into coherent visible composition. Treat color and depth as contextual relations, not isolated swatches/effects.

## Terminal job

Produce or repair a visual system where dominant/support/accent distribution, surface hierarchy, color relationships, shape grammar, and depth cues communicate the intended task hierarchy and remain reusable through Figma styles/tokens. Complete when system mapping and rendered composition are both checked.

## Decision advantage

This Skill earns its place by solving **system color/material roles and perceptual composition as separate truths**. A token can be semantically correct yet visually wrong because surrounding hue/temperature, lightness/chroma, occupied area, repetition, opacity, backdrop, shape, and depth cues change perception. Correct the smallest causal visual relation instead of minting a new token/effect for every symptom.

## Skill I/O contract

**Minimum input**
- exact rendered region/state and its semantic visual roles;
- only the tokens/styles/effects that feed those roles;
- background/backdrop context needed to judge perception.

**Escalate input only when** the issue could be systemic: inspect neighboring consumers, alternate mode/theme, or accessibility contrast data as required by the claim. Do not enumerate the entire palette when the question concerns one composition relation.

**Return** perceptual diagnosis, system-role decision, changed/preserved bindings, affected IDs, and separate visual/system/accessibility proof states where material.

## Distillation and provider authority

Read `references/provenance.md` for audit/provider-conflict work. Figma may expose new provider-native visual surfaces (for example shader fills/effects); that does not automatically make them local ControlMux responsibilities. Delegate or mark unsupported unless ControlMux adds a durable governance, reuse, or verification advantage.

Keep composite visual reuse (Paint/Effect Styles) distinct from atomic/contextual values (Variables). A style/token binding can prove system reuse; only rendered contextual inspection can prove perceptual composition.

## System-plane invariants

- Separate `SYSTEM COLOR` (role -> token/style -> mode -> consumer) from `PERCEPTUAL COLOR` (surroundings + temperature + lightness + chroma + area + repetition -> perception).
- Separate semantic containment from plane/depth cues.
- One visible boundary needs a real owner; repeated border/radius/shadow does not create stronger semantics by itself.
- Attention is a budget: chroma, contrast, enclosure, type mass, area, motion, and depth compete.
- Reuse a semantic visual role; do not clone colors/effects because the same token looks different in a different context before testing the surroundings.

Read `references/color-depth-method.md` when palette, surface, material, depth, or shape decisions are material.

## Craft calibration

A palette is not complete because token mapping and contrast pass. For polished work, inspect **occupied chroma area, neutral-field temperature, local/whole contrast, edge density, shape repetition, visual center, and depth distribution**. The same valid palette can produce either a quiet hierarchy or a noisy mosaic depending on area and repetition.

When a composition is technically consistent but generic/muddy/loud, or several palette/material treatments remain plausible, **READ** `references/golden-teaching-cases.md`. The cases compare perceptual alternatives, show reusable Figma role mapping, and explain why literal specimen colors must not be cargo-culted.

## Color composition

Compose with four perceptual controls together:

- hue relationship;
- temperature/neutral undertone;
- lightness;
- chroma.

Then account for occupied area and repetition. A saturated accent used on 4% of a screen is a different composition from the same accent covering 40%.

Use perceptual roles:

```text
DOMINANT   quiet field supporting sustained work
SUPPORT    secondary surfaces/content families
ACCENT     selective high-information/action/exception moments
```

These are composition roles, not necessarily token names.

## Surface and depth

Name surface/plane roles first:

```text
canvas/environment
shell/chrome
primary work surface
alternate/grouped surface
raised region
overlay/transient surface
scrim
```

If planes collapse, test in this order:

1. correct role mapping;
2. lightness/temperature relation;
3. spacing/divider/clipping/border;
4. overlap/occlusion;
5. shadow/scrim/blur when the plane truly requires it;
6. only then a new visual role/value.

## Shape grammar

Classify the owner before radius/stroke:

```text
structural region
bounded object
control family
transient overlay
status/tag/chip
selection/state layer
```

Reserve high-specificity shapes such as pills/capsules for roles that earn them. A UI where shell, cards, rows, headers, hover states, and status all become rounded pills loses hierarchy.

## Styles and reuse

Use Figma Paint/Effect Styles when a composite visual recipe is reused and should update coherently. Bind style values to variables where Figma supports it and semantic token ownership is justified.

Name styles by role, not literal recipe:

```text
Surface/Canvas
Surface/Raised
Border/Default
Elevation/Overlay
Effect/Focus
```

Do not create a new Style for a one-off local effect unless reuse/evolution is expected.

## Brand relationship

Express brand through controlled system roles rather than hard-coding brand identity into every consumer. Prefer:

```text
semantic role -> brand/theme realization -> consumer
```

Brand can influence palette temperature/chroma, typography, icon language, material character, shape grammar, and motion; this Skill owns only visual-system aspects. Multi-brand variable inheritance belongs to `figma-tokens`.

## Native execution discipline

- Inspect actual fills/strokes/effects/style ids/bound variables and backdrop before changing color/effects.
- Clone read-only paint/effect arrays before mutation and reassign.
- Prefer reusable variables/styles where existing system truth supports them.
- Return ids of changed nodes/styles.
- Render/export at actual area and repetition. Swatches alone do not prove composition.
- Check relevant light/dark/contrast modes and actual adjacent colors.

## Failure and correction

- **Contrast passes but scene is muddy:** inspect surface lightness, temperature, chroma distribution, area, type hierarchy, and boundaries.
- **Brand everywhere:** reduce occupied accent mass and restore dominant/support fields.
- **Every status saturated:** quiet normal repetition so exceptions preserve salience.
- **New gray for every nested box:** reopen plane/surface ownership before expanding roles.
- **Same token looks inconsistent:** hold token constant and inspect surrounding field first.
- **Shadow on every region:** remove fake planes before softening shadows.
- **Glass/blur everywhere:** require retained context/material benefit; otherwise use stable opaque surfaces.
- **Random radius variety:** trace silhouette owner and shape role; do not use radius as decoration.

## Boundaries

- `figma-verification` owns a fixed-artifact audit/verdict; this Skill owns authoring/repair decisions in its domain.

- `figma-tokens` owns reusable value taxonomy, aliases, modes, scopes, and code syntax.
- `figma-scene` owns structural/plane/clipping/silhouette ownership and transforms.
- `figma-typography` owns type roles and font geometry.
- `figma-components` owns visual-role consumption inside reusable component contracts.
- `figma-motion` owns temporal salience and motion language.
