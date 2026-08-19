# ControlMux Figma UI direction — approved for implementation

This iteration continues the single-surface live companion direction already reviewed in-session; it is not a new visual-direction fork.

User direction captured before implementation:
- UI is primarily a view; actions exist only for connection/recovery and local viewing/log support.
- One page is enough.
- Present the information with the scanability and interaction discipline of a compact iPhone-style information surface, without turning the Figma plugin into a mobile app.
- Connection must be immediately understandable.
- Requests must explain volume, reliability, speed, and request type without excessive charts.
- Request log belongs at the bottom, shows only a bounded number of rows at once, and scrolls for older requests.
- Each request needs time, type, status, speed/latency, and drill-down details.
- Log controls need pause/resume, filter, and clear-log actions using clear icons/state.
- Diagnostics/technical data are secondary details, not a standalone primary section/page.

Implementation invariant:
Connection answers “can this Figma plugin reach the local ControlMux bridge?” Requests answer “what work is flowing, how reliable is it, and how fast is it?” Request Log answers “what happened request by request?”

Copy-density revision (2026-08-18):
- Keep the approved one-surface structure and interactions.
- Reduce visible helper prose; prefer short labels, values, symbols, and drill-down.
- Healthy Connection has no explanatory sentence.
- Request rows keep time, kind, status glyph, label, and total latency; queue/run detail stays in request detail.
- Log count moves into the toolbar; redundant scroll instruction/footer is removed.

