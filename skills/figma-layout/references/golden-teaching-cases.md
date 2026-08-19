# Golden Teaching Cases — Figma Layout

Use these cases to learn **geometric responsibility under pressure**. Do not copy literal column widths or gaps unless the new content, viewport, and scan task justify the same contract.

## Contents

- [Case 1 — Request log under pressure](#case-1--request-log-layout-that-stays-scannable-under-real-pressure)
- [Case 2 — Form layout and comparison preservation](#case-2--form-layout-why-stack-everything-on-mobile-can-be-wrong)

## Case 1 — Request log layout that stays scannable under real pressure

### Layout question

The Request Log must continuously show recent bridge activity inside a compact companion surface. Each visible row needs:

- request time;
- type/kind;
- status;
- descriptive label;
- total latency;
- drill-down for queue/execution/technical detail.

The surface must show several rows at once, scroll older rows, and survive narrow width, long labels, and large latency values.

This is a layout problem because the semantic fields are known. The job is to preserve their relationships under pressure.

### Weak first pass

A common agent writes one Auto Layout row and sets every child to `FILL`:

```text
Time FILL | Type FILL | Label FILL | Latency FILL
```

It appears fine with `12:41`, `READ`, `Get node`, `80 ms`. It fails with realistic values because every field competes equally for space and the label can collapse or push latency out of view.

Another common failure is manual x/y placement copied from one screenshot. It looks exact at one width and breaks immediately when the row changes.

### Expert relation model

The fields do not have equal pressure behavior:

```text
Time      stable short reference   -> bounded width
Kind      compact categorical mark -> bounded width
Main      variable descriptive     -> owns flexible space
Latency   short comparison value   -> bounded/right aligned
```

So the row contract is:

```text
bounded | bounded | flexible | bounded
```

not “four columns that happen to look equal.”

### Concrete specimen

At a `420px` specimen viewport, with `12px` outer horizontal padding, the log surface has about `396px` available width.

Use a row owner like:

```text
Request Row [horizontal Auto Layout]
  width: FILL
  min height: ~50
  horizontal padding: 10
  gap: 7
  align-items: CENTER

Time
  width: ~48 FIXED
  text: tabular numeric, no wrap

Kind
  width: ~30 FIXED
  compact visual mark

Main
  width: FILL
  minWidth: 0 equivalent responsibility
  contains meta line + label vertical flow

Latency
  width: ~52 FIXED
  right aligned, tabular numeric
```

The literal values are not the lesson. The lesson is that **the descriptive field owns variability** while comparison/reference fields keep stable anchors.

### Why Queue and Execution do not join the row

Suppose the agent wants to add:

```text
queue 31 ms | execution 183 ms | total 214 ms
```

to every row.

Reject on the base log because the primary scan task is “which request happened, what kind/status, and how slow was it?” Queue/execution explain *why* a selected request was slow and belong in detail.

This is layout economy driven by task, not token economy.

### Vertical ownership

The page contains Header, Connection, Requests summary, and Request Log. The log is the only region whose value increases directly with extra vertical space.

Therefore:

```text
Header             FIXED/HUG
Connection         HUG
Requests summary   HUG
Request Log        FILL
  Toolbar          FIXED/HUG
  Scroll region    FILL + clip/scroll
```

Do not assign fixed heights to every section and hope they fit. Give flexible space to the region that can use it.

### Pressure test A — narrow width

At around `360px` viewport width:

1. preserve Time and Latency anchors;
2. slightly reduce their bounded widths only if actual data still fits;
3. keep Main as the only flexible field;
4. truncate the row label to one line in the live list;
5. preserve full label in request detail;
6. do not hide status or convert the whole layout into a vertical stack merely because width decreased.

A plausible narrower contract might become:

```text
44 | 28 | FILL | 50
```

but verify actual content rather than treating these numbers as a breakpoint recipe.

### Pressure test B — long content

Test labels such as:

```text
Synchronize component descriptions across the active design-system library
Apply typography role to 12 validation-message labels
```

The row should remain one-line scannable in the live log. The label truncates inside Main; time/type/latency remain visible. Full content moves to detail.

If the row grows to three lines and only two requests fit on screen, the working region has lost its purpose.

### Pressure test C — numeric width

Test:

```text
74 ms
284 ms
1.24 s
12.8 s
```

Use tabular figures and enough bounded width for the supported range. If extreme values can exceed the slot, define overflow/format policy rather than allowing the column to jitter.

### Pressure test D — short viewport

When usable height shrinks:

- reduce nonessential outer rhythm and summary padding first;
- keep connection/request meaning intact;
- preserve a minimum useful number of request rows;
- do not compress controls below target/legibility obligations;
- do not simply shrink every type size.

This is **recomposition by value of space**, not uniform scaling.

### Figma construction order

1. Inspect the current parent and confirm which frame owns remaining page height.
2. Make Request Log Section vertical Auto Layout and `FILL` vertically.
3. Make Log Surface `FILL`, clipped, vertical Auto Layout.
4. Keep Toolbar fixed/hug vertically.
5. Give Rows/scroll owner `FILL` vertically.
6. Build Request Row as horizontal Auto Layout.
7. Append children before assigning context-dependent `FILL` sizing.
8. Assign Main as the flexible child; keep the three anchor fields bounded.
9. Render realistic rows before extracting a reusable component contract.

### Failure/re-entry example

Symptom: latency disappears only for long Vietnamese labels.

Bad correction:

```text
shrink all row text from 10.5px to 9px
```

Diagnosis:

```text
content pressure
-> Main field has no flex ownership / min-width behavior
-> label pushes bounded sibling
```

Correct at the row layout owner. If the same failure happens across several row-like components, then investigate a shared component/layout contract. Do not jump straight to global typography changes.

### Anti-copy rule — when symmetry is correct

Consider a screen whose primary job is comparing eight peer service regions on the same dimensions: requests, error rate, latency, saturation.

A symmetric grid/table can be the correct layout because comparison equality is the task invariant. Do not apply the ControlMux “one large primary metric + secondary metrics” pattern automatically. Ask what must remain aligned for comparison.

---

## Case 2 — Form layout: why “stack everything on mobile” can be wrong

### Situation

A compact editor has repeated rows:

```text
Property name | current value | reset action
```

At narrow width an agent stacks every field vertically.

### Why the obvious heuristic fails

Users edit several properties in sequence and need to compare names/values vertically. Full stacking destroys the shared value axis and doubles scan height.

### Better decision

Preserve the comparison relation longer:

- keep property name on a bounded left column;
- allow value control to own remaining width;
- keep reset as compact anchored action;
- only switch to stacked disclosure when minimum operable value-control width can no longer be preserved.

The breakpoint emerges from the **failing relation**, not from the device name.
