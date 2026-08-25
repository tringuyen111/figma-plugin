# Golden Teaching Cases

These cases teach **component judgment and reusable API design**, not visual recipes. Literal names and numbers are specimen details unless the same product/system constraints justify them.

## Case 1 — Toggle as a reusable behavioral component

### Product truth
A settings surface uses the same binary Toggle job in many contexts. Consumers need `Off`, `On`, and `Disabled`; the toggle itself owns the reversible local state change, while a few screen instances also perform product-specific actions.

### Mediocre default
Build two visually similar frames named `Toggle Off` and `Toggle On`, duplicate them across screens, and wire each screen independently.

### Expert diagnosis
The repeated job is not “two pictures of a switch.” It is one semantic control with:
- invariant anatomy: track + thumb + optional label slot outside the toggle if the system owns it;
- configuration API: reusable dimensions only;
- state vocabulary: `Off | On`, plus disabled availability;
- reusable interaction: reversible state transition;
- optional instance-specific product behavior that must not contaminate the reusable component contract.

### Decision variables
- Does state alter the same semantic job or create another job? Same job -> one component set.
- Is Disabled an independent dimension from On/Off? Yes -> model independently rather than `DisabledOff`, `DisabledOn` names.
- Does every consumer navigate after click? No -> navigation is not reusable component behavior.
- Does visual timing materially matter? If yes, keep temporal choreography as a separate decision concern; do not hide it inside state naming.

### Rejected alternatives
- **Separate components per state:** rejects propagation and turns state into identity.
- **One component with local overrides only:** no explicit reusable state API; consumers drift.
- **Screen-specific click wiring everywhere:** duplicates invariant interaction and makes fixes non-propagating.
- **Put navigation inside main variants:** wrongly globalizes product-specific behavior.

### Figma construction
1. Build one base component with stable semantic anatomy.
2. Create state variants with independent axes, for example `State=Off|On` and `Disabled=false|true` where the system genuinely needs both axes.
3. Expose only intended public properties; keep internal geometry private.
4. Read `componentPropertyDefinitions` from the component/set after creation. For TEXT/BOOLEAN/INSTANCE_SWAP properties, keep the **full returned API key including its `#...` suffix** for later API calls; do not reconstruct keys from visible labels.
5. Add the approved `CHANGE_TO` edges between sibling variants for enabled states as interaction-path evidence, without treating those edges as component identity.
6. If motion is material, keep thumb/track timing in the separate temporal-choreography concern rather than adding more variants to encode animation phases.
7. Create representative instances: default consumer, disabled consumer, and one consumer with an instance-level product interaction.

### Proof
- Component-set identity and variant axes read back correctly.
- Public property keys are captured from actual `componentPropertyDefinitions`.
- Representative instances remain instances; no detach is needed for ordinary usage.
- Prototype readback proves enabled `Off <-> On` state paths.
- A same-trigger instance interaction is tested as an override/precedence case rather than assumed to compose with inherited behavior.
- Disabled state has no accidental reversible transition if approved behavior says it is inert.

### Failure / re-entry
If consumers need many local overrides, do not add variants immediately. Classify each override as missing semantic property, contextual layout responsibility, product-specific behavior, or evidence that this is actually another component job.

### Anti-copy rule
Do not generalize “every component should be interactive.” Interactive behavior belongs in the reusable component only when consumers share the same semantic transition contract.

---

## Case 2 — Card Actions as a constrained Slot, not a variant matrix

### Product truth
A reusable Card has a stable `Actions` region. Most cards have zero, one, or two approved action components; arbitrary text/images in the Actions region are not allowed.

### Mediocre default
Create variants `NoAction`, `OneAction`, `TwoActions`, then add more variants for every action combination.

### Expert diagnosis
Child count and action identity are **content composition**, not visual/state identity. A Slot is the truthful unit because the Card owns the outer contract while the Actions region permits bounded composition.

### Decision variables
- Is the region stable across consumers? Yes.
- Does the region need more than one nested child? Yes -> Instance Swap alone is insufficient.
- Should any content be accepted? No -> use preferred values and child-count limits.
- Does violating a limit mean Figma will reject the edit? No -> violations must be inspected explicitly.

### Rejected alternatives
- **Variant for child count:** combinatorial and couples content count to component identity.
- **Instance Swap:** too rigid for 0–2 children.
- **Unconstrained Slot:** turns the component into an anything-goes frame.

### Figma construction
1. Create the Card component and stable Actions region.
2. Create a SLOT property for Actions.
3. Configure SlotSettings from product truth, for example:
   - `minChildren=0`;
   - `maxChildren=2`;
   - `allowPreferredValuesOnly=true` when the approved Action component family should constrain insertions;
   - choose `stretchChildOnInsert` from actual layout ownership, not habit.
4. Populate `preferredValues` with approved action components when the system has them.
5. Create representative instances: empty, one action, two actions, plus a deliberate invalid specimen.
6. Inspect each SlotNode's `limitViolations`. Do not assume a successful edit means the slot contract is valid.
7. Manipulate/reset Slot content through SlotNode/content mechanics; do **not** use `InstanceNode.setProperties()` for SLOT because that API does not support SLOT properties.

### Proof
- Slot definition includes the intended SlotSettings.
- Valid specimens report no limit violations.
- Invalid three-action or non-preferred specimen reports the expected violation kind.
- Card anatomy/layout remains stable with 0/1/2 approved children.
- The Slot does not force unrelated visual variants.

### Failure / re-entry
If the Slot needs radically different layout/anatomy for different content classes, reopen whether there are multiple semantic Card jobs rather than weakening slot constraints.

### Anti-copy rule
Do not use Slot merely because it is flexible. Prefer a narrower Text/Boolean/Instance Swap/Variant contract when the semantic freedom is narrower.

---

## Case 3 — Evolve a Button API without breaking 74 consumers

### Product truth
A local Button has many instances. The system now needs a leading-icon property and wants to normalize a confusing `Kind=Blue|Gray` axis into semantic `Emphasis=Primary|Secondary` without forcing every consumer to be rebuilt.

### Mediocre default
Create a cleaner new Button set and replace visible instances by copy/paste.

### Expert diagnosis
The job is **API migration with propagation**, not component recreation. The consumer population is evidence about what the current contract actually means.

### Decision variables
- Which axes are semantic vs literal appearance?
- Which existing overrides are legitimate consumer intent?
- Can the new property be added without changing identity?
- If identity must change, which dimensions map DIRECT / TRANSFORM / DROP / NEW_REQUIRED / CONFLICT?

### Figma construction
1. Inventory `componentPropertyDefinitions` and representative `instance.componentProperties` using exact returned property keys.
2. Sample dense, long-label, disabled, icon, and atypical consumers before mutation.
3. Prefer editing the existing source when ownership and semantics remain the same.
4. If a replacement source is required, build a compatibility map first; use migration mechanics such as component swap only where semantics are compatible.
5. Re-read representative consumer properties after migration; never infer preservation merely because the swap call succeeded.
6. Check prototype reactions if Button variants carry reusable interactions.

### Proof
Return the component identity decision, before/after API map, consumer sample, transformed/dropped dimensions, detach count, and any consumers requiring manual review.

### Failure / re-entry
If the new “Button” needs different action ownership or materially different anatomy across consumers, stop trying to preserve one component identity and reconsider the semantic boundary.

### Anti-copy rule
Migration safety is not “keep every old option forever.” Preserve valid consumer intent while removing obsolete dimensions explicitly and with evidence.
