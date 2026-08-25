# Working Rules

1. Ground truth order: exact archive/hash -> Git if present -> source -> runtime/tests -> revision-bound evidence -> canonical docs. Unsupported claims stay unresolved/NOT_RUN/BLOCKED.
2. This extracted source is the active main baseline for this work. The custom local Figma execution stack is core product infrastructure; Figma Remote MCP is optional benchmark/reference, not a required production dependency.
3. `../brand-system/` and `../plugin-dogfood/` are sibling consumer projects, not part of this plugin's product or release boundary.
4. Keep transient plans, extracted archives, build logs, screenshots, project-specific dogfood, and run evidence outside the clean source tree. Persist only reusable contracts, tests, fixtures, and revision-bound release evidence with a real downstream consumer.
5. Reuse-first: inspect existing runtime SDK, typed operations, query paths, tests, callers, docs, and package mechanics before adding another implementation. Remove superseded active truth only after parity/proof.
6. Correctness precedes token/resource optimization. Preserve PASS/FAIL/NOT_RUN/INCONCLUSIVE/MISSING/BLOCKED exactly.
7. Public MCP surface should remain compact unless evidence proves a new tool boundary. Prefer deeper typed semantic operations behind existing `figma_query`, `figma_apply`, `figma_exec`, `figma_export`, `figma_status`.
8. `figma_exec` remains the universal Plugin API escape hatch. Promote repeated, high-risk, order-sensitive, edit-heavy operations to typed semantic mechanics instead of typing the entire Figma API.
9. Runtime owns compact evidence/mechanics; Skills own design judgment/methodology. Do not hard-code broad design-quality verdicts into the runtime.
10. Skills remain independently useful. Upgrade Skill methodology only when frozen behavioral evidence identifies a decision/execution gap; do not create a new Skill merely to mirror a provider/API area.
11. Validate the smallest sufficient scope first, then integration/regression only as required by the claim. Do not install/rebuild/rescan broadly when cached/source-local evidence is enough.
12. Publish/release or other irreversible external actions require explicit user authority. Structural/package validation does not prove live Figma Desktop behavior or publish success.
13. `setup.ps1` is the single setup entrypoint. Generated bundles, source maps, packages, output evidence, dependency folders, and browser caches are never source truth; use the documented clean modes before handoff.
