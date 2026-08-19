# Verification method

## Claim -> minimum evidence

| Claim | Minimum relevant evidence |
|---|---|
| layer/layout construction is correct | structural readback of the exact target |
| design-system reuse is correct | component/variable/style/library bindings + representative consumers |
| visual composition is correct | rendered evidence at material state/content/viewport |
| prototype behavior is wired | reactions/actions/state-path trace |
| Motion is correct | motion/keyframe/timing context; rendered phases when order/timing is material |
| design matches production | verified mapping + repository/runtime + visual/system comparison |
| design-only accessibility checks pass | exact inspectable obligations only; never whole-product accessibility |

## Finding packet

```text
ID / severity
Observed
Expected + source
Evidence
Dimension
Consequence
Repair owner (optional)
```

## False-pass checks

Before PASS, ask:

- Did I inspect the exact target rather than a sibling/sample?
- Is the evidence type capable of proving this claim?
- Did I mistake provider acknowledgement for resulting state?
- Did I inspect representative state/content/mode when the claim generalizes beyond one instance?
- Is any required dimension still NOT_RUN/MISSING/BLOCKED?

## Overall verdict

Derive only from requested dimensions. Example:

```text
structure: PASS
system-reuse: FAIL
visual: PASS
accessibility: NOT_RUN

bounded verdict: FAIL (required system-reuse failed)
```

Do not average dimensions or hide a required FAIL behind several PASS results.
