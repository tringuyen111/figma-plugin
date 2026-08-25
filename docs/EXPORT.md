# Typed artifact export

Current package: `0.7.0` · Protocol: `10`.

`figma_export` is a local runtime primitive, not a Design Skill. Durable egress has different size, timeout, persistence, and completion semantics from generic native execution.

## Formats

| Format | Local artifact |
|---|---|
| PNG | `.png`, `image/png` |
| JPG | `.jpg`, `image/jpeg` |
| SVG | `.svg`, `image/svg+xml` |
| PDF | `.pdf`, `application/pdf` |
| JSON | `.json`, Figma REST-shaped payload |
| MP4 | `.mp4`, `video/mp4` |
| GIF | `.gif`, `image/gif` |
| WEBM | `.webm`, `video/webm` |

Video export requires a compatible animated top-level frame and valid format settings.

## Data path

```text
agent
-> figma_export
-> follower forwards a small request when needed
-> leader dispatches protocol export_node
-> Figma exportAsync
-> one bounded local binary WebSocket frame
-> leader persists a private artifact
-> follower receives an artifact descriptor only
-> MCP returns text + local resource_link + structuredContent
```

Durable bytes do not travel through the leader-to-follower base64 RPC path. Plugin-to-leader transport remains one bounded binary frame; chunked streaming is not implemented.

## Size and deadline

- default requested artifact budget: `32 MiB`;
- binary frame ceiling: `64 MiB`;
- binary header reserve: `64 KiB`;
- framing-safe artifact ceiling: `64 MiB - 64 KiB - 4 bytes`;
- export timeout: 300 seconds;
- follower coordination grace: 15 seconds beyond the export deadline.

The artifact ceiling is lower than the frame ceiling so header length, JSON header, and bytes remain within the wire contract.

## Persistence and safety

Without `CONTROLMUX_FIGMA_EXPORT_DIR`, artifacts use a private runtime directory. The runtime creates private directories/files where the host supports permissions, rejects path traversal and symlink export directories, and does not overwrite an existing name. Default artifacts are cleanup candidates after 24 hours.

An explicit export directory must be absolute and is treated as user-managed retention.

## Result boundary

The returned `resource_link` refers to a local filesystem artifact. It does not imply that a remote MCP client can dereference that path. A successful export descriptor proves egress mechanics for the exact node/format; it does not by itself prove visual quality or product acceptance.
