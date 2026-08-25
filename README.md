# Figma Plugin

Local Figma execution runtime and reusable design capabilities for Codex, Claude Code, and other MCP clients.

Current package: `0.7.0` · Protocol: `10` · Canonical Skills: `16`.

The plugin keeps a deliberately small public MCP surface:

- `figma_status` — connection, target routing, and runtime health.
- `figma_query` — typed read-only inventory and design facts.
- `figma_apply` — dry-run-first typed mutations with confirmation, conflict, undo, and readback boundaries.
- `figma_exec` — bounded native Figma Plugin API escape hatch.
- `figma_export` — durable local artifact export without returning large binary payloads as model text.

```text
Agent + Figma Skill
        |
        v
five local MCP tools
        |
        v
local server / bridge
        |
        v
Figma companion plugin
        |
        v
native Figma Plugin API
```

The runtime owns connection, routing, execution, and evidence mechanics. The packaged Skills own design judgment for scene, layout, tokens, typography, visual composition, components, prototype, motion, design systems, verification, and design/code transfer.

## Setup

Requirements:

- Windows PowerShell;
- Node.js 18 or newer;
- Figma Desktop for live Figma work.

Run the single setup entrypoint from this directory:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
```

The default flow performs a locked dependency install, capability checks, strict TypeScript checks, tests, bundle smokes, `doctor`, and package-content validation. It then removes generated build output so the workspace returns to source-clean state.

Useful modes:

```powershell
# Verify and leave runtime bundles available for local use.
.\setup.ps1 -KeepBuild

# Verify, then also remove node_modules and the local Playwright cache.
.\setup.ps1 -Pristine

# Reuse an existing locked dependency install.
.\setup.ps1 -SkipInstall
```

`-KeepBuild` and `-Pristine` are intentionally mutually exclusive.

## Run the Figma companion

First build and retain the runtime:

```powershell
.\setup.ps1 -KeepBuild
```

Then in Figma Desktop:

1. Open the target file.
2. Choose **Plugins → Development → Import plugin from manifest…**.
3. Select the absolute `plugin/manifest.json` path printed by `doctor`.
4. Run **Figma Plugin** in every Figma window that should be addressable.
5. Keep the companion panel open while the MCP client is working.

After the MCP client loads the server, call `figma_status` before reading or mutating a file. Multiple Figma windows require an explicit `instanceId`; cross-page work should also bind the intended `pageId`.

For a generic MCP client, the built stdio entrypoint is:

```text
node <absolute-plugin-root>/dist/server/index.js
```

Codex and Claude manifests are already included in `.codex-plugin/`, `.mcp.json`, and `.claude-plugin/`. A client that discovers plugins only at task startup must start a new task after reinstalling or changing the packaged plugin.

## Source and generated output

Canonical source:

```text
src/                       runtime, plugin, UI, and shared contracts
skills/                    16 packaged Figma capability Skills
plugin/manifest.json       Figma companion manifest
design/                    approved companion design truth and exemplars
evals/                     frozen evaluation contracts and fixtures
docs/                      current maintainer and user contracts
```

Generated runtime output:

```text
dist/server/index.js       self-contained MCP server bundle
plugin/code.js             Figma main-thread bundle
plugin/ui.html             compiled companion UI
```

Generated output is never source truth. Default builds do not create source maps; `npm run build:debug` enables them explicitly. Clean with:

```powershell
npm run clean
npm run clean:check

# Also remove dependencies and local browser cache.
npm run clean -- --all
node scripts/clean-generated.mjs --check --all
```

The clean command only targets an explicit allowlist inside this plugin root. It does not remove `plugin/manifest.json`, source, docs, Skills, local credentials, or `tunnel-id.txt`.

## Development gates

```powershell
npm ci
npm run check:capabilities
npm run typecheck
npm test
npm run build:bundle
npm run test:bundle
npm run check:package
npm run test:package-install
```

Or run the complete source/build gate:

```powershell
npm run build
```

`npm run check:package` inspects `npm pack --dry-run` and fails if the package contains source trees, tests, scripts, output evidence, caches, archives, or source maps. `npm run test:package-install` then creates the real tarball in an isolated temporary directory, installs it as a consumer, runs `doctor`, and executes the five-tool MCP surface from that installed artifact. The installed package intentionally contains compiled runtime bundles because Codex does not build them after installation.

Live commands such as `test:typed-tools-live`, `test:runtime-sdk-v2-live`, and Figma file maintenance require a connected companion. They are not part of source-only proof and may mutate the bound Figma file when their command contract says so.

## Evidence boundary

Build, typecheck, tests, package validation, and `doctor` establish local source/package validity only. They do not prove:

- that the current MCP task loaded the new bundle;
- that a Figma companion is connected;
- a live mutation and typed readback;
- visual quality, prototype playback, temporal quality, accessibility technology behavior, UAT, publication, or release acceptance.

Every live claim must bind the exact file/page/node scope and loaded `bundleRevision`. Generated evidence under `output/` is ignored and must not be carried forward as current proof after the source changes.

## Documentation

Start with [docs/README.md](docs/README.md). The most important contracts are:

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — setup, build, clean, package, and verification lifecycle.
- [docs/SOURCE-ARCHITECTURE.md](docs/SOURCE-ARCHITECTURE.md) — source ownership and runtime boundaries.
- [docs/CAPABILITIES.md](docs/CAPABILITIES.md) — five tools, sixteen Skills, and proof scope.
- [docs/DESIGN-LIFECYCLE.md](docs/DESIGN-LIFECYCLE.md) — identity, reuse, transfer, behavior, and code outcomes.
- [docs/EXPORT.md](docs/EXPORT.md) — typed artifact egress.
- [docs/PLUGIN-0.7.0-TYPED-CRUD.md](docs/PLUGIN-0.7.0-TYPED-CRUD.md) — typed entity graph and mutation contract.

## License

MIT. See `LICENSE` and `THIRD_PARTY_NOTICES.md`.

Author: Tri Nguyen · nguyenmanhtri2907@gmail.com
