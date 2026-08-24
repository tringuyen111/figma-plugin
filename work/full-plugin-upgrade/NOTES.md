# Rolling notes — full plugin upgrade

## Bound outcome

Upgrade the current `0.6.0` candidate without turning static validation into live Figma, tunnel, behavioral, hosted, UAT, or release proof.

## Current decisions

- Keep sixteen accountable Skill boundaries for this pass; shorten discovery and add bundled MCP dependencies without inventing a new product namespace.
- Preserve legacy MCP text payloads while adding structured envelopes and output schemas.
- Require accountable context before `figma_exec`, `figma_apply`, or `figma_export`; postconditions remain evidence obligations.
- Use the existing stdio MCP as the future private tunnel target. Do not create `.app.json` before a registered app/connection ID exists.
- Keep behavioral improvement `NOT_RUN` until same-task executions compare the frozen arms.

## External blockers

- No OpenAI `tunnel_id`, runtime API key, tunnel RBAC, ChatGPT workspace association, or installed `tunnel-client`.
- No connected Figma companion in the current session.
- No approved public gateway/OAuth/desktop-relay architecture or publication authority.

## Evidence checkpoints

- Package and plugin manifests aligned at `0.6.0`; doctor and capability checks now reject drift.
- Sixteen Skill descriptions reduced while methodology stayed local; MCP dependencies and conditional resource reachability validated.
- Obligation-ledger v2 positive/negative tests pass; terminal PASS now rejects project-local evidence paths that do not exist.
- MCP contract: full build PASS (21 files / 114 tests), shipped-bundle smoke PASS, and status-only MCP smoke rejects missing trace/operation/postconditions plus a caller-disguised raw mutation (`kind=read`) with structured `INVALID_PARAMS`. Query/apply/export schemas now advertise exactly the `read`/`write`/`export` kinds enforced at runtime.
- The first isolated install exposed a real packaging defect: Codex copied the package without running `npm install`, while the server bundle externalized `@modelcontextprotocol/sdk`. Runtime dependencies are now bundled; the ESM entrypoint supplies `createRequire` for CommonJS dependencies, and a copied-bundle-only MCP smoke guards this boundary.
- The package ships `THIRD_PARTY_NOTICES.md`; build metadata found nine bundled runtime packages and admitted all nine notices.
- Fresh-install/package proof PASS for bundle `d7e97ac5655b595c`: archive SHA-256 `8215064efa8fd2ce025e309aff8a4d7fb5c292a58f7679d7c4cb8af0ca12e06d`, 133 archive files, 133 installed files, zero missing/extra/hash mismatches, installed doctor `READY`, and installed MCP handshake exposed all five tools.
- The isolated installed plugin, marketplace, cache path, generated archive, and quarantine directory were removed after evidence capture. Canonical source and unrelated plugins were preserved.
- Live Figma remains disconnected and is not implied by the installed MCP handshake. The next local frontier is the frozen same-task behavioral comparison; it remains `NOT_RUN`.
