# Figma Plugin 0.7.0 — typed CRUD and strict audit

Candidate bundle revision: `7ad66b0fd6d27d11`  
Protocol: `10`  
Public tools: `figma_status`, `figma_query`, `figma_apply`, `figma_exec`, `figma_export`

## Runtime contract

- `figma_query` adds `artifact_manifest`, paginated `entity_graph`, `change_feed`, `component_integrity`, `binding_inventory`, `prototype_graph`, `motion_snapshot`, and `accessibility_design_facts`. Extended results use schema version 2 with exact target, cursor, coverage, facts, limitations, and observation time.
- `figma_apply(action=apply_entity_patch)` validates at most 100 operations, plans by deterministic `planHash`, requires `dryRun:false + confirm:true + expectedPlanHash` for execution, detects stale/overlapping changes, and returns typed readback plus `ROLLED_BACK` or `PARTIAL_COMMIT` recovery state.
- Node metadata uses `controlId` in shared plugin data. Styles, variables, and collections use a bounded document-root registry. Duplicate identities are reconciled by preserving the first object and assigning a new ID with `forkedFrom`.
- The companion registers document/style events, coalesces a 2,000-record journal, tracks agent correlation where Figma exposes it, fingerprints variables every five seconds, and reports degraded page scope or resync-required state explicitly.
- `figma_exec` remains an escape hatch. The companion rescans after raw execution; raw execution is not an audit verdict or sync proof.

## Strict-audit artifacts

`AuditProfile`, `AuditReport`, and `UpgradeRun` are separate JSON artifacts. The Luma Bank checklist is stored as a profile fixture at `evals/fixtures/luma-bank-strict-audit.profile.json`; it contains obligations and regression cases, not verdicts. `skills/figma-verification/scripts/audit-run.mjs validate` rejects checklist PASS values, missing target/snapshot evidence, mismatched hashes, screenshot-only runtime claims, unresolved required overall PASS, incomplete BLOCKED packets, and `PARTIAL` statuses.

## Verification boundary

Local evidence is current for typecheck, 24 test files / 121 tests, bundle build, capability checks, and shipped-bundle smoke. The live Figma two-way proof is `NOT_RUN` for this candidate because no Figma companion instance is connected in the current runtime; reload the companion from `plugin/manifest.json` and collect typed write/readback, UI edit, conflict, rollback, variable fingerprint, PNG, hash, and exact-bundle evidence before claiming live sync or behavioral uplift.
