# Typed export / artifact egress — Figma Plugin 0.5.6

`figma_export` is a local runtime primitive, not a Design Skill. It exists because durable artifact egress has different timeout, size, persistence, and completion semantics from generic `figma_exec`.

## Formats

| Format | Local artifact |
|---|---|
| PNG | `.png`, `image/png` |
| JPG | `.jpg`, `image/jpeg` |
| SVG | `.svg`, `image/svg+xml` |
| PDF | `.pdf`, `application/pdf` |
| JSON | `.json`, Figma REST-shaped export payload |
| MP4 | `.mp4`, `video/mp4` |
| GIF | `.gif`, `image/gif` |
| WEBM | `.webm`, `video/webm` |

Video formats require a compatible animated top-level frame and format-valid fps/scale/quality settings.

## 0.5.6 I/O contract

```text
agent -> figma_export(nodeId, format, settings)
      -> follower forwards small __export__ request when needed
      -> leader dispatches protocol export_node
      -> Figma exportAsync
      -> one bounded local binary WebSocket frame
      -> leader persists private artifact
      -> follower receives JSON artifact descriptor only
      -> MCP result = text descriptor + local resource_link + structuredContent
```

Durable export bytes therefore do **not** take the leader→follower base64 RPC path. Plugin→leader still transports one complete bounded binary frame; chunked streaming is not implemented in 0.5.6.

## Size and deadline

- default requested artifact budget: `32 MiB`;
- binary frame ceiling: `64 MiB`;
- binary header reserve: `64 KiB`;
- framing-safe artifact hard ceiling: `64 MiB - 64 KiB - 4 bytes`;
- export operation timeout: 300s; follower RPC uses the export deadline plus a 15s coordination grace.

The artifact ceiling and frame ceiling are intentionally different so `4-byte header length + JSON header + artifact` cannot exceed the WebSocket payload contract.

## Persistence and security

Without `CONTROLMUX_FIGMA_EXPORT_DIR`, artifacts live under the private ControlMux runtime directory. The runtime enforces private default directories (`0700`) and artifact files (`0600`), rejects symlink export directories, refuses path traversal in explicit filenames, and never overwrites an existing artifact. Default artifacts are ephemeral and cleanup candidates after 24 hours.

When `CONTROLMUX_FIGMA_EXPORT_DIR` is set, it must be an absolute user-owned directory. The directory is treated as user-managed retention; files created by ControlMux remain private (`0600`).

## MCP result boundary

`resource_link` points at the locally persisted `file://` artifact and `structuredContent` repeats its descriptor for machine-readable consumption. This is a **local artifact contract**; it does not imply that a remote MCP client can dereference the host filesystem path. Large binary is deliberately not embedded back into model context.

Hosted Figma `download_assets`, `upload_assets`, or `export_video` remain preferred when their provider-native semantics fit the job. Local `figma_export` does not become a cross-file upload primitive.
