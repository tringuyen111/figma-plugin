# Craft exemplar evidence — 0.5.4 candidate

These files are project-level evidence used to qualify the detailed teaching cases added to the five craft-heavy Figma Skills. They are **not** runtime UI and are not required context for invoking a Skill.

## Source truth

The main specimen is grounded in `design/direction-approved.md`:

- one compact companion surface;
- Connection answers whether the local bridge is reachable;
- Requests answers volume, reliability, speed, and request mix;
- Request Log stays at the bottom, is bounded on-screen, and scrolls for older rows;
- diagnostics/request details are secondary drill-down surfaces;
- copy density stays low.

## Specimens

- `controlmux-observability-golden.html` — whole-scene observability specimen at a compact 420×844 viewport.
- `controlmux-request-sheet-golden.html` — transient request-detail plane specimen on the same product truth.
- `renders/controlmux-observability-golden.png` — rendered whole-scene evidence.
- `renders/controlmux-request-sheet-golden.png` — rendered overlay/plane evidence.

The HTML is an explanatory specimen, not production source. Literal dimensions, color values, and type metrics exist to make the reasoning concrete; Skills must transfer the relationship, not blindly copy the values.

## Self-review gate

The candidate teaching case was retained only after checking:

- task hierarchy is visible before local decoration;
- one owning surface per semantic/plane responsibility instead of nested-card inflation;
- Request Log owns the remaining vertical workspace;
- type mass is concentrated in orientation and high-value metrics rather than every label;
- chroma is mostly confined to status/request-kind semantics;
- base surfaces are separated with tone/border, while shadow/scrim are reserved for the transient overlay plane;
- numeric/time values use tabular scanning behavior;
- request rows preserve a stable comparison axis for time, type, label/status, and latency;
- the request-detail sheet visually/input-wise supersedes the base without becoming a permanent navigation destination.

## Proof state

```text
product-truth binding       PASS
rendered visual self-review PASS
structure/method review     PASS
independent expert review   NOT_RUN
behavioral Skill A/B        NOT_RUN
```

`golden` means **normative teaching intent inside this candidate**, not independently qualified superiority. Behavioral uplift remains unproven until representative agent executions are run.

## Evidence hashes

These hashes bind the self-reviewed evidence used by the 0.5.4 candidate:

```text
54097700d80c9489ade096c06d01dd8fb46e9dae40149012c8cc614c7125cb43  controlmux-observability-golden.html
a23a888a137d88d6abe8d03dd627f2a111ca71350288083a263578ea90da9b87  controlmux-request-sheet-golden.html
13421f5754621a8fa8f0a5681e27ab3e67b8cca431fb0f2ad71741d2dc06d8d8  renders/controlmux-observability-golden.png
ac012bec1310a9be2007b1c41600867bc407aee323b55d18efdecc35cb69cb5f  renders/controlmux-request-sheet-golden.png
```

If any specimen or render changes, re-render/review it and update these hashes together. A stale hash invalidates this self-review binding rather than silently inheriting `PASS`.
