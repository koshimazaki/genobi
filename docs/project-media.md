---
tags: [agents, mcp, director, bundle]
summary: Inspected, session-owned media staging for local project imports, with stable upload receipts and explicit limits.
---

# Agent project media

The local server can stage an image, audio file or MP4 for a project the calling
session owns or has linked. Staging leaves the project revision unchanged. A
receipt describes inspected bytes; it is not yet an attached asset. Use the
revision-checked operation below to attach or place it. Generated
takes and owned media-tool results still use `genobi_take_to_project`.

External agents use `genobi_project_media_stage` with `copyId`, an absolute
`filePath` and `contentType`. The adapter reads a bounded regular file and sends
only bytes and their SHA-256. The machine path never enters the request, receipt
or project. Studio-started agents keep their existing restriction against
arbitrary local file reads. The CLI exposes the same tool as `project-media-stage`;
read `schema project-media-stage` before constructing its input.

HTTP clients send the raw file with its media `Content-Type` to
`POST /api/projects/:copyId/media/:sha256`. The server verifies the complete
body, hash, declared type and readable media metadata before atomically issuing
`{receipt, stored}`. PNG, JPEG, WebP, WAV, FLAC, MP3 and MP4 are accepted under
the existing upload size limits (5 MiB images, 50 MB audio/video). MP4 staging
does not impose the generation upscaler's duration or resolution restrictions.
Staged files total at most 150 MiB and 128 receipts per calling session and project.

Receipts last one hour and bind `receiptId`, `copyId`, `sha256`, byte length,
kind, content type, dimensions and duration. They survive a server restart for
the remainder of that hour. Exact retries return the same receipt. After a lost
acknowledgement, use `genobi_project_media_receipt` (CLI `project-media-receipt`)
or `GET` on the same HTTP path. Incomplete uploads cannot issue a receipt.
Expired or corrupt receipts require staging again. The same hash in another
session or project conveys no access.

## Attach, replace and relink

`genobi_project_media` (CLI `project-media`) takes the linked `copyId`, current
`baseRevision`, a new UUID `requestId` and one `command`:

| Command   | Fields                                           | Result                                                             |
| --------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| `attach`  | `receiptId`, `use` (`production` or `reference`) | Add the inspected upload as a project asset; leave clips in place  |
| `replace` | `receiptId`, `layerIds`                          | Import as production media and replace those clips                 |
| `relink`  | `assetId`, `layerIds`                            | Place existing media; an Inspiration gets a production alias       |
| `alias`   | `assetId`, `use`                                 | Share bytes under another role, preserving generated provenance    |
| `remove`  | `assetId`                                        | Remove only an unused asset, including checks on prompt references |

HTTP uses `POST /api/projects/:copyId/media` with the same body except `copyId`.
The response names the resulting `assetIds`, `layerIds`, `sourceRevision` and
applied `revision`. Browser import/placement rules enforce locks, compatible
types, source duration, clip timing and transforms. Audio track replacement
uses the same fitted duration as the browser's Track slot. A stale revision,
foreign or expired staging receipt, missing file or invalid target changes
nothing. Imported files use relative media paths and `origin: uploaded`.

The project write and its result receipt commit together. After a lost answer,
retry the **same requestId and body**; no edit repeats. `replayed: true` answers
the original applied revision while `currentRevision` describes the copy now.
Read again before another edit if they differ. Changing the body under that
requestId is refused. The latest 64 operations survive server restart and owner
edits; an older retry is refused by its stale base revision. Staging expiry does
not remove attached project bytes or invalidate a retained operation receipt.

The hosted Worker advertises both `projectMediaStaging.supported: false` and
`projectMediaOperations.supported: false`; it has no canonical local project
ownership. These operations never generate or call a provider.

## Attach to the paired World

After attaching the file to a project, pair with the open World Builder and
read its `recipe` command. Send `genobi_world` action `command` with
`{op: "attach-media", requestId, expectedRevision, copyId, assetId, target}`.
Use the returned live scene revision (not the project revision); `target` is
`audio` for Sound, `screen/all`, a named primitive such as `prop:subject/all`,
or a playground part such as `world:box-a/all`. The browser checks that the
addressed surface exists in the current scene.
The caller needs both the World pairing and the project grant. Inspiration
assets require an explicit `allowInspirationAsInput: true`.

The local server checks the project's stored bytes and hash, then sends them
only to the paired owner tab. The browser decodes and applies audio or texture
through its normal controls, guarding the revision again after loading. A human
edit, missing surface, corrupt media or closed tab cannot report a successful
attachment. Read `result` for the applied revision, source asset and content hash.
Source bytes remain in the project; attachment changes the mounted scene.
This is not a headless renderer or a model/FBX attachment API.

An exact `requestId` retry returns the original command while it remains in the
session's 64-command history; a different body with that ID is refused. Poll
that command's result rather than inventing another ID after an uncertain
answer. Disconnect and expiry discard the command and its bytes. Inputs are
limited to 64 MiB each and share a 144 MiB session budget with captures.
`worldMedia.supported` is local-only and reports browser execution.

## Verification — 5 November 2026

Local HTTP/MCP/CLI regressions cover inspected imports, ownership, revision
conflicts, clip locks, prompt references, deduplication and durable replay after
an owner edit or server restart. Generated-take and derived imports retain their
existing tests. World tests cover dual grants, concurrent request replay,
owner-only byte delivery and revision conflicts during media decode.

A local Chrome run staged and attached a real PNG and WAV, applied them to the
mounted World Builder (`prop:subject/all` and Sound), read the source hashes and
new scene revisions, then refused a stale request without changing the scene.
No provider call was made. This establishes local browser behavior, not hosted
project ownership, production deployment or physical audio-device playback.
