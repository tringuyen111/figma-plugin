# Design lifecycle

Current package: `0.7.0` · Protocol: `10`.

Figma Plugin treats design as identity, behavior, distribution, and future update truth—not only canvas pixels.

## Lifecycle

```text
AUTHOR
-> component / token / style identity
-> publication readiness
-> user or Figma publication and enablement authority
-> DISCOVER / IMPORT
-> REUSE / WRAP / FORK / MIGRATE / SYNC
-> COMPONENT + PROTOTYPE + MOTION behavior
-> VERIFY
-> EXPORT or CODE TRANSLATION
```

## Cross-file strategies

| Strategy | Intended future relationship |
|---|---|
| `REUSE_REMOTE` | preserve the published upstream identity and update path |
| `WRAP` | preserve the upstream core and add bounded local responsibility |
| `FORK` | create an intentionally independent identity; propagation ends |
| `MIGRATE` | replace predecessor consumers while preserving required compatibility |
| `SYNC` | reconcile two meaningful truths and record ownership of differences |

Completion proves the intended relationship, identity, consumers, and update path. Current visual similarity is insufficient.

## Library authority

`teamlibrary` permission supports inspection of accessible local/enabled library data. It does not silently publish a library, publish updates, or enable a library in another file. Readiness, status, user authority, and completed publication are different states.

Published-key import requires the exact published identity. A local key or `getPublishStatusAsync()` value by itself is not a publish command.

## Reusable behavior

```text
COMPONENTS  semantic job -> anatomy -> props / Slots / variants -> state vocabulary
PROTOTYPE   trigger -> condition -> action -> destination / state / recovery
MOTION      subject -> keyframes -> timing / easing -> temporal settle
```

An instance may inherit variant reactions; a direct instance reaction on the same trigger may take precedence. Diagnose ownership and precedence before adding duplicate reactions.

When a reusable component owns behavior, migration parity includes its property API, Slot legality, state vocabulary, reactions, motion obligation, and upstream relationship—not only appearance.

## Transactional transfer

Consequential cross-file writes bind two exact targets first:

```text
source: instanceId + fileKey + evidence boundary
target: instanceId + fileKey + evidence boundary
strategy
-> Transfer Ledger
-> completed writes
-> target postconditions
-> pending proof
```

The ledger supports resumability and idempotency; it is not Design truth by itself. Re-read target identity before a resumed write. Schemas and validators live under `skills/figma-design-to-design/`.

## Design to code

- `IMPLEMENT` — production repository bytes change; return the bounded changed surface and proof.
- `HANDOFF` — return a validated Design Translation Packet; do not claim implementation.

Provider design context and generated reference code are input evidence. They are not the final implementation or parity proof.

## Verification and export

Verification is claim-scoped and read-only by default. Export is a runtime egress primitive. Neither one silently upgrades missing visual, interaction, temporal, accessibility, publication, or UAT evidence.
