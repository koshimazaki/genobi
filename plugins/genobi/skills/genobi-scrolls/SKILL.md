---
name: genobi-scrolls
description: Plan a character sheet or storyboard as a Genobi scroll before any video exists - create and edit the scroll document, time its cells to a song, prepare one Klein image request for the whole sheet or a cell behind a quote the person accepts, and hand the chosen panels to the Director. Use when the person wants to draw the video first, keep a character consistent, or storyboard a song.
license: MIT
compatibility: Needs the genobi MCP server (genobi_scrolls is stateless and works without the studio); generating, saving the media bundle and the Director import need the Genobi studio running locally (`npm run dev` in camera-director) and Node 22 or later.
metadata:
  version: "0.1.0"
  phase: "1 - quoted generation"
  tags: "storyboard, agents, director, mcp"
  docs: "docs/scrolls.md"
---

# Genobi Scrolls

A scroll is a character sheet or a storyboard: one brief, 1 to 16 cells, each
with an optional prompt, camera and action, and optional timing to a song. The
person sees it in the studio at `/scrolls`. You work on the same document
through one tool, `genobi_scrolls`.

`genobi_scrolls` is a pure JSON transformation. It stores nothing, moves no
media, never generates and never pays. Every call takes the document you got
back from the previous one, so keep the latest document and pass it on. The
person saves it, with its media bundle, from Scrolls.

## Intended use and credits

Before selecting libraries, models or input assets, load `genobi-licensing`
with `genobi_skill`. Use the prompt's intent and studio context `usage`; ask
only if missing. Check the planned inventory, then record the actual run's
licences and creator credits beside the output. Unknown rights are not a pass.

## Start a scroll

```json
{ "action": "create", "id": "rooftop-chase", "kind": "storyboard", "count": 8 }
```

`kind` is `character` (front, side and detail views of one character) or
`storyboard` (shots in order). Use a stable lowercase `id`. Then write one
brief with `edit`; that is usually enough. Add a cell's camera or action only
where the brief cannot carry it, rather than asking the person to fill every
field.

## Edit it

`edit` takes the document and one command that carries the document's current
`revision`. A stale revision is refused, so read the latest document first
(`action: inspect` returns it with its cuts and capabilities).

| Command     | Does                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `brief`     | The scroll's prompt, name, sheet image or `script` (the person's text for the video)           |
| `cell`      | One whole cell: prompt, camera, action, optional `startFrame` and region                       |
| `select`    | The asset ids the person chose                                                                 |
| `timing`    | `enabled`, `fps`, `bpm`, `audioId`, `beatOffsetSeconds`, `audioStartFrame`, `sourceStartFrame` |
| `resize`    | The number of cells                                                                            |
| `add-asset` | An asset's metadata, for media already in the person's bundle                                  |

```json
{
  "action": "edit",
  "document": { "…": "the latest document" },
  "command": {
    "op": "brief",
    "revision": 0,
    "prompt": "Two ninjas cross moonlit rooftops and escape through a gate."
  }
}
```

A region on the sheet is `{ "assetId": "…", "box": [top, left, bottom, right] }`
in whole numbers from 0 to 1000, at least 1% each way. It records which part of
the sheet a cell means; it does not cut the image.

## Fill the person's open panels

When the person presses **Send** under **Describe the video** in Scrolls, your
prompt carries their description, the panels as they are, example pairs and a
one-use code. Call `genobi_scrolls_panels` once with that code and one entry
per panel, in order:

```json
{
  "code": "the 32-character code from your prompt",
  "panels": [
    {
      "cellId": "cell-1",
      "title": "Standoff",
      "camera": "Locked",
      "action": "Face off"
    },
    { "cellId": "cell-2", "title": "Approach", "camera": "Track right" }
  ]
}
```

Titles, camera and action are one line (80, 300 and 300 characters); a
`prompt` may take 1,500. Only the cells your prompt names; anything wrong
refuses the whole call and changes nothing, so fix it and call again. The code
works once. It writes text into the person's open scroll and nothing else:
do not quote or generate the board. They edit the panels and press Generate
board themselves.

## Time it to a song

Timing is optional for both kinds and counted in whole video frames. To move or
trim one cell with the studio's own collision rules:

```json
{
  "action": "retime",
  "document": { "…": "the latest document" },
  "revision": 3,
  "cellId": "cell-2",
  "frame": 96,
  "mode": "move",
  "snap": "beat"
}
```

`mode` is `move`, `left` (its start) or `right` (its end); `snap` is `beat` or
`frame`. Cells are `cell-1`, `cell-2` and so on. Cells may leave gaps but never
overlap. The tempo and beat offset come
from the song's analysis; read them with `genobi_audio_analysis` when the
person has dropped a song in, and set them with a `timing` command.

## Generate a sheet or a cell

`image-request` returns a FLUX 3 Image Klein request for the whole sheet, or for
one cell with `cellId`. It generates nothing. Then follow the studio's paying
rules: `genobi_quote` the request, show the person the price, and submit only
after they accept. In an agent session you cannot submit; the quote goes to the
person to approve in the studio.

A result stays a candidate until the person chooses it. Ask them to pick.

## Hand it on

After the person has chosen, `handoff` with a `destination`:

- `director`: shot order, cell guidance and the chosen panels' roles and ids,
  for the person's **Open in Director** in Scrolls. The browser does the import
  and reads it back; this tool does not touch a project.
- `video`: text guidance for a video prompt. Today's video route takes text
  only, so a sheet does not condition the video; say so rather than imply it.
- `agent`: the same plan as JSON, for another agent or a later session.

## What it cannot do

- Resume a session or keep a scroll between calls: you hold the document.
- Edit with the open Klein workflow; a region edit goes through FLUX 3 Edit,
  which the person opens from Scrolls.
- Slice a sheet into panels automatically.
- Condition LTX or FLUX video on the sheet.

See [Scrolls](../../../../docs/scrolls.md) for the commands, limits and bundle
format, and the `genobi-director` skill once the panels are in a project.
