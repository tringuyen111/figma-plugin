---
name: figma-design-to-design
description: "Transfer, reuse, migrate, or sync design truth across Figma files/libraries while preserving intended component, style, variable, instance, and interaction identity. Use for library use, shared-component replacement, cross-file drift, or deliberate forks. Own cross-design identity and proof; not redesign, code translation, or publication approval."
---

# Figma Design to Design

Move **design truth between design contexts** without reducing reuse to copy/paste.

## Terminal job

Given an exact source design identity and exact target design context, choose and execute the correct reuse/transfer strategy so the target receives the intended design semantics **with the correct future update relationship**. Complete when source/target identities, consumer migration, interaction/system behavior, and the intended propagation path are inspectable.

## Decision advantage

This Skill earns its place by deciding **what relationship the target should have to the source after transfer**. A visually identical clone can be wrong if the user expected library updates; a remote instance can be wrong if the target intentionally needs an independent product fork. Decide among reuse, wrap, fork, migrate, and sync from semantic identity + ownership + future propagation intent, then preserve that decision through Figma library/import/instance mechanics.

## Skill I/O contract

**Minimum input**
- exact source file/asset identities and whether they are local, published, or remote;
- exact target file/system identities and existing competing assets;
- user intent for future updates: follow upstream, extend upstream, replace an old local asset, reconcile drift, or become independent.

**Escalate input only when** identity or compatibility is unresolved: inspect component properties/variants/slots, variable/style roles, representative instances/overrides, prototype reactions, publish status, enabled libraries, or a small set of consumers. For image/SVG transfer, use provider asset download/upload only when the actual binary asset must cross files.

**Return** a source→target identity map, strategy per asset (`REUSE_REMOTE | WRAP | FORK | MIGRATE | SYNC`), created/imported/reused identities, migrated consumers, preserved/lost update relationships, unresolved authority gates, and structure/system/interaction proof. Do not return a pile of copied node IDs as if that proved reuse.

## Operational vocabulary

**SOURCE IDENTITY** — the exact reusable design identity and semantic job being transferred, including its local/published/remote relationship and key when relevant. Equal pixels are not Source Identity.

**TARGET INTENT** — the future relationship the target is supposed to have with the source: follow, extend, replace, reconcile, or deliberately diverge. Strategy follows Target Intent.

**UPSTREAM RELATION** — whether and how future source changes should propagate to the target after transfer. `FOLLOW`, wrapped-follow, none, or reconciled are materially different outcomes.

**MIGRATION COMPATIBILITY** — which source/target contract dimensions are direct, transformed, dropped, newly required, or conflicting. A successful import/swap call does not prove compatibility.

**TRANSFER LEDGER** — durable state for source/target binding, strategy, writes, postconditions, pending proof, and resume/idempotency. The ledger records workflow truth; it does not become design authority.

**PROPAGATION PROOF** — evidence that the intended Upstream Relation and consumer behavior actually survive the transfer. Visual similarity alone is insufficient.

## Governing model: identity before pixels

For every transferable asset, record:

```text
SOURCE IDENTITY
  semantic job
  local / published / remote
  key + owner when reusable
  component/style/variable/system role
  interaction contract when relevant

TARGET INTENT
  follow upstream?
  extend upstream?
  replace local predecessor?
  reconcile drift?
  intentionally diverge?

STRATEGY
  REUSE_REMOTE | WRAP | FORK | MIGRATE | SYNC

POSTCONDITION
  target identity
  consumer relation
  update path
  proof
```

Equal appearance is not identity equivalence.

## Transaction and resume contract

Cross-file work is a transaction across **two exact Figma instances**, not a sequence of vague page switches. Before the first write, bind `source.instanceId + fileKey + evidenceBoundary` and `target.instanceId + fileKey + evidenceBoundary`, choose the strategy, and initialize a Transfer Ledger. Read `references/transfer-ledger.schema.json` and `references/design-transfer-packet.schema.json` when the work spans multiple calls/windows or must survive context truncation.

The ledger must record mapping decisions, every completed target write with its postcondition, pending proof, and preserved/broken relationships. Re-read the target identity before a resumed write; do not rely on window ordering or conversation memory. Keep writes idempotent: a resumed run must inspect the ledger + target before creating/importing again.

When local execution is available, create the initial ledger with `scripts/init_transfer_ledger.py` rather than inventing an ad-hoc state file, then validate with `scripts/validate_transfer_packet.py ledger <path>`. Validate Design Transfer Packets with `scripts/validate_transfer_packet.py packet <path>`. These scripts prove the state/packet contract only; they do not prove Figma postconditions.

## Strategy selection

### REUSE_REMOTE — keep the upstream update path

Choose when the published source asset already owns the correct semantic job and the target should continue receiving upstream changes.

- Discover/verify the exact library asset before import.
- Prefer published component/component-set/style/variable keys over reconstructing local copies.
- Import the remote asset, then create instances/bind consumers rather than detaching.
- Preserve the remote identity in the result record.
- Verify representative consumers, overrides, bindings, and inherited interactions.

Use current supported library-discovery/import mechanics for published identities and revalidate live provider/API surfaces before execution. Exact provider/native mechanics live in `references/library-lifecycle.md` so this workflow can reason from identity and update intent first.

### WRAP — preserve upstream core, add local responsibility

Choose when the upstream asset is semantically correct but the target needs a stable additional product-local contract.

- Keep the imported/remote instance nested inside a local wrapper component.
- Put only the new local responsibility in the wrapper.
- Do not re-expose every upstream property mechanically; expose the subset the local job actually needs.
- Verify that upstream updates still reach the nested source while local behavior remains owned locally.

