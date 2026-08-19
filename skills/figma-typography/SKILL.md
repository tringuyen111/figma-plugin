---
name: figma-typography
description: Design, audit, repair, and reuse typography in Figma. Use for fonts, font loading/availability, Text Styles, typography variables, text-role hierarchy, line height, letter spacing, measure, numeric scanning, localization/RTL, text scaling, optical alignment, and text-slot pressure in reusable components. Own typography as geometry and system language; do not own generic layout, token architecture, component structure, or overall visual color/material direction.
---

# Figma Typography

Treat typography as **semantic information + geometry + reusable system language**, not a polish layer or a list of font sizes.

## Terminal job

Map information roles to reusable Figma text styles/variables and component text slots so hierarchy remains coherent under real content, localization, scaling, and font metrics. Complete when the intended roles are reusable, correctly named/bound, and representative consumers survive content pressure.

## Decision advantage

This Skill earns its place by treating typography as **information hierarchy plus geometry**. A Text Style is justified by repeated role behavior, not merely shared font metrics; font availability, fallback metrics, measure, line height, numeric alignment, localization, and text scaling can invalidate a layout even when style bindings are technically correct.

## Skill I/O contract

**Minimum input**
- information role and representative real strings;
- current font/style/variable bindings and local geometry;
- the content/localization/numeric pressure relevant to the task.

**Escalate input only when** font availability or metrics, fallback behavior, hierarchy mass, or whole-scene interaction is uncertain. Inspect a representative consumer before enumerating every text node/style in the file.

**Return** role/style decision, metrics/bindings changed or preserved, affected text slots/IDs, and pressure proof. Keep font inventory and raw segment data bounded to the families/styles actually needed.

## Distillation and provider authority

Read `references/provenance.md` for audit/provider-conflict work. Current Figma variable support can supply multiple typography-related scalar/string properties, but a Text Style remains the reusable composite typography recipe when that is the actual system contract. Verify exact available font family/style strings before mutation and load the current fonts of existing text before editing.

Treat font fallback or localization changes as geometry changes: re-check wrap, baselines, slot capacity, and whole-scene type mass rather than patching one text node.

## System-plane invariants

- Information role is the owner; literal font metrics are a representation of that role.
- Font family, size, weight, line height, tracking, measure, color, and placement interact; do not tune them independently without checking whole composition.
- A text style is a reusable recipe; variables can supply reusable scalar/string values but do not replace composite typography semantics by themselves.
- Fix the smallest shared text role/slot/layout owner that explains repeated failures; avoid per-instance shrinking/nudging.

## Build roles before metrics

Start from information function, for example:

```text
page/title
section/title
body/primary
body/secondary
control/label
metadata/default
metric/value
status/message
code/default
```

Then map:

```text
information role
  -> Text Style / typography role
  -> font + metrics + color relation
  -> optional bound variables
  -> component text slot
  -> representative consumers
```

Read `references/typography-method.md` for hierarchy, metric, localization, and slot decisions.

## Craft calibration

Readable type is not necessarily well-composed type. For polished work, inspect **whole-scene type mass, hierarchy distance between neighboring roles, repeated weight density, line-measure rhythm, numeric scanning, baseline/optical alignment, and how type pressure changes geometry**. Avoid using weight as the only hierarchy mechanism.

When a scale is technically valid but the page still feels flat/dense/generic, or a font/role choice has several plausible answers, **READ** `references/golden-teaching-cases.md`. The cases provide exact role metrics, long-content/localization/numeric pressure, render critique, and anti-copy rules.

## Font evidence

Before authoring or editing text:

- inspect the current product/code/design-system font family rather than defaulting to a familiar font;
- use Figma's available-font APIs when the exact family/style string is uncertain;
- load the current fonts of existing styled text before mutation;
- when a font or fallback changes, re-check wrapping, baselines, region heights, density, and optical balance.

## Text Style and variable reuse

Use Text Styles for repeatable composite type recipes. Use variables for values that are independently meaningful/reused, such as font size/weight/line-height/letter-spacing where Figma supports binding and the design system has that abstraction.

Do not create a style named only by raw metrics such as `14/20 Semibold` when the role is known. Prefer semantic names:

```text
Text/Page/Title
Text/Section/Title
Text/Body/Primary
Text/Control/Label
Text/Metric/Value
```

Keep typography variable names role-oriented when semantic and scale-oriented when primitive.

## Geometry and pressure

For each material role/slot reason about:

- x-height/cap height and perceived weight;
- width/character fit;
- line-height and vertical rhythm;
- tracking;
- line measure;
- wrap/truncate/reflow policy;
- numeric features such as tabular figures;
- localization/RTL and accessibility text scaling;
- optical alignment with adjacent icons/controls.

A component text slot must declare its pressure contract: fixed identity, wrapping label, user-generated value, optional metadata, growing validation message, etc.

## Native execution discipline

- Load fonts before all text mutations, including operations that touch styled text descendants.
- For existing mixed-font text, inspect styled segments and load every required font before edits.
- Reuse/import matching Text Styles before creating new ones.
- Return ids of changed text nodes/styles.
- Validate both text/style bindings and the rendered region when line breaks or hierarchy matter.

## Failure and correction

- **Arbitrary type scale:** reconstruct information roles and relative hierarchy first.
- **Every section is bold:** inspect repeated whole-page type mass; reserve strongest contrast for true orientation/decision roles.
- **Font swap breaks layout:** treat the new metrics as geometry evidence; re-run slot/layout composition.
- **Localization fixed by smaller font:** fix slot/reflow/layout ownership instead.
- **Numeric table jitters:** inspect alignment, tabular figures, column anchors, and metric role.
- **Math-center looks optically wrong:** correct shared icon/type anatomy if the issue repeats; do not accumulate instance nudges.
- **Many near-duplicate Text Styles:** compare semantic roles and consumers; merge only when the role truly is the same.

## Boundaries

- `figma-verification` owns a fixed-artifact audit/verdict; this Skill owns authoring/repair decisions in its domain.

- `figma-layout` owns the container/grid response to typography pressure.
- `figma-tokens` owns shared scalar/string variable architecture.
- `figma-components` owns the text slot anatomy and configurable text properties.
- `figma-visual-system` owns color/material composition beyond text-role hierarchy.
- `figma-design-authoring` owns whole-screen composition.
