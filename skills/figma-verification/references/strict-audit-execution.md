# Strict audit execution

Use this reference when a user supplies a large strict-audit checklist or profile.

## Work order

1. Bind `instanceId`, file name/key, page/node scope, loaded `bundleRevision` and an artifact `snapshotId`. If Figma cannot provide an immutable revision, label the snapshot as a structural fingerprint and keep `revisionAuthority` explicit.
2. Bind expected truth from Product, Design, system, accessibility or interaction sources. A checklist is an obligation source, not evidence.
3. Create one claim record per independently testable obligation. Keep `applicability`, `required`, `dimension`, `minimumEvidence` and `owner` separate.
4. Query typed facts first. Use `entity_graph`, `component_integrity`, `binding_inventory`, `prototype_graph`, `motion_snapshot` and `accessibility_design_facts` only for the claims they can prove.
5. Export/render only for visible, temporal or content-pressure claims. Record exact state, viewport, mode, node IDs, artifact path and SHA-256.
6. Write findings as `observed -> expected/source -> evidence -> consequence -> repair owner -> next action`.
7. Assign only `PASS | FAIL | NOT_RUN | INCONCLUSIVE | MISSING | BLOCKED`. Keep provider lifecycle and reason codes in separate fields.

## Owner mapping

| Evidence need | Probe owner | Repair owner |
|---|---|---|
| target, bundle, snapshot, cursor, provider errors | `figma-native` | runtime/integration |
| scene and layer ownership | `figma-scene` | `figma-scene` |
| layout, grid, pressure | `figma-layout` | `figma-layout` |
| component/instance contract | `figma-components` | `figma-components` |
| variables, styles, aliases and bindings | `figma-tokens` | `figma-tokens` |
| prototype graph and recovery | `figma-prototype` | `figma-prototype` |
| temporal structure and playback | `figma-motion` | `figma-motion` |
| visual/type craft | visual/type Skills | visual/type Skills |
| verdict and evidence admission | `figma-verification` | none during audit |

The verifier owns the verdict. A specialist can supply expected semantics or repair direction but cannot turn its own authoring readback into independent acceptance.

## Provider limitation packet

For `BLOCKED`, record:

```text
providerOperation
editorType
observed provider error/code
plan/permission/runtime state when directly observed
capability actually blocked
capabilities that still work
workaround classification (none/bypass/manual)
unlockCondition
observedAt
```

Do not generalize from one failed variant. For example, a rejected multi-action reaction does not prove that every single-action variable reaction is unavailable.

## Claim boundaries

- A local component and its consumers can prove local reuse; they cannot prove published cross-file distribution.
- A reaction graph can prove wiring facts; it cannot prove Presentation execution, keyboard order or runtime AT.
- Motion metadata or video bytes can prove artifact existence; timing/order claims require phase review.
- Static Figma facts can prove inspectable design accessibility obligations only; DOM, platform API and screen-reader claims remain external runtime evidence.
- A screenshot can support visual claims for the exact inspected state/content/viewport only.
