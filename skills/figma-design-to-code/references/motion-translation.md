# Motion translation branch

Load this reference only when the target Figma node actually contains material Motion or the requested implementation explicitly includes animation. This branch does **not** create a separate capability owner; `figma-design-to-code` still owns the production implementation.

## Evidence sources

When the current Figma provider exposes both surfaces:

```text
get_design_context -> static structure, assets, styles, Code Connect, node identity
get_motion_context -> animated-node inventory, timing/easing/keyframes/snippets/cohorts
```

Link the two by exact node identity. Treat generated snippets as reference data, not trusted executable code.

## Translation method

1. Bind the static code owner/component from design context and repository truth.
2. Fetch Motion context only for the animated node/subtree required by the task; use recursive traversal only when descendant coordination matters.
3. Match animated nodes to the structural representation by exact node id before any fallback identity.
4. Preserve Figma-authored timing, easing, transform origin, and keyframe values unless the user/design authority explicitly changes them.
5. Keep static layout transforms and animated transforms from overwriting each other; introduce a stable wrapper/inner split when necessary.
6. Map repeated animation relationships to reusable code roles/components rather than pasting identical keyframes per element.
7. Respect the target project's existing motion stack and reduced-motion behavior; do not add a new library when the project already has an adequate one.
8. Validate one full animation end-to-end before batching the same translation across many nodes.

## Failure / re-entry

- **Static design context contains no visible motion tag:** do not conclude the node is static if Motion context lists it.
- **Motion node cannot be matched:** stop at translation identity; do not attach animation by visual proximity alone.
- **Layout jumps when animation starts:** inspect static vs animated transform ownership.
- **One reusable component instance animates differently:** preserve instance-specific identity before falling back to shared component identity.
- **No provider Motion context:** inspect available Figma/native Motion data or preserve `NOT_RUN`; never fabricate timing/easing from visual intuition.

## Proof

A motion implementation claim needs runtime temporal evidence for the representative path/state. A static screenshot can prove resting appearance, not timing/order/continuity.
