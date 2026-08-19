# Golden Teaching Cases

These cases teach **interaction-graph reasoning and Figma prototype proof**, not screen-flow templates.

## Case 1 — Interactive Toggle plus an instance-specific same-trigger action

### Product truth
A reusable Toggle owns `Off <-> On` on click. On one settings screen, clicking a particular Toggle instance must instead open a confirmation flow before the product state changes.

### Mediocre default
Add the confirmation navigation to the component variants so every Toggle gets it, or add a second click reaction and assume both the inherited state change and instance navigation will run.

### Expert diagnosis
Two authorities are colliding on the same trigger:
- reusable component behavior owns local state transition;
- one product instance owns confirmation/navigation.

A same-trigger instance interaction can take precedence over an inherited variant interaction. The agent must model the intended precedence rather than duplicate reactions and hope they compose.

### Decision space
- **Globalize confirmation in the component:** rejected; product-specific.
- **Keep inherited Change-to and add same-trigger Navigate:** only correct if inspected precedence yields intended behavior; do not assume both fire.
- **Override click at this instance with confirmation path:** chosen when confirmation is the approved product behavior.
- **Use a different trigger for secondary behavior:** valid only if the product really defines another input.

### Figma construction
1. With `figma-components`, define `State=Off|On` and any availability state.
2. On component variants, add approved `CLICK -> CHANGE_TO` reactions for reusable state changes.
3. Create a representative instance and verify inherited interaction.
4. Add the approved instance-level click interaction for the confirmation flow.
5. Read back reactions at both variant and instance levels and classify the same-trigger precedence explicitly.
6. Trace confirmation cancel/recovery back to the source context.
7. If state persists after confirmation, represent that approved state change explicitly; do not let the prototype imply product persistence that is not modeled.

### Proof
- Exact source variant/instance IDs.
- Trigger/action readback at variant and instance.
- Primary path and cancel/recovery path.
- Explicit statement of which same-trigger behavior wins in the representative instance.
- No claim about production runtime semantics beyond what Figma prototype evidence can prove.

### Failure / re-entry
If the instance must reproduce almost all reusable interaction locally, reopen the component/product behavior boundary instead of accepting duplicate graphs.

### Anti-copy rule
Do not treat instance overrides as a normal customization mechanism. They are appropriate when product-specific behavior genuinely outranks reusable component behavior in that context.

---

## Case 2 — Select opens a transient option plane and returns context correctly

### Product truth
A compact form Select opens options without replacing the form. Choosing an option updates the visible selection and closes the transient plane. Cancel/outside-dismiss returns to the same form context with no selection change.

### Mediocre default
Navigate to a separate screen because it is easy to wire, or overlay a menu with no dismiss/recovery path.

### Expert diagnosis
The semantic job is selection inside the current task. The interaction graph must preserve underlying form context and define how the transient plane appears, receives input, commits/cancels, and exits.

### Decision variables
- Does the user leave the current task context? No -> overlay/transient plane is preferable to navigation.
- Does opening the plane change data? No -> opening is not commit.
- Which actions commit vs dismiss?
- What state must be visible after return?

### Figma construction
1. Identify source Select state and option-plane destination.
2. Wire `CLICK -> OPEN_OVERLAY` (or the current Figma equivalent supported by the target context).
3. Define option selection as the approved state/variable update followed by close/return.
4. Define cancel/outside/back dismissal without mutating selection.
5. Keep overlay positioning/plane ownership with `figma-scene`; keep transition choreography with `figma-motion` only if timing is material.
6. Trace source -> open -> choose -> return and source -> open -> cancel -> return.

### Proof
- Open reaction points to exact overlay target.
- Commit path and dismiss path differ in state mutation as intended.
- Underlying context identity is preserved.
- Representative selected value is visible after commit.

### Accessibility proof boundary
Figma prototype evidence can support represented focus treatment, visible target geometry, state cues, and authored interaction paths. It does **not** prove production DOM/accessibility-tree semantics, complete keyboard behavior, screen-reader behavior, or real assistive-technology operation. Keep those claims `NOT_RUN` until runtime evidence exists.

### Failure / re-entry
If options require their own multi-step task, search, or substantial navigation context, reopen whether a transient overlay is still the correct product structure.

### Anti-copy rule
Do not infer “Select = overlay” universally. Choose navigation/overlay/component-state from context continuity and approved behavior, not control name.

---

## Case 3 — Conditional validation without simulating a backend

### Product truth
A prototype needs to demonstrate that Save is blocked when one required local field is empty, shows the field error, and succeeds when the field is populated. Server validation and persistence are outside prototype scope.

### Mediocre default
Build a fake database with many variables, success/failure probabilities, loading timers, and hidden backend state so the prototype feels realistic.

### Expert diagnosis
The learning question is one local conditional path. Only state required to represent that branch belongs in the prototype.

### Decision space
- **Static error/success screens only:** insufficient if the user must demonstrate the conditional trigger.
- **One local field-validity variable/condition:** chosen.
- **Backend simulation:** rejected; no Product/runtime authority and no extra learning value.

### Figma construction
1. Bind the smallest variable/state representation required for `empty | populated`.
2. On Save, author the conditional action according to current Figma reaction/action support.
3. Empty branch -> error state/focus treatment represented in the prototype.
4. Populated branch -> approved local success/destination state.
5. Add recovery: editing the field removes or supersedes the error state according to approved behavior.
6. Read back condition/actions and trace both branches.

### Proof
- Initial variable/state value is explicit.
- Both branches are reachable and have exact destinations/state effects.
- Error recovery is traceable.
- No claim that server-side validation/persistence was proven.

### Failure / re-entry
If the requested decision depends on latency, server conflict, authentication, or persistence semantics, stop extending prototype variables and hand the unresolved runtime behavior back to Product/engineering truth.

### Anti-copy rule
Use variables/conditions to model the smallest interaction state required for the prototype question, not to recreate the application backend in Figma.
