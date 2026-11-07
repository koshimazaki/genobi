---
tags: [agents, mcp, storyboard, workflows]
summary: Inspect and edit the mounted Scroll through an explicitly linked browser, preserving document, revision and cell context.
---

# Agents in the open Scroll

In the local studio, expand **Document & agent tools**, then **Link agent to
this Scroll**. Give its one-use code to `genobi_scrolls_live` (`genobi scrolls-live`)
with `action: link`. It shares the export connection and its ownership checks.
A link grants this tab only; another tab showing the same document needs its own
link. Closing, opening another bundle (even with the same ID/revision), or
**Disconnect Scroll agents** ends it.
Hosted control and headless execution are unavailable.

Use `targets`, then `inspect` with the returned `tabId`. The snapshot contains
its document, revision, selected cell, selected asset IDs and `availableAssetIds`
whose bytes are present in this browser. It is a recent browser snapshot, not a
server-owned or durable project copy. Missing media stays visibly unavailable;
export still validates its bytes and hashes.

Keep the returned `context` with the conversation that requested the change.
Every edit supplies that original document ID, revision and cell selection.
Do not silently retarget an existing instruction after a switch. If the person
edits, selects a different cell, removes the target or opens another document,
inspect again and reconcile their change before proposing another command.
Both dispatch and the actual browser execution check the context.

```json
{
  "action": "request",
  "tabId": "<linked tab UUID>",
  "requestId": "<new request UUID>",
  "context": { "documentId": "my-scroll", "revision": 3, "cellId": "cell-1" },
  "command": {
    "op": "brief",
    "revision": 3,
    "prompt": "Keep the creature's silhouette."
  }
}
```

Existing validated `brief`, `cell`, `select`, `timing` and `resize` commands apply
as one revision change. They cannot open another document or create media from
metadata. Pure `genobi_scrolls` JSON transformations continue working separately.
Use `attach-media` and `handoff-director` below for inspected media and a confirmed handoff.
Generated assets still need their normal quote and approval.

Read `status` with the returned command ID until `done` or `error`. `done`
contains the resulting snapshot. After a lost answer, repeat the exact request
UUID and body or read status; never invent a fresh UUID to retry an uncertain
edit. The browser resends a cached acknowledgement, not the edit. If it disappears
after dispatch, the result explicitly says the edit may have applied.

Connections and commands are local and ephemeral: 15-second browser liveness,
one active command per tab, at most 256 commands retained for one hour. A server
restart loses this command ledger. Inspect the actual document before proceeding
after any restart or uncertain result; this is not durable exactly-once storage.
Results are readable only by the requester or owning browser. Agent-marked clients
cannot impersonate browser polling or acknowledgement. No command generates or
spends.

## Attach and hand off

1. Link a local Director project to the same agent identity, then stage its file
   with `genobi_project_media_stage`. The receipt belongs to that session and
   project; it is not a public file grant. Scrolls supports inspected image and
   audio bytes; MP4 remains a Director input.
2. Inspect the Scroll and request `command: { "op": "attach-media", "revision":
3, "copyId": "<linked copy>", "receiptId": "<SHA-256>", "role": "panel",
"cellId": "cell-1", "name": "Creature panel" }` with that exact context.
   `character`, `style` and `audio` are also supported; only `panel` names a cell.
   Read `status`: its `attachment.assetId` and hash identify the inspected bytes
   added to the live bundle. No machine path, receipt handle or project grant is
   saved in the Scroll. Missing/foreign/expired receipts fail before mutation.
3. Use existing `select`, `cell` and `timing` commands to accept the intended
   candidates and choose audio explicitly. Attachment itself does not replace a
   populated cell, select an asset, change timing or invent a generation prompt.
4. Inspect again; the snapshot now also identifies the current `director` target
   (`{ "id": "…", "revision": 7 }`, or null if none is open). Request
   `command: { "op": "handoff-director", "revision": 6, "director": <that target> }`.
   Both workspaces are checked before commit. Existing Director drafts stay kept;
   another handoff to an existing Scroll draft is refused to preserve its edits.
5. `done.result.handoff` returns the destination project ID, revision, actual
   asset IDs and layer IDs read from the resulting Director store. The UI shows
   **Director project ready** and **Open Director**. A completed handoff does not
   grant the requesting agent server access to the new project; link that project
   separately for further editing. Save its project ZIP to keep it independently
   of this browser session.

An attachment rechecks the original Scroll context after download/inspection.
Disconnect cancels an in-flight preparation. Handoff validates media and the
original Scroll context immediately before committing to Director. The same
request UUID returns the same result after a lost acknowledgement; no second
asset or Director draft is created. A handoff leaves the Scroll revision intact.
