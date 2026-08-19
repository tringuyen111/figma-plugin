# Golden Teaching Cases — Figma Typography

Use these examples to learn **information hierarchy, type mass, geometry, and pressure behavior**. Literal metrics are specimen values and must be re-measured when the actual product font differs.

## Contents

- [Case 1 — Dense observability typography](#case-1--dense-observability-ui-without-a-wall-of-semibold-text)
- [Case 2 — Font swap as geometry change](#case-2--failurerecovery-a-font-swap-that-is-visually-close-but-geometrically-wrong)

## Case 1 — Dense observability UI without a wall of semibold text

### Typography question

The ControlMux companion contains:

- product title and current Figma context;
- section orientation labels;
- connection title; endpoint/transport only when a secondary detail view actually exposes them;
- request total and quality metrics;
- live log rows with time, kind, status, description, and latency;
- request-detail technical fields.

A typical agent can assign readable sizes to each item and still produce a page where everything feels equally loud.

### Weak first pass

A common scale:

```text
Page title      22 / bold
Section title   15 / semibold
Card title      14 / semibold
Metric          16 / semibold
Row label       12 / semibold
Kind/status     10 / semibold
Technical value 11 / semibold
```

Every role is individually legible, but semibold weight repeats across most of the viewport. The result is a **uniform type-mass field**: the eye receives too many orientation signals.

### Expert role map

Start from information function, then allocate contrast.

A concrete specimen using Inter-like metrics:

| Role | Specimen metrics | Why |
|---|---|---|
| `Text/Page/Title` | 22/25, ~700 | primary orientation, appears once |
| `Text/Page/Context` | 11/14, regular | current file/task context, subordinate |
| `Text/Section/Label` | 9.5/12, ~650, +tracking, uppercase | repeated navigation/orientation marker; small to avoid mass |
| `Text/Surface/Title` | 15/19, ~650 | local semantic object title |
| `Text/Body/Secondary` | 10.5/14, regular | endpoint/help/supporting detail |
| `Text/Metric/Primary` | 29/30, ~700, tabular | one dominant quantitative orientation value |
| `Text/Metric/Value` | 15/19, ~650, tabular | secondary comparison metric |
| `Text/Log/Meta` | 8.5/11, ~650 | category/status; compact but discriminable |
| `Text/Log/Label` | 10.5/13, ~550–600 | repeated main row content; must not become a bold carpet |
| `Text/Log/Time` | 9/12, regular, tabular | stable reference anchor |
| `Text/Log/Latency` | 10.5/13, ~650, tabular | repeated right-edge comparison value |
| `Text/Detail/Key` | 9/12, regular | technical label |
| `Text/Detail/Value` | 10–11/14, ~600 | technical answer |

Do not copy these numbers blindly. Preserve the **relative roles and repeated mass distribution** after testing the actual font. Numeric weights above express relative mass; in Figma map them to the exact available family/style names (for example Inter `Bold`, `Semi Bold`, `Medium`, `Regular`) only after verifying those names in the current file/runtime.

### Why the request total is large

`148` is not large because dashboards need big numbers. It is large because session volume is the primary quantitative orientation for the Requests summary and appears once.

If a different screen has no singular primary metric, do not manufacture one merely to create visual drama.

### Why section labels are small

`CONNECTION`, `REQUESTS`, `REQUEST LOG` repeat vertically. If they are all 14–16px semibold, they compete with local content and create many bold islands.

Small uppercase/tracked labels can provide a stable orientation rail with low occupied type mass. If the product font’s uppercase is poor, use another low-mass role—do not force uppercase as a style rule.

### Log row anatomy

The row has two simultaneous scan modes:

1. horizontal comparison: time -> kind/status -> label -> latency;
2. vertical scan: repeated labels and latencies down the list.

Therefore:

- Time and Latency use tabular figures;
- Kind/status is compact and distinguishable, not large;
- Label owns readable semantic content but uses moderate weight because it repeats many times;
- status color/glyph provides additional discrimination without requiring heavier type.

### Pressure test A — long English label

Use:

```text
Synchronize component descriptions across the active design-system library
```

In the live log, keep the label one line and truncate according to the row contract. Do not reduce the whole type scale. Full content belongs in detail.

### Pressure test B — Vietnamese

Use:

```text
Đồng bộ mô tả thành phần trong thư viện hệ thống thiết kế đang hoạt động
```

Check:

- diacritics are not clipped by line height;
- the chosen font has the required glyph quality;
- truncation still leaves useful identifying text;
- line box alignment with time/latency remains optically stable.

### Pressure test C — large numeric values

Test:

```text
74 ms
284 ms
1.24 s
12.8 s
01:48:32
98.6%
```

Tabular figures should keep columns steady. If the product font lacks usable tabular features, either use an approved numeric face/feature or adjust column alignment intentionally; do not accept jitter because the style token is “correct.”

### Pressure test D — 125% text scaling / alternate font metrics

When text grows or the font changes:

1. re-measure row/content capacity;
2. keep role hierarchy if possible;
3. allow layout owner to recompose before shrinking text;
4. inspect whole-scene type mass again because increased size changes attention distribution.

Typography pressure is geometry evidence.

### Figma system mapping

Build semantic Text Styles:

```text
Text/Page/Title
Text/Page/Context
Text/Section/Label
Text/Surface/Title
Text/Metric/Primary
Text/Metric/Value
Text/Log/Meta
Text/Log/Label
Text/Log/Time
Text/Log/Latency
Text/Detail/Key
Text/Detail/Value
```

Bind variables only where the system actually treats scalar values independently. A Text Style remains the composite role recipe.

### First render critique

Reject if:

- bold/semibold appears on nearly every row and section;
- Page Title and request total compete equally despite different roles;
- secondary endpoint/context strings have too much contrast;
- numeric columns jitter;
- long strings force global font shrinking;
- small uppercase labels become illegible because tracking/weight was chosen from habit rather than the font’s real rendering.

### Failure/re-entry example — “too dense” is not always a spacing problem

Symptom: the page feels crowded even though gaps/padding meet the layout system.

Inspect type mass:

```text
5 repeated headings semibold
+ 10 row labels semibold
+ status words semibold
+ metric values semibold
-> too many dark text islands
```

Correction:

1. preserve strongest orientation roles;
2. reduce repeated row-label weight before increasing every gap;
3. let spacing and color hierarchy carry some grouping work;
4. re-render whole page.

This can make the UI feel calmer **without increasing physical whitespace**.

### Anti-copy rule — editorial onboarding screen

An onboarding/marketing page with one expressive message may legitimately use a much larger display title, looser measure, and stronger typographic contrast. Do not apply this dense operational scale there.

Transfer:

```text
information role + repetition + scan task + geometry pressure -> type hierarchy
```

not literal font sizes.

---

## Case 2 — Failure/recovery: a font swap that is visually “close” but geometrically wrong

### Situation

A Text Style changes from one approved sans family to another. Font size/line height remain identical. The page now has clipped Vietnamese diacritics and request labels wrap earlier.

### Bad response

Decrease font size by 1px in the affected instances.

### Expert response

Treat the font change as geometry:

```text
new metrics
-> re-check Text Style line-height
-> re-check component slot capacity
-> re-check row layout pressure
-> re-check whole-page type mass
```

If the new font is authoritative, repair the shared role/slot/layout contract. Per-instance shrinking creates drift and hides the real system change.
