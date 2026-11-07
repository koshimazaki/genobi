---
title: Browser exports
area: Director
tags: [agents, director, mcp, bundle]
summary: Request revision-bound Director MP4 and project ZIP exports through an open local browser.
---

# Browser exports

`genobi_export` / `genobi export` uses the mounted Director or Editor renderer.
Open the local studio and link its project before requesting work. Hosted
runtime capabilities report this service unavailable; no headless renderer or
paid generation is involved. World capture continues to use `genobi_world`.

1. Read `schema export`, then `export --input '{"action":"targets"}'`. Each target identifies
   one tab, project revision, supported formats and whether an export is busy.
2. Request `project-zip` or `mp4` with that `tabId`, exact `source` and a fresh
   UUID `requestId`. For example, pass a JSON file to `export --input @export.json`.
3. Read `status` using the returned export `id`. Rendering reports progress;
   project ZIP packaging may finish without intermediate progress.
4. Only `done` contains a receipt: source revision, format, byte count, SHA-256,
   filename, private download route and expiry. The browser shows a download
   link. External agents can use `download` with a new `filePath`; existing
   files are never overwritten. Studio-started agents return the receipt URL.

```json
{
  "action": "request",
  "requestId": "<new UUID>",
  "tabId": "<from targets>",
  "source": { "kind": "director", "id": "<from targets>", "revision": 3 },
  "format": "project-zip"
}
```

## Lifecycle and limits

Requests move through `queued`, `running`, `storing`, then `done` or `error`.
`cancel` stops queued/rendering work. Once an atomic storage commit starts,
its completed result or storage error wins; read status for the result.
Changing the source or losing the browser fails unfinished work. No new work
is inferred from a reconnect. Each tab accepts one active export, and the
renderer refuses playback/import/export conflicts. The project must finish
syncing to the local server before the tab appears.

Repeat the **same request body and UUID** after an uncertain response. It returns
the same operation; changing the body with that UUID is refused. Completed
artifacts and their replay records survive server restart. Incomplete jobs are
ephemeral: a server restart drops them and returns not found. Check targets and
request again only after that outcome is known. Browser upload is never retried
automatically after a lost acknowledgement.

The server inspects MP4 structure or the ZIP's manifest, media and integrity
index, then atomically stores bytes before publishing a receipt. Downloads are
private to the requester and owner. Artifacts expire after one hour; retain a
local download if needed longer. Each artifact is at most 150 MiB. Stored exports
are bounded to 32 files, 600 MiB total and 300 MiB per owner. No automatic
eviction silently discards an unexpired artifact. Tab connections expire after
15 seconds without a poll. Export history holds at most 256 operations.

MP4 uses existing browser WebCodecs support and requires a loaded preview.
Project ZIP uses the [validated archive path](project-archives.md), including
its documented external World-resource limitations. A receipt records the source
revision supplied by the owner browser; the server validates packaged project
identity but cannot infer a source revision from rendered MP4 pixels.

## Verification — 5 November 2026

Focused tests cover project grants, revision conflicts, per-tab locking,
progress, cancellation, disconnect expiry, malformed bytes, private downloads,
ZIP/MP4 hash receipts, completed replay after restart, changed disk bytes and
MCP download integrity. Bridge tests cover cancellation during encoding, changed
sources and a lost upload acknowledgement without duplicate rendering.

Actual local Chrome acceptance used the mounted Editor to render a six-second
640×360 MP4 and package a project ZIP. Both receipt links downloaded matching
SHA-256 bytes, the ZIP opened in a fresh browser profile, and exact request replay
returned the original operation. The browser showed the finished video and source
revision. This is local evidence; no hosted deployment, hardware-specific GPU or
paid provider call was exercised.
