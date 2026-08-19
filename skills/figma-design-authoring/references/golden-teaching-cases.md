# Golden Teaching Cases — Figma Design Authoring

Use these cases for **pattern transfer**, not as UI templates. Transfer the evidence -> diagnosis -> decision -> construction relation. Literal spacing, typography, colors, and component shapes apply only when the new product truth earns the same decisions.

## Contents

- [Case 1 — Compact observability companion](#case-1--compact-observability-companion-from-product-truth-to-one-coherent-scene)
- [Case 2 — Beautiful screenshot, weak reusable truth](#case-2--failurerecovery-a-beautiful-screenshot-with-weak-reusable-truth)

## Case 1 — Compact observability companion: from product truth to one coherent scene

### Product truth

Design a compact Figma companion surface for a local ControlMux bridge. The approved behavior is already known:

- the user must understand connection health immediately;
- Requests must summarize volume, reliability, speed, and request type;
- the user must be able to inspect individual requests continuously;
- the live request log belongs at the bottom and only a bounded number of rows are visible at once;
- diagnostics are secondary drill-down, not a primary dashboard section;
- the surface should feel compact and scan-disciplined, with iPhone-like information economy, without pretending to be a mobile app.

The design question is **not** “which card style should I use?” It is: *how should these responsibilities become one readable, reusable Figma scene?*

### What a mediocre agent is likely to do

A generic first pass often creates:

```text
Header
[ Connection card ]
[ Runtime card ]
[ Requests card ]
[ Activity card ]
[ Diagnostics card ]
[ Log card ]
```

Each region receives a rounded surface, heading, helper sentence, and one or two values. It is technically organized, yet weak because:

- Connection and Runtime repeat the same orientation question;
- Requests and Activity compete for the same “what is happening?” role;
- Diagnostics becomes visually equal to the working log even though it is rarely needed;
- every block claims a silhouette, so boundary mass exceeds semantic segmentation;
- equal card weight makes the page read as inventory rather than task progression.

Do **not** repair this by only reducing radius or padding. The root error is the scene model.

### Expert diagnosis

Start from the user’s actual scan sequence:

```text
1. Can the bridge be trusted right now?
2. Is work flowing normally?
3. Which exact request needs investigation?
4. Only then: show technical detail for the selected subject.
```

That yields three primary semantic zones and one transient detail plane:

```text
ORIENTATION / CONNECTION
TRAFFIC SUMMARY
REQUEST INVESTIGATION WORKSPACE
DETAIL OVERLAY when requested
```

This is the first decisive move: **task hierarchy becomes scene hierarchy before visual styling begins**.

### Plausible alternatives and why they lose

#### Alternative A — equal dashboard tiles

Use four equal tiles for Connection, Success, Latency, and Agents, then place a log below.

Reject for this product because the four values do not have equal job priority. Connection is orientation, Success/Latency are quality signals, and Agents is secondary operational context. Equal geometry manufactures equal importance.

#### Alternative B — one completely flat list

Put all values and requests in one long list with no owning surfaces.

Reject because summary values and continuous request investigation have different scan rhythms. The log needs a stable working region and row comparison field. Completely flat treatment loses that distinction.

#### Alternative C — three semantic zones + transient detail

Choose this:

- a compact Connection owner;
- one Requests summary owner;
- Request Log as the flexible working surface;
- request/system details as a bottom sheet/overlay plane.

It uses boundaries only where a real object/working-plane responsibility exists.

### Whole-scene construction

Use a compact specimen viewport around `420 x 844` only to make the relationships concrete. For another host size, preserve the ownership and pressure rules rather than the literal dimensions.

#### Root

```text
Frame: ControlMux Companion
  width: 420 FIXED for specimen
  height: 844 FIXED for specimen
  layout: VERTICAL Auto Layout
  padding: 16 top / 12 horizontal / 12 bottom
  gap: 10
  clipContent: true
  fill: Surface/Canvas
```

The root owns viewport bounds and vertical section flow. It is **not** itself a visible card.

#### Header

```text
Frame: Header
  width: FILL
  height: ~48 FIXED
  layout: HORIZONTAL
  justify: SPACE_BETWEEN

left: Brand block
  title: Text/Page/Title
  context: Text/Metadata/Secondary

right: Header actions
  compact connection-state object
  system/detail icon control
```

A connection-state pill is allowed here because it is an explicit state object. Do not generalize that into pill-shaped surfaces for every section.

#### Connection

```text
Frame: Connection Section      -> no visible fill
  Label                        -> section orientation only
  Frame: Connection Surface    -> one visible silhouette
    Main row                   -> icon + title/status + disclosure
    Facts row                  -> 3 comparison cells, shared outer silhouette
```

The three facts do not become three cards. They are subordinate comparison cells inside one owner. Dividers are enough.

#### Requests

```text
Frame: Requests Section
  Label
  Frame: Requests Surface
    Head row
      left: total + session label
      right: current running/queued state
    Quality row
      Success metric
      Latency metric
    Mix bar + compact legend
```

The total is the strongest numeric orientation signal. Success and latency are secondary comparison metrics. Request-type colors are constrained to a small bar/legend rather than filling the surface.

#### Request Log

```text
Frame: Request Log Section
  sizing vertical: FILL
  min useful height: enough for several request rows
  Label
  Frame: Log Surface
    sizing vertical: FILL
    clipContent: true
    Toolbar: FIXED
    Scroll region: FILL
      Request Row instances
```

This is the working region, so it consumes the remaining height. Do not let summary sections grow until the log becomes a tiny afterthought.

Use a stable row comparison field:

```text
time | kind | status + label | total latency
```

Queue/execution details belong in request detail because adding them to every row would destroy scan density.

### Visual distribution

The first high-fidelity pass should intentionally be quiet:

```text
Canvas        quiet neutral field
Base surfaces white/light neutral
Sub-surfaces  only for local metric grouping
Accent colors small and semantic
Strongest type mass page title + request total
Strong shadows only on actual overlay plane
```

The goal is not minimalism as style. It is to reserve attention for orientation, abnormal state, and the current investigation surface.

### First render critique

Reject the first render if any of these happen:

- Connection, Requests, and Request Log all have equally loud headings and numbers;
- every metric becomes its own card;
- the log shows only one or two rows because summaries consumed the viewport;
- green “healthy” fills occupy large areas, making normal state louder than failure;
- technical endpoint/protocol data sits permanently beside primary workflow data;
- row labels and kind/status text have the same weight, producing a noisy text carpet.

A valid structure can still fail this critique.

### Causal correction sequence

Suppose the first render feels “busy and boxed in.” Do **not** immediately reduce all borders.

Diagnose:

```text
symptom: busy / segmented
-> semantic segmentation: only 3 primary zones
-> silhouette count: 7 visible card boundaries
-> cause: children claim boundaries their parent already owns
```

Correct:

1. remove independent silhouettes from Connection facts;
2. keep Requests metrics as quiet sub-fields inside one surface;
3. let request rows inherit the Log silhouette and use dividers;
4. move technical diagnostics to the detail plane;
5. re-render whole scene before tuning local radius or color.

If the page still feels flat after this, change **hierarchy variables** next: type mass, negative space, and metric dominance—not more boxes.

### Native Figma compilation

A strong Figma artifact should expose the reasoning structurally:

```text
ControlMux Companion [Frame, vertical Auto Layout]
├── Header [Frame]
├── Connection Section [Frame]
│   └── Connection Surface [Frame, component candidate only if reused]
├── Requests Section [Frame]
│   └── Requests Surface [Frame]
└── Request Log Section [Frame, FILL]
    └── Log Surface [Frame, FILL + clip]
        ├── Toolbar [Frame]
        └── Rows [Frame/scroll owner]
            └── Request Row [Component instance repeated]
```

Do not create a Component merely because Connection and Requests are both rounded surfaces. They have different semantic jobs and anatomy.

### Proof

For a polished-authoring claim, inspect at least:

1. structure: Auto Layout owners, sizing, scroll/clip owner, component/style bindings;
2. whole-scene render at intended compact viewport;
3. dense log state with realistic labels/latencies;
4. one short-height or narrow-width pressure case;
5. request-detail overlay if drill-down is part of the requested design.

### Why this is better than merely valid

It is not better because `16px radius` or `10px gap` is inherently good. It is better because:

- visual hierarchy follows task hierarchy;
- comparison axes are stable;
- one working region receives the remaining space;
- boundary and chroma mass are proportional to semantic importance;
- details are available without competing with primary scanning;
- the Figma tree preserves the same ownership model visible on canvas.

### Anti-copy rule

Do **not** transfer the “one dominant working surface” composition to a screen whose primary job is comparing peers.

Example: an investment comparison view where eight funds are intentionally equivalent may require a symmetric grid or table. Making one fund visually dominant would invent priority the product does not have. Transfer the rule **task hierarchy -> geometry hierarchy**, not the literal hierarchy used here.

---

## Case 2 — Failure/recovery: a beautiful screenshot with weak reusable truth

### Situation

An agent reproduces the observability specimen pixel-perfectly by drawing rectangles/text manually. The screenshot looks excellent.

### Hidden failure

Inspection reveals:

- request rows are duplicated groups rather than instances;
- colors are raw literals with no semantic Variables/Styles despite an existing system;
- the log height is manually fixed and does not own remaining viewport space;
- status/kind variants are separate duplicated row copies;
- the bottom sheet is drawn on the page with no overlay/state relation.

### Correct response

Do **not** discard the visual solution and redesign from scratch. Preserve the proven visible composition while repairing representation responsibility:

```text
visual result
-> identify stable repeated job: Request Row
-> componentize invariant anatomy
-> expose kind/status/label/time/duration variation
-> bind semantic colors/type roles
-> restore FILL/clip ownership for log
-> model request detail as prototype/overlay state
-> re-render to prove representation repair did not regress craft
```

The lesson is part <-> whole in both directions: a strong screenshot is evidence of composition, not proof of system integrity; a clean component tree is evidence of structure, not proof of craft.
