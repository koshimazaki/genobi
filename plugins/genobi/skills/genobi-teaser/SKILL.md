---
name: genobi-teaser
description: Repeat or change the Genobi teaser, the two-minute mix of the studio in use cut to the owner's track - record the studio footage by replaying the scripted takes, edit the cut as data (shots, camera moves, callouts, Paper Shaders, the taste layer), render it with the Director's Render MP4, and record every correction as project memory. Nothing is generated or paid for.
license: MIT
compatibility: Needs the camera-director repository, its own local studio server (never someone else's), Chrome, FFmpeg and Node 22 or later.
metadata:
  version: "0.2.0"
  template: "genobi-teaser"
  tier: "Open"
  tags: "agents, director, sound"
  docs: "docs/genobi-teaser.md"
---

# Genobi teaser

The teaser is a **mix** template: a finished cut of bundled media, written as
data, that the Director opens (`/director?example=genobi-teaser`) and Render
MP4 renders. The full recipe, every owner correction and the rules learned are
in [docs/genobi-teaser.md, "How to repeat it"](../../../../docs/genobi-teaser.md#how-to-repeat-it);
read it first. The steps:

1. **Read the memory.** `genobi context` on the teaser's project copy, or
   `docs/genobi-teaser-memory.json`. The current request outranks project
   guidance, then active Taste, then defaults.
2. **Start your own studio** on a free port with keys that cannot spend:
   `COMFY_API_KEY=comfyui-capture-only BFL_API_KEY=bfl-capture-only PORT=4417 node --import tsx server/index.ts`.
   Never drive the owner's server.
3. **Footage.** `TEASER_URL=http://127.0.0.1:4417 node scripts/capture-genobi-teaser.mjs [shot…]`
   replays the same takes (scripts/genobi-teaser-shots.mjs) at 3840 × 2160
   and logs every move and click. Every spending POST is aborted; never press
   Generate, Submit, Approve, Confirm or Start. **Recording UI takes:** same
   choreography and pace, higher quality only (the owner: "they should be made
   exactly the same, but recorded in higher resolution"): the script refuses a
   take under 3840 × 2160, encodes at CRF 18 and prints the commit; run the
   studio on the branch being cut so the cards are current, since camera moves
   crop the take and a soft take becomes artifacts.
4. **The cut** is `shared/templates/genobi-teaser.cut.json`: beats at 135 BPM,
   source seconds, `move` for camera moves, overlays as recipe layers.
   `checkMix` refuses gaps, overlaps and slices past their source; keep the
   project under 128 layers and 120 s. A pointer or focus box on a moved
   slice needs its `view` (`viewParameter` in shared/templates/mix.ts).
5. **Render.** `TEASER_URL=… node scripts/render-genobi-teaser.mjs out/`
   presses Render MP4 and writes a contact sheet. Show the person frames,
   not paths.
6. **Save memory as you go.** Each brief or correction: `genobi decision`,
   source `interpretation`, quoting the person. Progress:
   `genobi session-checkpoint`. A reusable rule: a Taste proposal the owner
   activates. `node scripts/seed-genobi-teaser-memory.mjs <copyId>` records
   the saved ones. Update "How to repeat it" in the same change.

## Rules the owner set

- Say what the studio did, never where an external clip came from; never
  name a tool the piece did not use.
- Every interface beat lands on one readable detail and holds it at least
  about 1.3 s; keep light pages short.
- Record the interface at 2× the render; render 1920 × 1080; no AI upscale.
- Bundled fonts only; free Transitions.dev transitions only, run unchanged.
