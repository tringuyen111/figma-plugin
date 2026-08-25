---
name: figma-layout
description: "Design, inspect, repair, or author resilient Figma layout relationships. Use for Auto Layout, Grid, constraints, HUG/FILL/FIXED sizing, wrapping, absolute positioning, spacing, responsive recomposition, density, content pressure, or geometry bugs. Own layout behavior; not product semantics, components, visual direction, or runtime setup."
---

# Figma Layout

Own **geometric responsibility**: how related children stay coherent as content, viewport, density, and input conditions change.

## Terminal job

Produce a layout graph and native Figma structure that preserves the intended semantic relationships under representative constraint pressure. Complete when ownership, sizing, alignment, and recomposition behavior are inspectable and stressed with realistic content/geometry.

## Decision advantage

This Skill earns its place by treating layout as a **relation under pressure**, not a collection of Auto Layout properties. Choose the Layout Owner and flow/comparison Relation first, then sizing and spacing. Test the invariant against width, height, content, localization, usable viewport, and input/state pressure instead of assuming a breakpoint or current screenshot defines the layout contract.

## Working vocabulary

Use these terms literally when they carry the decision.

- **RELATION** — the geometric dependency that must remain coherent across allowed change. Current coordinates are evidence about the relation, not the contract itself.
- **LAYOUT OWNER** — the nearest container whose layout mechanism enforces the Relation. If several children need compensating nudges to preserve the same relation, reopen the Layout Owner.
- **FLEX OWNER** — the child/region intentionally entitled to absorb remaining space. Multiple accidental flex owners create competition rather than resilience.
- **PRESSURE** — a valid content, viewport, density, state, input, or locale variation capable of falsifying the layout contract.
- **INVARIANT** — the semantic/geometric relation that must survive Pressure, such as comparison alignment, primary-action visibility, or selection/detail continuity.
- **RECOMPOSITION** — changing the relation or structural arrangement because sizing/spacing adaptation can no longer preserve the Invariant. A breakpoint is only an implementation threshold for this decision.

## Skill I/O contract

**Minimum input**
- exact layout owner and representative children/content;
- current flow/grid/sizing/constraint properties for that region;
- the pressure condition that must remain valid.

**Escalate input only when** local properties cannot explain the behavior: inspect the parent sizing context, relevant variables/component contract, then a rendered narrow/long-content case. Do not retrieve unrelated styles or whole-file structure.

**Return** the chosen relation, sizing/adaptation rule, changed IDs/properties, and pressure evidence. A layout result is incomplete when it reports property values without stating the invariant those values preserve.

## Distillation and provider authority

Read `references/provenance.md` only for audit/provider-conflict work. Figma Auto Layout/Grid APIs implement a layout responsibility; they do not define the semantic relation. Prefer native Auto Layout helpers when the bound runtime exposes them, but preserve the same reasoning when only lower-level properties are available.

Proof must include **constraint pressure**, not just one screenshot: resize the relevant frame or vary content/usable geometry enough to falsify HUG/FILL/fixed/grid assumptions. Distinguish page-level absolute placement from child-layout relationships.

## System-plane invariants

- Every spacing, sizing, alignment, grid, or wrap relation needs a layout owner.
- A breakpoint is an implementation threshold, not the reason for a layout mode.
- Reuse relationships, not repeated pixel values.
- Keep structural container, visible surface, component, and layout ownership distinct.
- Change the smallest owner that explains the failure; repeated local nudges are evidence of a higher-level defect.

## Layout graph

```text
semantic siblings
  -> layout owner
  -> flow | grid | anchored relation
  -> sizing contract
  -> spacing/alignment roles
  -> pressure/recomposition rule
  -> Figma Auto Layout/Grid/constraints
```

Read `references/layout-method.md` when choosing between flow, grid, wrapping, fixed/absolute positioning, or responsive modes.

## Craft calibration

A layout is not finished because Auto Layout/Grid values are valid. For a polished result, inspect **reading order, comparison axes, density gradient, negative-space distribution, stable anchors, and which region actually benefits from flexible space**. A technically resilient layout can still be weak if all regions receive equal geometric weight or if the viewport is consumed by low-value structure.

When multiple geometries are plausible, a breakpoint feels arbitrary, or a valid layout still scans poorly, **READ** `references/golden-teaching-cases.md`. The cases show exact field pressure, rejected alternatives, native sizing/Auto Layout decisions, and re-entry under width/height/content stress. Transfer the relation, not the specimen pixels.