Reject WRAP when the target merely wants visual tweaks that belong in an existing upstream property/variant/token.

### FORK — create a new independent identity deliberately

Choose only when the target must stop following upstream.

- Make the loss of upstream propagation explicit before materializing.
- Reconstruct/copy the required component/system semantics into new local identities.
- Preserve internal dependencies, properties, slots, variable/style bindings, and prototype reactions that are part of the forked contract.
- Rename/own the new source clearly so future agents do not mistake it for the original library asset.

A detached instance is not automatically a legitimate fork. Detach is evidence that identity was discarded; the Skill must still create a coherent new source of truth.

### MIGRATE — replace an existing target identity

Choose when the target already has a predecessor that should be replaced by the source/upstream asset.

1. Inventory predecessor consumers and representative overrides.
2. Compare old vs new component APIs/state/slot semantics.
3. Build a compatibility map: direct, transformed, dropped, manual-review.
4. Import/resolve the replacement source.
5. Prefer `swapComponent`/equivalent instance migration where compatible so Figma can preserve valid overrides.
6. Repair only the incompatible overrides/props/states.
7. Verify representative consumers before removing/deprecating the predecessor.

Do not delete the old source while consumers still depend on it.

### SYNC — reconcile two active design representations

Choose when both source and target contain meaningful design truth and drift must be reconciled rather than blindly overwritten.

- Diff semantic contracts, not raw node trees.
- Classify differences as upstream change, target-authorized extension, accidental drift, or unresolved authority conflict.
- Apply the smallest directionally correct update.
- Record which side remains source-of-truth for each disputed dimension.
- Verify propagation and representative consumers after reconciliation.

If both sides legitimately own different product variants, split the contract instead of forcing false convergence.

## Library lifecycle

Read `references/library-lifecycle.md` when publication, enabled libraries, import keys, migration, or update propagation is material.

The durable lifecycle is:

```text
LOCAL SOURCE
  -> publication readiness
  -> USER/Figma publish authority
  -> published identity/key
  -> target library discovery/enablement
  -> import/reuse
  -> instance/binding consumption
  -> upstream change
  -> update/migration/reconciliation
  -> consumer proof
```

Important authority boundary:
- `figma.teamLibrary` requires the `teamlibrary` plugin permission and only sees relevant enabled library-variable collections.
- Libraries must be enabled by the user/Figma UI; do not claim the Plugin API can enable them.
- Publication is a release side effect. Inspect `getPublishStatusAsync()` where supported, but do not claim ControlMux published a library without actual accountable evidence.

## Reusable component + interaction preservation

A reusable Figma component can carry configuration and behavior. When transferring/reusing components, inspect whether the contract includes:

```text
semantic job
anatomy / slots
component properties / variants
state vocabulary
prototype reactions / state progression
variables / conditions
temporal choreography when part of reusable behavior
```

Component anatomy/API, interaction-state progression, and temporal choreography remain distinct semantic contracts. This workflow owns only whether the required contracts survive across the source→target identity relationship.

Do not migrate a component as “successful” if its reusable interaction contract was silently lost.

## Asset transfer boundary

Components/styles/variables should preserve reusable Figma identity where possible. Images and SVG source media have different transport mechanics. Prefer an authorized raw-source transfer path over screenshot/re-encoding; if the available execution surface can only export but cannot import into the target, report binary cross-file import as `BLOCKED` rather than embedding large bytes into an execution request. Exact transport mechanics live in `references/library-lifecycle.md`.

## Worked transfer cases

Read `references/golden-teaching-cases.md` when choosing among reuse/wrap/fork/migrate/sync or when a copy/paste-looking solution seems tempting. The cases explicitly show rejected alternatives and post-transfer proof.

## Failure and correction

- **Copy/paste called reuse:** identify whether the target needs an upstream relationship; import/instance or explicitly fork.
- **Remote component detached for a small customization:** test property/variant/wrapper options before discarding identity.
- **Library key imported but wrong semantic job:** re-evaluate meaning/consumer contract; key validity is not semantic equivalence.
- **Migration loses overrides:** compare API/state compatibility first; repair only incompatible dimensions and re-check consumers.
- **Fork still named like upstream:** establish new ownership/identity so future sync does not treat it as the original.
- **Reusable interaction disappears after migration:** inspect inherited/main-component reactions, state variants, and interaction-state contract; return the causal interaction gap for repair without changing the transfer strategy blindly.
- **User expected automatic publishing/enabling:** preserve the authority gate and report the exact manual/Figma action still required.

## Proof

Use the evidence dimensions the claim actually needs:

- `system-reuse`: imported/published identity, key, bindings, source relationship;
- `structure`: instance/main-component/property/slot relationships;
- `interaction`: inherited or reconstructed reaction/state path when behavioral components are in scope;
- `visual`: representative consumer render when appearance could drift;
- `translation-parity`: only when the transfer is also expected to preserve code mappings.

Completion requires the **intended future relationship** to be proven, not only current visual similarity.

## Boundaries

- Creation/governance/publication readiness of the source system, deep asset-contract redesign, production-code translation, and deterministic design↔code mappings remain separate concerns.
- This workflow owns cross-design identity, Target Intent, strategy, migration compatibility, Upstream Relation, consumer migration, and Propagation Proof.

## Provenance

WHEN provider/library behavior or supported transfer mechanics could have changed, READ `references/provenance.md` and revalidate current official/live surfaces before consequential writes.
