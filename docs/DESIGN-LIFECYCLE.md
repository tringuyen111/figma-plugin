# Design lifecycle — Figma Plugin 0.5.6

Figma Plugin treats design as durable identity, behavior, and distribution truth rather than only canvas pixels.

## Lifecycle

```text
AUTHOR
  -> component/token/style identity
  -> publication readiness
  -> USER/Figma publish + library enable authority
  -> DISCOVER / IMPORT
  -> REUSE / WRAP / FORK / MIGRATE / SYNC
  -> COMPONENT BEHAVIOR (Prototype + Motion)
  -> VERIFY
  -> EXPORT / CODE TRANSLATION
```

## Cross-file strategy

| Strategy | Future relationship |
|---|---|
| `REUSE_REMOTE` | Keep published upstream identity/update path |
| `WRAP` | Keep upstream core; add bounded local responsibility |
| `FORK` | Deliberately create independent local identity; upstream propagation ends |
| `MIGRATE` | Replace predecessor consumers with a new source while preserving compatible overrides/state |
| `SYNC` | Reconcile two meaningful active design truths and record ownership of differences |

The terminal proof is the intended future relationship, not current visual similarity.

## Library authority

`teamlibrary` permission enables local inspection of relevant enabled library data. It does not let ControlMux silently enable or publish a library. Publication/readiness/status and actual publish/enable actions remain distinct evidence/authority states.

## Reusable behavioral component

```text
COMPONENTS: semantic job -> anatomy -> props/slots/variants -> state vocabulary
PROTOTYPE:  trigger -> actions/conditions -> CHANGE_TO/navigation -> state path
MOTION:     keyframes/timing/easing -> temporal choreography
```

Variant interactions can be inherited by instances. A direct instance interaction with the same trigger can take precedence; diagnose precedence before duplicating reactions. When transferring/migrating components, interaction state is part of parity when the reusable contract owns it.

## Design -> Code result

- `IMPLEMENT`: repository bytes are the artifact; return compact change/proof record.
- `HANDOFF`: return a Design Translation Packet; do not claim code changed.

Provider design context/reference code remains evidence, not final output.


## Transactional transfer — 0.5.6

Cross-design work must bind **two exact targets** before any consequential write:

```text
source: instanceId + fileKey + evidenceBoundary
target: instanceId + fileKey + evidenceBoundary
strategy: REUSE_REMOTE | WRAP | FORK | MIGRATE | SYNC
        ↓
Transfer Ledger
        ↓
completed writes + target postconditions + pending proof
```

Initialize with `scripts/init_transfer_ledger.py`, validate with `scripts/validate_transfer_packet.py`, and re-read target identity before a resumed write. The ledger is resumability/idempotency state, not Design truth by itself. `references/design-transfer-packet.schema.json` serializes the intended transfer relationship; `references/transfer-ledger.schema.json` serializes execution progress.

Migration parity now includes component property API, Slot constraints/content legality, reusable prototype reactions when owned by the component contract, and explicit upstream relationship after transfer. Visual similarity alone is insufficient.