## Select the relation first

### One-dimensional flow
Use Auto Layout when siblings form an ordered row/column with stable rhythm, alignment, and content-aware sizing. Prefer it to manual `x/y` placement for related children.

### Grid Auto Layout
Use grid tracks/cells when repeated axes matter for scan/comparison or when a responsive item field needs track-level control. Grid is an alignment field, not decoration.

### Layout guides
Use layout guides as alignment/reference guides. Do not confuse them with Grid Auto Layout; guides do not own child layout.

### Absolute positioning
Use absolute positioning for genuine overlay/anchor/free-placement relations inside an owning container. Do not use it to imitate a row/column that should reflow.

### Constraints
Use constraints when a child must preserve positional/size relation as a containing frame changes, especially outside Auto Layout or for absolute children. Do not layer constraints over a broken semantic/layout model.

## Sizing discipline

Reason from relation to value:

- `HUG`: owner/child should size to content under the current contract.
- `FILL`: child should consume available space from an Auto Layout parent.
- `FIXED`: the dimension is intentionally bounded and content pressure has an explicit policy.

For ControlMux execution, remember Figma context rules: append a child to an Auto Layout parent before setting context-dependent `FILL/HUG`; do not confuse `layoutSizing*` values with `primaryAxisSizingMode/counterAxisSizingMode`.

## Responsive recomposition

Do not reason from device labels alone. Bind the failing constraints:

```text
geometry: width / height / aspect / usable viewport
content: long labels / localization / item count / text scale
transient: keyboard / overlay / system chrome
input: pointer / touch / keyboard / stylus
state: edit / selection / error / pending / navigation depth
```

Name invariants first: identity, comparison, primary action, context, sequence, selection/detail relation. Recompose only when the current layout can no longer preserve them.

## Naming and reuse

Name layout owners by semantic job (`Toolbar`, `Request Row`, `Inspector Content`) rather than `Horizontal Frame 3`. Name reusable spacing/layout roles by relationship, for example:

```text
space/stack/tight
space/group/default
space/region/separation
layout/sidebar/width
layout/content/max
```

Do not merge `24px` shell separation and `24px` card padding merely because values match.

A repeatable layout earns a Component only when a stable semantic/anatomy contract exists. Otherwise reuse tokens/styles and keep the local structure local.

## Native execution discipline

- Inspect parent `layoutMode`, sizing, padding, item spacing, child sizing, wrapping, constraints, and absolute flags before edits.
- Prefer guarded typed layout mutation for stable geometry/layout mechanics, including modeled Grid configuration and manual child placement, and verify the affected Layout Owner/children through bounded layout readback before treating the Relation as preserved. Use the narrow native escape hatch only for uncovered/provider-gated layout mechanics, then rescan/read back the affected scope. Exact command names and transaction-reference syntax belong to the native execution contract.
- Preserve current page/window targeting explicitly when several Figma instances are online.
- After writes, read back geometry and export the smallest representative region when visual reflow matters.

## Failure and correction

- **Manual coordinates for a relational row:** move sibling relation into Auto Layout.
- **Everything FILL:** identify which child actually owns flexible space; keep fixed/hug roles where semantics require them.
- **HUG/FILL setter errors:** fix structural context/order instead of trying arbitrary enum values.
- **12-column grid by habit:** return to scan/comparison anchors; keep only tracks that earn their cost.
- **Mobile = stack everything:** preserve task invariants; use disclosure, alternate mode, or horizontal continuation when simple stacking destroys comparison.
- **Ultrawide stretches everything:** bound readable/scan fields; add parallel context only if it improves the task.
- **Localization solved by shrinking font:** reopen text-slot and layout contract; typography pressure is structural evidence.

## Capability boundary

This Skill owns layout authoring/repair: geometric Relations, Layout Owners, sizing, alignment, wrapping, Grid/flow choice, constraints, and responsive Recomposition. It does not own fixed-artifact acceptance verdicts, plane/surface semantics beyond child layout, reusable component anatomy, token architecture, typography role design, or whole-scene Product composition. When one of those concerns becomes decision-material, keep the unresolved concern and required return explicit; normal Agent capability discovery decides whether additional Skill context is useful.
