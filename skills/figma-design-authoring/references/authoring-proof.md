# Authoring Proof and Re-entry

## Proof ladder

Use the smallest sufficient proof; escalate only when the claimed fidelity requires it:

1. **Structure**: IDs/types/parents/layout/component/style bindings.
2. **Local visual**: target component/region render.
3. **Whole scene**: hierarchy, color mass, type mass, negative space, depth distribution.
4. **Stress**: representative content/state/viewport/input/mode.
5. **System propagation**: neighboring consumers when a shared role/component changes.
6. **Interaction/temporal**: prototype paths or Motion phases only when those behaviors are part of the design claim.

A visible-quality claim is `PARTIAL` if only structural readback exists. A system-quality claim is `PARTIAL` if only one screenshot exists.

## Proof selection

Choose evidence from the active question:

```text
construction/layout -> structural projection + stressed geometry
color/type/material -> rendered part + whole
component/system -> source object + representative consumers
prototype -> state-path trace + relevant visible states
motion -> timeline/keyframe context + temporal render when timing is material
```

Do not gather every proof type for every change. Extra evidence that cannot change the verdict is I/O noise, not rigor.

## Causal re-entry

When a visible symptom appears, trace inward/outward before patching:

```text
symptom
-> semantic role?
-> layout owner?
-> component contract?
-> style/token mapping?
-> plane relation?
-> content/state/viewport pressure?
```

Fix the earliest shared relation that explains the evidence, then re-render.

## Craft proof protocol

For a `CRAFTED` or `PRODUCT-FIT` claim, the first render is evidence, not completion.

1. Render the smallest whole scene that exposes the claimed hierarchy/craft.
2. Name at least the material strengths and defects causally: hierarchy, type mass, chroma/contrast area, negative space, silhouette/edge density, depth, scan/comparison axis, state pressure.
3. If a material defect is found, correct the earliest shared relation that explains it and render again.
4. If no material defect is found, state why the scene earns the requested quality level rather than silently treating "looks okay" as proof.
5. Keep independent/expert qualification separate from author self-review.

A clean first screenshot can prove that the artifact renders; it cannot by itself prove crafted quality.

## Completion packet

Return the approved truth used, material design decisions, affected identities, proof states, and unresolved gaps. Keep raw structural/render payloads out of the final packet unless they are required for reproduction.
