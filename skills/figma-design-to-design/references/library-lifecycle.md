# Library Lifecycle and Cross-File Identity

Use this reference when cross-file work depends on published identity, enabled libraries, import keys, consumer migration, or update propagation.

## 1. Classify source identity

| Source | Durable meaning | Typical target operation |
|---|---|---|
| local unpublished component/style/variable | source exists only in source file | keep local, publish with authority, or intentionally fork |
| published component/component set | library identity with key | import by key, create/use instances |
| published style | reusable remote style identity | import by key and apply |
| published variable | reusable remote variable identity | import by key and bind |
| remote/imported asset | already follows another library source | keep remote relation unless intentionally migrating/forking |
| loose node/media | no reusable system identity by itself | copy/reconstruct only if that is the intended contract |

## 2. Discovery authority

Prefer live provider library discovery (`get_libraries`, `search_design_system`) when available because it can search subscribed/available design libraries semantically.

Native local fallback:
- known published keys can be imported directly;
- `figma.teamLibrary` can inspect enabled library variable collections/variables when the plugin has `teamlibrary` permission;
- enabled-library state is user/Figma state, not something the Plugin API may silently change.

Do not use a stale packaged provider snapshot as proof that a current hosted tool exists.

## 3. Publication status and authority

Where supported, `getPublishStatusAsync()` distinguishes whether a component/style is unpublished, current, or changed relative to its library version. Treat that as readiness/status evidence, not as publication itself.

Publication and library enablement are accountable Figma/user release actions. If the host surface does not expose an authorized publish/enable action, stop at `READY_FOR_PUBLISH` / `LIBRARY_ENABLE_REQUIRED` and provide the exact blocker.

## 4. Migration compatibility matrix

Before replacing target consumers, classify each property/state dimension:

```text
DIRECT       same meaning and compatible representation
TRANSFORM    same meaning, different property/variant/slot representation
DROP         predecessor dimension is intentionally obsolete
NEW_REQUIRED replacement needs a value the predecessor did not expose
CONFLICT     both sides claim incompatible semantics/authority
```

For instances, prefer `swapComponent` when replacement semantics are compatible, then inspect what Figma preserved. Never infer override preservation from a successful API call alone.

## 5. Interaction preservation

Interactive components can carry variant interactions that instances inherit. For a component migration, inspect:
- state variants;
- `Change to` / other reactions on main component variants;
- additional instance-level interactions;
- variable/conditional actions;
- reset/state-continuity behavior where relevant.

A migration that preserves visuals but loses reusable behavior is `PARTIAL` or `FAIL`, not `PASS`.

## 6. Update relationship record

Finish each transferred asset with:

```text
sourceFile / sourceIdentity / key
strategy
newTargetIdentity
consumerIds or representative consumer scope
upstreamRelationship = FOLLOW | WRAPPED | NONE | RECONCILED
manualAuthorityStillRequired
proofCollected
```

## 7. Transfer ledger and two-instance targeting

Cross-file operations must bind source and target explicitly. Before mutation, record:

```text
source.instanceId + source.fileKey + source evidence boundary
target.instanceId + target.fileKey + target evidence boundary
strategy
mapping decisions
completed writes + exact target postconditions
pending proof
```

Do not infer source/target from connection order after another Figma window opens or reconnects. On resume, re-read the ledger and re-inspect each target identity before repeating a write. A completed write is idempotency evidence only when its postcondition still holds.

Use `transfer-ledger.schema.json` as the durable shape. The ledger is workflow state, not a new source of design truth.

## 8. Slot and component-property migration parity

A visually successful component migration can still break the reusable API. Include these dimensions in compatibility review:

- exact component property definitions and full API property keys;
- variant options/state vocabulary;
- Slot definitions, `slotSettings`, preferred values, and representative `SlotNode.limitViolations`;
- instance-level property/slot content that must survive;
- inherited prototype reactions and deliberate instance interaction overrides.

For TEXT/BOOLEAN/INSTANCE_SWAP properties, preserve/map the full Figma property key including the unique `#...` suffix when native API calls require it. Do not treat visible property labels as stable API keys. SLOT content is not migrated through `InstanceNode.setProperties()`; inspect/rebuild the actual slot content contract.
