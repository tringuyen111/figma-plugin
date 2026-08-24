# Completion support packet

This packet records the smallest external inputs needed to close the remaining
behavioral obligation and documents the future-only tunnel option. It is deliberately kept under `work/`, so it does not change
the npm archive or the published plugin runtime.

## Current evidence boundary

Already proven locally and in the live Figma companion:

- build and shipped-bundle smoke: `21` test files / `114` tests;
- fresh install: `133/133` files with zero hash mismatches;
- installed doctor and five-tool MCP handshake;
- private GitHub publication of the `figma-plugin/` subtree;
- live Figma write -> raw/typed readback -> PNG export -> exact cleanup on bundle
  `d7e97ac5655b595c` (see `output/figma-evidence/live-upgrade-proof-2026-08-24.json`).

Still open, and intentionally not reported as PASS:

1. Same-task behavioral comparison of the upgraded agent against a frozen baseline.

Secure MCP Tunnel is intentionally deferred by the user for this candidate. It is
not a prerequisite for the local package/Figma proof and does not require an API key
or Platform setup now.

## Future-only support for Secure MCP Tunnel

This section is retained only so a future pilot has a clear boundary. No action is
needed for the current candidate. If the tunnel is reopened later, the following
items will be required; do not paste secrets into chat, Git, issue comments, or this
file.

- an OpenAI Secure MCP `tunnel_id` for the target workspace;
- a runtime API key/credential available through a local secret or environment
  variable (the value itself must remain local);
- tunnel RBAC that allows the verification identity to read and use the tunnel;
- confirmation that the tunnel is associated with the intended ChatGPT workspace
  and that the workspace/developer connection is enabled;
- the official `tunnel-client` installed and callable from the verification
  environment, or permission to install it there;
- the final MCP target URL/command expected by that tunnel, if it differs from the
  bundled stdio server.

Reference: [OpenAI Secure MCP tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels).

Once those inputs are available, I can run a bounded proof that records tunnel
identity, authenticated handshake, tool inventory, one read operation, one
disposable write/readback/cleanup operation, and final queue/in-flight state. The
secret value will not be recorded in evidence; only provider IDs, redacted status,
and hashes will be retained.

## Support needed for behavioral A/B proof

The candidate is not called “better” until the same cases run through both arms.
Choose or provide:

- a frozen baseline revision and the upgraded candidate revision (the current
  candidate bundle is `d7e97ac5655b595c`);
- the same model/provider, tool permissions, Figma fixture, and timeout budget for
  both arms;
- at least 10 representative tasks, or approval for me to construct a fixed local
  suite from the existing plugin contract;
- a local runner/credential and a usage budget. GitHub Actions is currently manual
  only because the account spending limit/payment state prevented a hosted runner;
  no automatic CI usage is being consumed.

The proposed first-pass measurements are:

| Measure | Proposed acceptance |
| --- | --- |
| required obligation closure | 100% of applicable obligations have evidence refs |
| false PASS / unsupported claim | 0 |
| duplicate, unauthorized, or uncleaned mutation | 0 |
| representative task success | candidate must not regress versus baseline |
| tool-call count, tokens, latency | report baseline/candidate deltas; agree any budget threshold before release |

Expected artifacts are one redacted JSONL record per case, a summary comparing both
arms, and the plan update that links each admitted result. Until the corpus, runner,
and same-environment authority exist, the truthful state remains `NOT_RUN`.

## Resume checklist

1. Keep credentials in a local secret store/environment only.
2. Run the local build/package checks and, when the companion is available, the live
   Figma proof script.
3. Start the official tunnel client, verify the redacted handshake, and capture the
   tunnel evidence without recording secrets.
4. Run the frozen behavioral suite against baseline and candidate.
5. Update `plan.json` only from the resulting evidence; do not convert a missing
   provider or missing behavioral run into PASS.
