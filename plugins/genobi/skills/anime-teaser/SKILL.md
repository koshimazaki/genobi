---
name: anime-teaser
description: Make Genobi's Anime teaser template (docs/anime-teaser-template.md) - take or generate a track, a character sheet and a storyboard, then two 10-second MiniMax H3 shots from the sheet and the storyboard, cut to the track's beat in the Director with two titles. Every paid step is quoted and waits for the person's approval.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director) with a Comfy key, the genobi MCP server and Node 22 or later.
metadata:
  version: "0.2.0"
  template: "anime-teaser"
  tier: "Semi-open"
  tags: "agents, director, ltx, sound"
  docs: "docs/anime-teaser-template.md, docs/templates.md, docs/runs/anime-teaser.md, docs/genobi-cli.md"
---

# Anime teaser (Ink and ember)

A 20-second, 16:9 teaser (9:16 when the person asks): two 10-second shots on
MiniMax H3 through Comfy Router (`minimax-h3-router`, open weights), made from
a character sheet and a storyboard, cut to the beat of a track with a title
card on the opening beat and a caption on the held last second. Any of the
three references can be the person's own, the template's example, or made
here: the sheet and the storyboard with FLUX 3 Edit (`flux-3-edit`, closed,
so the template is Semi-open), the track as four MiniMax Music 3 candidates
(`minimax-music-3`, open; show its credit "MiniMax-Music3").

| Step             | Entry               | Runs | Expected each        |
| ---------------- | ------------------- | ---- | -------------------- |
| Character sheet  | `flux-3-edit` 1k    | 1    | $0.05                |
| Storyboard       | `flux-3-edit` 1k    | 1    | $0.05                |
| Track candidates | `minimax-music-3`   | 4    | $0.30 (an allowance) |
| Two shots, 10 s  | `minimax-h3-router` | 2    | $1.29 at 768P        |

At most 8 runs and about **$3.90** when all three references are made; 2 runs
and **$2.59** for the shots alone. These are estimates; each quote is the
figure that binds. The studio's demo key allows three runs a session a day,
so the whole recipe needs the owner's saved key unless the person supplies
the references.

Content rules: one invented character. Never describe or upload a real or
famous person. Keep it lawful and safe for work. Before choosing models or
inputs, load `genobi-licensing` with `genobi_skill` and record the run's
licences beside the output.

## Two ways to run

- **A session the studio started** (the gallery's Generate now, the bubble,
  voice): you cannot spend. Each quote becomes a step the person approves in
  the bubble, and the run goes to their gallery. After the quotes of a step,
  stop and say what waits. When the runs are Ready the person picks the one
  to use and prompts you again; its job id is in the context's `picks`. Use
  that id where the steps below say `<id>`. The budget, submit and provenance
  tools are not among yours; skip those calls and say so.
- **A chat the person started** (Claude Code or `hermes -p genobi`): you
  have the budget and submit tools. Quote, ask for a yes to the price,
  submit with a new idempotency key per run, and poll.

## Requests that carry images

The sheet, the storyboard and the two H3 shots send images: PNG, JPEG or WebP
data URLs in `imageReferences`. The examples are 3.2 and 3.4 MB, about 4.4 MB
of base64 each, far more than you can write into a tool call. Never paste
image bytes into a quote. Send those four requests through the Genobi CLI from
a file instead (`docs/genobi-cli.md`; inputs up to 24 MiB):

1. Write the request's other fields as a small JSON file, for example
   `.local/teaser/sheet.json`, exactly as the step gives them.
2. Add the images with this script, the files in order (the sheet first,
   then the storyboard):

   ```sh
   node -e '
   const fs = require("fs");
   const [, base, out, ...files] = process.argv;
   const types = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };
   const request = JSON.parse(fs.readFileSync(base, "utf8"));
   request.imageReferences = files.map((file) => {
     const type = types[file.split(".").pop().toLowerCase()];
     if (!type) throw new Error(`${file} is not a PNG, JPEG or WebP`);
     return `data:${type};base64,${fs.readFileSync(file).toString("base64")}`;
   });
   fs.writeFileSync(out, JSON.stringify(request));
   ' .local/teaser/sheet.json .local/teaser/sheet-request.json public/scrolls/character.png
   ```

3. Quote: `node plugins/genobi/server/genobi-cli.mjs quote --input @.local/teaser/sheet-request.json`
   → `quoteId`, `estimateUsd`. To submit after the person's yes, add
   `quoteId` and a new `idempotencyKey` to the small file, run the script
   again into `sheet-submit.json`, then
   `node plugins/genobi/server/genobi-cli.mjs submit --input @.local/teaser/sheet-submit.json --confirm`.

