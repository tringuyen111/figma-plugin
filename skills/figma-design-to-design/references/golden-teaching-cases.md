# Golden Teaching Cases

These cases teach **relationship selection**, not visual templates.

## Case 1 — Reuse a published Button, do not clone it

### Truth
Product B needs the same `Button/Primary` job already owned by the shared Core library. Product B should receive future Core fixes.

### Weak agent move
Copy the Button component from the source file into Product B because the pixels and variants look correct.

### Why that fails
The copied component is a new local identity. It looks right today but silently loses the shared update path and creates a competing source of truth.

### Decision space
- `FORK`: rejected — no independence requirement.
- `WRAP`: rejected — Product B adds no stable local responsibility.
- `REUSE_REMOTE`: chosen — same semantic job + desired upstream propagation.

### Execution
1. Verify source component/set identity and published key.
2. Verify Product B does not already have an authoritative equivalent.
3. Import the published component/set into Product B.
4. Create/configure instances through the imported identity.
5. Verify property options and representative state variants.
6. If the component is interactive, inspect inherited variant reactions in a representative instance/prototype.

### Completion
Return `upstreamRelationship=FOLLOW`, the imported/main component identity, representative consumer IDs, and structure/system/interaction evidence as applicable.

### Anti-copy rule
Do **not** generalize this into “always import shared components.” If Product B intentionally owns a divergent component contract, evaluate WRAP/FORK instead.

## Case 2 — Migrate a local Button to the shared library without destroying overrides

### Truth
Product B already has `Local/Button` with 74 instances. Core has become the approved source. Most instances use label text + leading icon overrides; two Product-B-only visual variants are obsolete.

### Weak agent move
Delete `Local/Button`, insert new Core buttons everywhere, then manually retype visible labels.

### Why that fails
It discards consumer identity, risks missed states/overrides, and makes migration non-auditable.

### Expert diagnosis
The terminal job is not “make screens use Core-looking buttons”; it is **replace one reusable identity while preserving compatible consumer intent**.

### Decision space
- `REUSE_REMOTE` alone: incomplete because existing consumers still point to the predecessor.
- `MIGRATE`: chosen.
- `FORK`: rejected because Core is now authoritative.

### Execution
1. Inventory `Local/Button` instances and override/property usage.
2. Compare old/new APIs:
   - label → DIRECT;
   - leading icon → DIRECT or TRANSFORM to Instance Swap;
   - obsolete local visual variants → DROP;
   - new required Core size property → derive/default or mark NEW_REQUIRED.
3. Import Core Button.
4. Swap representative instances first; inspect which overrides Figma preserves.
5. Repair only transformed/new-required dimensions.
6. Migrate remaining compatible instances.
7. Verify screens with dense/edge content plus interactive states.
8. Deprecate/remove predecessor only after zero material consumers remain.

### Completion
Return compatibility matrix, migrated/remaining consumer counts, preserved/lost override evidence, and the predecessor deprecation state.

### Anti-copy rule
Do not assume `swapComponent` guarantees semantic parity. It is a migration mechanism; representative consumer proof still decides success.

## Case 3 — Intentional fork with behavior preservation

### Truth
A regulated product starts from Core Toggle but requires a materially different state model and cannot inherit future Core behavior changes.

### Weak agent move
Detach one Toggle instance and edit its colors/states locally.

### Why that fails
A detached instance is neither a reusable source nor an explicit behavioral fork. Future designers cannot distinguish an intentional product contract from accidental drift.

### Decision space
- `WRAP`: rejected because the state model itself diverges.
- `REUSE_REMOTE`: rejected because future upstream behavior must not propagate.
- `FORK`: chosen.

### Execution
1. Record Core Toggle source identity and current component/property/reaction contract.
2. Create a new product-owned component set with explicit identity and naming.
3. Reconstruct only the semantically required anatomy/properties/variants.
4. Recreate the approved interactive state graph with `figma-prototype`; do not inherit behavior accidentally.
5. Bind product-owned tokens/variables where authority differs.
6. Verify component API, interaction path, visual states, and representative consumers.
7. Record `upstreamRelationship=NONE` and why.

### Completion
The new source is independently reusable and behaviorally complete; no consumer is left pretending to follow Core.

### Anti-copy rule
Forking is not a convenience for customization. It is justified only when independent ownership/future evolution is part of product truth.
