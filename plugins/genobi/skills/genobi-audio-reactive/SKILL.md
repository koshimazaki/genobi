---
name: genobi-audio-reactive
description: Regenerate or vary Genobi's featured audio-reactive workflow - a World Builder study that moves to a track window, one aligned still, and one LTX-2.5 Layout-to-Render graph - from its presets (pyramid, towers, cathedral, hall, booth, robot with fruits, fruit morphs, ship to mecha, diamond). Covers the track, subject and space swaps, the knobs that worked, the box render and the review. Every paid step waits for the person's yes.
license: MIT
compatibility: Needs this checkout with npm ci, Node 22 or later, Chrome (Playwright) and FFmpeg for captures; renders need a rented GPU box set up with scripts/vast/box/box-setup.sh.
metadata:
  version: "0.1.0"
  tags: "agents, ltx, world-builder, sound, workflows"
  docs: "audio-reactive/README.md, audio-reactive/presets/README.md, docs/audio-reactive-second-pass.md, docs/audio-reactive-pyramid.md, docs/vast-runner.md, docs/genobi-cli.md"
---

# Genobi audio-reactive: the featured workflow

You regenerate one of three videos (fruits, spaces, pyramid) or change one
thing in them: the track, the subject or the space. Everything you need is
written down; **do not rediscover a value**. If a number you see differs from
the preset page, stop and tell the person.

Read first, in this order:

1. `audio-reactive/README.md` (the workflow, the knobs, the three swaps).
2. The video page: `audio-reactive/videos/fruits.md`, `spaces.md` or `pyramid.md`.
3. The preset page for each window: `audio-reactive/presets/<name>.md`.

Claude Code, Hermes and Codex run this the same way: shell commands in this
checkout, plus the Genobi CLI or MCP for any paid image edit (see
`docs/genobi-cli.md`; `node plugins/genobi/server/genobi-cli.mjs help` after
`npm run build:mcp`).

## Order of operations

1. **Recall the preset.** Open the preset page; note the study id, the window
   start, the still and the render prompt. Check memory (Open-Brain or the
   project's decision log) for the last verdict on that preset.
2. **Make or request the still.** Owner stills align every time; ask for one
   first. Otherwise make it from the guide's `frame-0000.png` with the preset's
   still prompt (`workflows/experiments/look.py one`, Klein text only). It must
   be exactly 16:9 and line up with frame 0 (check a 50 percent blend).
3. **Capture** the window with the preset's one-line command, `TRACK`,
   `START` and `OUT` filled in. Mac, no GPU, about a minute.
4. **Bundle**: `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES`. The
   PROMPT map in that script is the render prompt; change a noun there only
   for a subject or space swap, and say so.
5. **Render on the box**: `scripts/vast/box/run-queue.sh <bundle>…` inside
   tmux. About 8 minutes and $0.25 per clip. Renting the box and every render
   are paid: get the person's yes for the list first.
6. **Measure**: motion follow (clip against guide) and correlation with the
   low band.
7. **Review a contact sheet** (`comfy preview clip.mp4` or ffmpeg tiles) and
   show it before saying anything about the clip.
8. **Store the decision**: the verdict, quoting the person, and any
   correction, as one entry per correction; update the preset page's
   "Windows so far" in the same change.

## The three swaps

- **Track.** Change `--track` and `--start`. Windows chain every 8.0417 s.
  Any wall study or morph starts on a quiet low-band frame: capture 97 frames
  at `--band-gain 1 --band-release 0` from 0.6 s before the cut, read
  `bandEnvelopes.low` in `recipe.json`, take the lowest frame.
- **Subject** ("tomato to cucumber", "the robot to John Travolta"). A Klein
  region edit of the first still; the guide and window stay.
  1. Read `regions` from the capture's `keyframes.json`: `robot`,
     `fruit-left`, `fruit-right`, `fruit`, `ship` or `diamond`, pixel
     rectangles `{x, y, w, h}` on the 1024x576 guide at frame 0 (the 3D bounds
     projected through the frame-0 camera, 8 percent padding per side). Never
     hard-code a box and never scan the still for one.
  2. Scale the rectangle to the still (x, w by still width / 1024; y, h by
     still height / 576) and edit only that rectangle with the person's
     words. As a FLUX/Klein edit row the box is `[top, left, bottom, right]`
     on the 0-1000 grid, used as `src_bbox` and `tgt_bbox`.
  3. Quote the edit with `genobi_quote`, wait for the yes, then `genobi_submit`.
  4. Only when a hand-made still has drifted from the guide, fall back to a
     vision check of where the subject sits.
  5. For a morph, make the peak still at the closed frame too; the first still
     pins colour. Change the noun in the render prompt.
- **Space.** A new first still from the preset's `frame-0000.png` with its
  still prompt, changing only surfaces, light and atmosphere. Keep camera words
  out. Never use Klein's `--aesthetic-image`: it copies the mood image's
  composition.

## Hard rules

- **Never** write clay, 3D, Unreal or render in any prompt or aesthetic.
- Stills are exactly 16:9 and aligned with frame 0 (1360x768 crops to 1360x765).
- `--motion-gain 1` for every blend (walls, morphs, mecha fruits); gain 2
  saturates them. Close amounts live in the studies, not in the gain.
- 193 frames at 1024x576, band gain auto, release 12 (30 with smooth 5 for
  slow morphs), stage studio, seed 42, CFG 1.
- Wall studies and morphs start on a quiet frame.
- Over ssh, never `pkill -f` or `pgrep -f`: they match the remote shell
  itself. `tmux has-session -t` prefix-matches; use `-t =name`.
- Never retry an uncertain paid submission automatically; record it and ask.
- Do not edit `scripts/experiments/capture-browser.ts` while a capture runs.

## Where the assets live

- Studies and capture: `scripts/experiments/` (`capture.mjs`, `recipes-*.ts`,
  `keyframes.mjs`, `regions.ts`).
- Graph tools: `workflows/experiments/` (`prepare.py`, `run.py`, `look.py`,
  `refine.py`, `LOOK.md`).
- Box tools: `scripts/vast/box/` and `docs/vast-runner.md`.
- Per capture: `rgb.webm`, `depth.webm`, `control.wav`, `room-wet.wav` for
  room studies, `recipe.json`, `capture.json`, `keyframes.json` (frames and
  regions), `frame-0000.png`, `frame-closed-NNNN.png`, `frame-open-NNNN.png`.
- Owner stills, tracks and rendered clips are not in the repository; ask the
  person for them, and keep them out of commits.
