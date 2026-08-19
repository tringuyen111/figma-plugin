# Design-to-Code Output Contract

Use this reference when deciding what the Skill actually returns. Provider context is evidence; the terminal output is either changed production bytes or a bounded handoff contract.

## Mode selection

| Condition | Mode | Accountable result |
|---|---|---|
| Target repository is bound and writes are authorized | `IMPLEMENT` | Actual production code changes + proof record |
| Repository is read-only, unavailable, or user requests a handoff | `HANDOFF` | Design Translation Packet |

Do not switch to `HANDOFF` merely because implementation is difficult. Do not claim `IMPLEMENT` when no target bytes changed.

## IMPLEMENT result

Return only what downstream/user needs to understand the completed integration:

```text
source
  figma file/node identity
  design evidence/revision boundary

target
  repository/revision/stack

changed
  files[]
  reused components[]
  adapted components[]
  created components[]
  token mappings[]
  asset mappings[]
  state/interaction mappings[]
  motion mappings[]

proof
  type/build/test/runtime
  visual parity where required
  temporal/accessibility where required

unresolved[]
```

The codebase is the artifact. Do not paste the complete generated Figma reference code after the real implementation exists.

## HANDOFF result — Design Translation Packet

```text
source
  fileKey
  nodeId
  design evidence/revision boundary

target
  repository/revision if known
  framework/platform

mappings[]
  figma identity / semantic role
  code identity or target location
  strategy: REUSE | ADAPT | CREATE
  prop/state/slot mapping

tokens[]
assets[]
interactions[]
motion[]
unresolved[]
proofRequired[]
```

The packet must be implementation-ready but implementation-neutral where target repository truth is unknown. Raw provider payloads do not satisfy this contract. Serialize machine-consumed packets against `design-translation-packet.schema.json`; `scripts/validate_translation_packet.py` provides a dependency-free invariant check when execution is available.

## Provider evidence boundary

`get_design_context` may contain reference code, asset URLs, screenshots, component hints, and metadata. Treat each as input evidence. Reconcile it with repository owners before output. Code Connect increases confidence in component identity but does not override current repository truth.

## Failure tests

- If the response is mostly provider-generated code: translation did not finish.
- If `IMPLEMENT` has no changed production bytes: the mode claim is false.
- If `HANDOFF` lacks target mapping/conflicts/proof needs: it is a design dump, not a handoff.
- If raw pixels/hex values replace existing project components/tokens: semantic reconciliation failed.
