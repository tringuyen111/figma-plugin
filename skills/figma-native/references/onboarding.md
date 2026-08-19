# Setup and connection recovery

Use this reference when Figma Plugin is being installed, registered, connected, or diagnosed. Move from an unknown local state to a verified Figma target without making the user guess what the agent needs.

## Setup state model

```text
PACKAGE_READY
  -> MCP_REGISTERED
  -> FIGMA_PLUGIN_IMPORTED
  -> FIGMA_PLUGIN_RUNNING
  -> STATUS_VERIFIED
  -> TARGET_RESOLVED
```

Do not ask the user to perform a step the agent can verify or execute itself.

### PACKAGE_READY

When shell/project access is available, run `figma-plugin doctor --json`. If the package bin is not on PATH, run `node dist/server/index.js doctor --json` from the package root.

Use the report as local setup truth. It includes the absolute `plugin/manifest.json` path plus user and agent continuation steps. Fix failed local/package checks before asking the user to debug Figma.

### MCP_REGISTERED

If `figma_status` itself is unavailable to the agent, the problem is MCP/plugin discovery, not a Figma document problem. Ensure the active client is configured to start `dist/server/index.js` and reload/start a fresh agent session when that client only discovers plugins at session start.

Do not tell the user merely to reconnect Figma when the MCP tools are not loaded at all.

### FIGMA_PLUGIN_IMPORTED

This is a Figma Desktop UI action. Give the exact steps:

1. Open the intended file/window in Figma Desktop.
2. Open **Plugins -> Development -> Import plugin from manifest...**.
3. Choose the absolute `plugin/manifest.json` path printed by `figma-plugin doctor`.

### FIGMA_PLUGIN_RUNNING

The companion plugin must be running in every Figma window/tab that should be controllable. Tell the user to run **Figma Plugin** from **Plugins -> Development** in the target window and keep its panel open while the agent works.

When `figma_status` returns no connected instances, this is the first user action to request unless doctor evidence shows the package itself is incomplete.

### STATUS_VERIFIED

Call `figma_status` immediately after MCP discovery and again after the user opens/reopens the companion plugin. Do not assume success from an import action alone.

- no connected instance -> guide the user to run the plugin in the target Figma window, then retry;
- one connected instance -> use it by default;
- several connected instances -> resolve the intended window before writes;
- stale/missing target -> refresh status instead of reusing remembered ids.

### TARGET_RESOLVED

Before the first write, make window/page intent explicit when several windows are online. Bind the active session in the plugin UI or pass the intended `instanceId`; use `pageId` only when intentionally targeting a page other than that window's current page.

## User guidance quality bar

A good recovery message contains what state is missing, what the agent already checked, the one exact user action required now, the exact manifest path when import is required, and what the agent will verify next (`figma_status`). Avoid vague prompts such as "open the plugin", "check your MCP", or "tell me when ready" without the concrete path/menu/verification step.
