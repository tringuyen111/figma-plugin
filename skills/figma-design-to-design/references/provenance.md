# Provenance — figma-design-to-design

Last deep revalidation: 2026-08-19.

## ControlMux-owned method
- relationship-first transfer strategies: REUSE_REMOTE / WRAP / FORK / MIGRATE / SYNC;
- source→target identity map and explicit future update relationship;
- consumer migration compatibility + interaction-preservation proof;
- binary asset transfer separated from reusable design-identity transfer.

## Official Figma basis revalidated
- Plugin API imports published components, component sets, styles, and variables by key;
- `figma.teamLibrary` requires manifest permission `teamlibrary` and works with enabled library variable collections; libraries are enabled through Figma UI, not silently by Plugin API;
- components/styles expose publish-status inspection where supported;
- instance component swap is a migration mechanism whose preserved overrides must still be inspected;
- interactive component variant interactions are inherited by instances and therefore are part of reusable component behavior when present.

## Current connected provider surfaces observed
- `get_libraries` + `search_design_system` for semantic library discovery;
- `use_figma` for hosted native execution;
- `download_assets` + `upload_assets` for raw image/SVG cross-file transfer;
- Code Connect component inventory/context surfaces for code-linked systems.

Provider schema is session evidence, not permanent package truth. Re-discover it when consequential execution depends on it.

## Revalidation triggers
Revalidate when Figma changes library import/publish APIs, teamLibrary permission semantics, interactive-component inheritance, asset upload/download surfaces, or provider library search behavior.

## 0.5.6 transactional transfer

Cross-design work now binds exact source and target instance/file/evidence boundaries before consequential writes. A deterministic Design Transfer Packet represents intended semantic/upstream relationship; a Transfer Ledger records completed writes, postconditions, pending proof, and resumable/idempotent execution state. Schema validity does not prove semantic parity.
