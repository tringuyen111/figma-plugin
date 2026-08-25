# Development and source hygiene

Current package: `0.7.0` · Protocol: `10`.

## One setup entrypoint

Run from the plugin root:

```powershell
.\setup.ps1
```

The script performs this bounded sequence:

```text
clean known generated paths
-> npm ci
-> capability + trajectory checks
-> strict server/plugin TypeScript
-> Node and Vitest tests
-> production bundles and bundle smokes
-> doctor
-> dry-run package inventory validation
-> remove generated paths
-> assert source-clean state
```

Modes:

- default — keep `node_modules`, remove generated build/package/test output;
- `-KeepBuild` — retain the three runtime outputs for local execution;
- `-Pristine` — also remove `node_modules` and `.playwright-cli` after verification;
- `-SkipInstall` — reuse the dependency tree already present.

On a failed setup, generated output is cleaned in `finally` so a partial build does not masquerade as a valid runtime.

## Clean-source contract

These paths must be absent in a source-only handoff:

```text
dist/
plugin/code.js
plugin/code.js.map
plugin/ui.html
output/
coverage/
figma-plugin-*.tgz
```

`-Pristine` additionally requires `node_modules/` and `.playwright-cli/` to be absent. `plugin/manifest.json` is source and must remain.

Use:

```powershell
npm run clean
npm run clean:check
npm run clean -- --all
node scripts/clean-generated.mjs --check --all
```

The cleanup implementation resolves every target under the plugin root and rejects a target that escapes it.

## Build modes

| Command | Result |
|---|---|
| `npm run build` | Full local gate; leaves production runtime bundles |
| `npm run build:bundle` | Builds current server/plugin/UI bundles only |
| `npm run build:watch` | Watches runtime/UI source for local development |
| `npm run build:debug` | One build with external source maps enabled |
| `npm run clean` | Removes all generated output, including debug maps |

Production builds disable source maps. A debug map is a local diagnostic artifact and is excluded from the npm package.

## Package boundary

`package.json.files` uses exact runtime paths instead of broad `dist/` or `plugin/` directory inclusion. The package contains:

- the self-contained server bundle;
- Figma `manifest.json`, `code.js`, and `ui.html`;
- Codex/Claude/MCP manifests;
- Skills, docs, design/eval resources, license, and notices.

It excludes source, tests, development scripts, setup tooling, output evidence, caches, archives, and source maps. Verify the actual npm inventory with:

```powershell
npm run check:package
```

The check fails on a missing runtime file or any forbidden residue.

## Verification scope

| Gate | Establishes | Does not establish |
|---|---|---|
| `check:capabilities` | package/Skill/schema invariants | connected provider or Figma behavior |
| `typecheck` | strict server/plugin compile contracts | runtime execution |
| Node/Vitest | exercised local behavior and fixtures | live Figma, UI/UAT, hosted behavior |
| bundle smoke | compiled bundle mechanics | a currently loaded companion revision |
| `doctor` | local package structure/readiness | MCP registration in the current task |
| package check | exact package inventory hygiene | installation or live pickup |

Live proof begins only after the client loads the intended package, the companion reports the same `bundleRevision`, and the requested behavior is observed at its real target.

## Dependency policy

Use `npm ci` as the reproducible install. `npm audit` and `npm outdated` are audit inputs, not automatic permission to rewrite the lockfile or adopt a new major version. Upgrade dependencies only for a concrete security, compatibility, or maintenance reason and rerun the full setup gate.