The server enforces each image under 5 MiB and all of them under about 11 MB,
at least 256 pixels a side, and refuses before anything is spent. The
examples are `public/scrolls/character.png` and `public/scrolls/storyboard.png`
in the checkout. For the person's own sheet or storyboard, or one you made,
ask for its path on this machine (a take downloads from the studio's
gallery); if you cannot read a file, stop and say so. In a session the studio
started, a CLI quote reaches the person's approvals only when the CLI carries
your session's grant (`GENOBI_AGENT_RUN` in your environment, as a Hermes
session has); without it, stop before the image steps and tell the person
they need a chat they start, or their own run in the studio's Edit and H3
composers. Steps without images stay on the MCP tools.

## Steps

One tool call per step. Keep the values each step returns (after `→`).

1. `genobi_status {}` → `hasServerKey`. If it is false, stop: the studio
   needs a Comfy key. Note the time; it is `startedAt`.
2. `genobi_link_project {"code": "<code>"}` → `copyId`. The code is in your
   brief; a gallery start linked the open Anime teaser project for you.
3. `genobi_project {"copyId": "<copyId>"}` → `revision`, `assets`,
   `template.inputs` and
   `cameras`: each shot's `camera`, keyed by its `shotId`. The references
   the person supplied are assets:
   `track-1` (audio), `character-1` and `storyboard-1` (images). Your first
   prompt says which are theirs, which are the template's examples and which
   are missing.
4. **Brief and intake.** Read or ask the subject (who the character is and
   what they do), the title and the aspect; the test brief is "a ninja
   training in a forest, shooting a fireball and doing kicks". When a
   reference is missing, ask once, in one question, before anything else,
   for example "Do you have a track, or shall I generate one?". A no: ask the
   person to add the file to the project and tell you. A yes is a go-ahead to
   quote, never to pay. Then
   `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "set-template-inputs", "inputs": {"subject": "<brief>", "title": "<TITLE>"}}}`
   → the new `revision`.
5. `genobi_template_plan {"template": "anime-teaser", "inputs": {"subject": "<brief>", "title": "<TITLE>", "aspect": "<aspect>"}, "cameras": <cameras from step 3>}`
   → `shots[]` (Open and Drop) and the shots' total `estimateUsd`.
6. **Budget the whole recipe**, once, before any quote. Runs: 1 for a
   missing sheet, 1 for a missing storyboard, 4 for a missing track, and 2
   for the shots. Dollars: $0.05, $0.05 and $1.22 for those, plus the shots'
   total from step 5. With all three missing:
   `genobi_budget {"runs": 8, "usd": <summed estimateUsd>}` → `fits`. If it
   is false, quote nothing: tell the person what `next` says and what does
   fit (for example the shots alone, with their own sheet, storyboard and
   track), and wait for their choice.
