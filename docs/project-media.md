---
tags: [agents, mcp, director, bundle]
summary: Inspected, session-owned media staging for local project imports, with stable upload receipts and explicit limits.
---

# Agent project media

The local server can stage an image, audio file or MP4 for a project the calling
session owns or has linked. Staging leaves the project revision unchanged. A
receipt describes inspected bytes; it is not yet an attached asset. Generated
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

The hosted Worker advertises `projectMediaStaging.supported: false`; it has no
canonical local project ownership. Staging does not submit generation, call a
provider, attach media or change the current cut. Revision-checked attachment,
replacement and relinking are the next slice of #37.