7. **Character sheet**, only when missing. Write `.local/teaser/sheet.json`:

   ```json
   {
     "generator": "edit",
     "model": "flux-3",
     "description": "Redraw this character sheet for a new, invented character: <who, from the brief>. Keep the sheet's layout, line and colour style: the title block, front, back and side views, one action pose (<the move the brief names>) and the colour guide. Hand-drawn 2D anime; no logos and no real person.",
     "imageAspectRatio": "16:9",
     "imageResolution": "1k",
     "projectRevision": <revision>
   }
   ```

   Add `public/scrolls/character.png` with the script and quote it through
   the CLI ([Requests that carry images](#requests-that-carry-images)) →
   `quoteId`, `estimateUsd`. Ask "Make the character sheet for about
   $<price>?" Wait for a yes to this price. Silence, or a yes to an earlier
   price, is not a yes. Then submit it through the CLI with the key
   `teaser-sheet-<yyyymmddhhmm>` → `id`, and
   `genobi_job {"id": "<id>"}` every 15 seconds until `Ready`,
   `genobi_take {"id": "<id>"}`, and
   `genobi_take_to_project {"id": "<id>", "copyId": "<copyId>", "baseRevision": <revision>}`
   → `assetId`. Show it to the person; a rejection is a new quote with their
   notes, and a new key. Keep the sheet's structure in a Scrolls document if
   they want to edit it (`genobi_scrolls`, the `genobi-scrolls` skill).

8. **Storyboard**, only when missing. Write two panels first, one sentence
   each: panel 1 builds to the first strike, panel 2 lands the biggest move
   on the drop. Then `.local/teaser/board.json`, the same fields as step 7
   with this `description`: "Redraw this storyboard as two panels for a
   20-second teaser of <who, from the brief>: panel 1, <sentence one>; panel
   2, <sentence two>. Keep the layout, the pencil style and the beat line
   under the panels, one sentence under each panel." Add
   `public/scrolls/storyboard.png`, quote through the CLI, ask for a yes to
   its price, submit with the key `teaser-board-<yyyymmddhhmm>`, poll with
   `genobi_job`, and hand it in with `genobi_take_to_project` as in step 7.
   Approval as for the sheet.
9. **Track**, only when missing. Four candidates of about 20 seconds, no
   lyrics (an instrumental), the caption from the brief. The four quotes are
   one step by design: each is its own run with its own seed.
   `genobi_quote {"generator": "audio", "model": "minimax-music-3", "description": "<style from the brief>, synthwave anime teaser, driving bass, dubstep drop at the midpoint, no vocals, 128 BPM", "duration": 20}`
   four times → four `quoteId`s. Ask "Make four track candidates with
   MiniMax-Music3 for about $<total>?", wait for a yes, then for each
   `genobi_submit {"quoteId": "<track quoteId>", "idempotencyKey": "teaser-track-<n>-<yyyymmddhhmm>", ...the exact arguments of step 9}`
   and poll. The person listens and picks one; hand in only that one with
   `genobi_take_to_project {"id": "<chosen track id>", "copyId": "<copyId>", "baseRevision": <revision>}`
   → its `assetId` (a production audio asset). The others stay as takes.
   Place it: `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "add-clip", "layerId": "teaser-track", "assetId": "<track assetId>", "track": "new", "startFrame": 0, "durationFrames": <project frames>}}`.
10. **Beat grid.**
    `genobi_audio_analysis {"copyId": "<copyId>", "assetId": "<track assetId>", "detail": "summary"}`
    → `beatFound`, `composition` (`bpm`, `beatOffsetSeconds`, `beatsPerBar`)
    and the key moments (the first drop). `beatFound` false: no grid; say so
    and cut on the shot boundaries instead. Ask the person to confirm the
    downbeat, then
    `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "set-beat-grid", "bpm": <bpm>, "beatOffsetSeconds": <beatOffsetSeconds>, "beatsPerBar": <beatsPerBar>}}`.
    Beat `n` is at frame round((`beatOffsetSeconds` + n × 60 / `bpm`) × 30).
11. **Two shots**, Open then Drop. For each, write `.local/teaser/<shotId>.json`
    from `shots[i].quote` (step 5) with `"projectRevision": <revision>` and
    the `description` rewritten with the panel's own sentence and camera,
    keeping the plan's pattern: "Use the first image as the character sheet
    and the second as the storyboard. The same character throughout; follow
    the storyboard panel <n>; one smooth continuous shot with no cuts or
    transitions; <the panel's sentence>; <camera wording>." then the house
    style. H3 takes no camera control, so the camera is words. Add the sheet
    and then the storyboard with the script and quote through the CLI →
    `quoteId`, `estimateUsd`. Show both prices and the total; ask "Generate
    the two shots for about $<total>?" and wait for a yes.
12. Submit each shot through the CLI with the key
    `teaser-<shotId>-<yyyymmddhhmm>` → `id`; `genobi_job {"id": "<id>"}`
    every 15 seconds until `Ready`, then `genobi_take {"id": "<id>"}`. Any
    other final status: stop and tell the person; never resubmit with a new
    key. The result link lasts about 12 hours; the studio copies it on its
    first poll after the run.
13. **Fallback when H3 is not enabled** for the key (the H3 quote or run is
    refused for the model; this is the one refusal that does not end the
    run): LTX-2.5 Fast, text to video, the character described in words as
    the version-1 card does, the same two panels. No images, so the MCP
    tools. Check the budget again for the two runs:
    `genobi_budget {"runs": 2, "usd": 2.59}` → `fits`; if it is false,
    stop. Then for each shot
    `genobi_quote {"generator": "video", "model": "ltx-2.5", "description": "<the shot in the LTX order: shot size and angle, scene and light, the panel's action, the character in words, the camera movement, sound>", "camera": {}, "cameraEnabled": false, "duration": 10, "resolution": "hd", "aspectRatio": "<aspect>", "projectRevision": <revision>}`.
    Ask: "H3 is not enabled for your key. Generate the two shots on LTX-2.5
    Fast instead, from words only, so the character may not match the sheet,
    for about $<total>?" Wait for a yes to that, then for each
    `genobi_submit {"quoteId": "<quoteId>", "idempotencyKey": "teaser-ltx-<shotId>-<yyyymmddhhmm>", ...the exact arguments of step 13}`
    and poll as in step 12.
14. **Hand-in.** For each Ready shot,
    `genobi_take_to_project {"id": "<id>", "copyId": "<copyId>", "baseRevision": <revision>}`
    → `assetId` and the new `revision`. The audio stays the project's
    production asset. A cut you make yourself with the media tools (a trim
    of a take to the beat, a concat of the two shots; the `genobi-swords`
    skill) goes in the same way with its `sourceId` in place of `id`, after
    the takes it was cut from:
    `genobi_take_to_project {"sourceId": "<trim sourceId>", "copyId": "<copyId>", "baseRevision": <revision>}`
    → `assetId`. The Director's `add-clip` with `sourceStartFrame` below is
    usually enough; hand in a derived cut when the in-point alone cannot
    say it.
15. **The cut.** Each clip starts on a downbeat; the cut lands on the drop
    (the downbeat nearest the first drop, else the one nearest frame 300);
    `sourceStartFrame` is the in-point inside the take, chosen so its
    strongest motion meets the beat. The palette plates stay under the new
    track. Each call returns the new `revision`; send it with the next.
    - `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "add-clip", "layerId": "teaser-open", "assetId": "<open assetId>", "track": "new", "startFrame": <first downbeat frame>, "durationFrames": <drop frame minus first downbeat frame>, "sourceStartFrame": <open in-point frame>, "name": "01 Open"}}`
    - `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "add-clip", "layerId": "teaser-drop", "assetId": "<drop assetId>", "track": "teaser-open", "startFrame": <drop frame>, "durationFrames": <frames to the end>, "sourceStartFrame": <drop in-point frame>, "name": "02 Drop"}}`
    - The title card on the opening beat, one bar long:
      `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "add-graphic", "layerId": "teaser-title", "moduleId": "title", "track": "new", "startFrame": <first downbeat frame>, "durationFrames": <one bar of frames>, "parameters": {"text": "<TITLE>", "color": "#f4efe6", "size": 48, "bpm": <bpm>}}}`
    - The caption on the held last second:
      `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "add-graphic", "layerId": "teaser-caption", "moduleId": "caption", "track": "new", "startFrame": <last second frame>, "durationFrames": 30, "parameters": {"text": "<TITLE>"}}}`
      and hide the template's own placeholder title:
      `genobi_director_command {"copyId": "<copyId>", "baseRevision": <revision>, "command": {"op": "set-placement", "layerId": "title", "opacity": 0}}`.
    - Kinetic modules only where the grid marks a drop, and only recipes
      `genobi_project` lists (`recipes` or `registryRecipes`); nothing on a
      quiet bar.
16. **Hand back.** `genobi_project {"copyId": "<copyId>"}` → the Director
    JSON at its new revision. Then
    `genobi_provenance {"title": "<TITLE>: anime teaser", "jobIds": ["<open id>", "<drop id>"], "copyId": "<copyId>", "skill": "plugins/genobi/skills/anime-teaser/SKILL.md", "agent": {"harness": "<hermes, claude-code or codex>", "model": "<your model id>", "provider": "<local or nous or ...>"}, "hardware": "Comfy Router (hosted)", "startedAt": "<from step 1>"}`
    → `markdown`; add the sheet, storyboard and chosen track job ids when
    you made them. Give the person the card and say: move clips in the
    Director and send it again; `genobi_project_feedback {"copyId": "<copyId>"}`
    returns their changes as commands for your next pass.

## If something goes wrong

- `revision_conflict`: read the project again with `genobi_project` and
  decide afresh; never resend the same command blindly.
- A take shorter than its slot: `trim-clip` it to the take's length rather
  than leave a held frame.
- A quote refused, or a step that ends **refused** or **uncertain**: stop and
  tell the person. The one exception is H3 refused for the model, which goes
  to step 13. Never quote the same step twice in one prompt, except the four
  track candidates (step 9), a sheet or storyboard the person rejected with
  notes (steps 7 and 8), and the fallback's new quotes (step 13). Never
  resubmit an uncertain run with a new key.
