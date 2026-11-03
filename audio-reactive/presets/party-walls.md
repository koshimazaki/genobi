---
preset: party-walls
study: party-walls
---

# party-walls

Study id `party-walls` · template Rooms · [all presets](README.md) · [workflow](../README.md)

## What moves

- The hall of the 30 October cut (`recipes-walls.ts`): 13 x 16 x 5.5 m, three tall windows on each of three walls, a DJ table and the dancing mannequin in the middle.
- On the bass the long walls clap in, x only, to **0.25** of the open width (`WALLS_CLOSED`), blend amount 1.2, everything inside squeezed with them.
- Camera held at (0, 6, 14.6) looking at (0, 0, -4.8), 27 degree lens, just over the wall tops behind the open near end.

## The still

Owner still: the hall shot of the 30 October cut; frame 0 overlays it (checked by a 50 percent blend).

**Composition it must match:** A high corner view down the length of the hall: windows along the long walls, the crowd and the dancer in the middle of the wooden floor, the DJ at the far end.

Prompt to make it (Klein: `python3 workflows/experiments/look.py one --frame GUIDE/party-walls/frame-0000.png --aesthetic "…" --width 2048 --height 1152`):

```text
a big bare hall with tall windows, a crowd dancing on the wooden floor and a DJ at the far end, warm daylight, photographic
```

Only for a space swap; the owner's still is the one to use.

## Render prompt

Verbatim from `scripts/vast/box/make-bundles.sh` (`PROMPT[party-walls]`):

```text
A high corner view of a big bare hall with tall windows, a crowd dancing on the wooden floor and a DJ at the far end; on the beat the long walls close in toward the dancers and open again. Warm daylight, still camera.
```

## Capture

```sh
node scripts/experiments/capture.mjs --studies party-walls --track "$TRACK" --start "$START" --output "$OUT" --frames 193 --width 1024 --height 576 --band-gain auto --band-release 12 --motion-gain 1 --stage studio
```

Then `scripts/vast/box/make-bundles.sh GUIDES LOOKS BUNDLES` and `scripts/vast/box/run-queue.sh <bundle>` on the box.

## Windows so far

- Adaptive Reverb **15.6916** (`w-open2`): captured; the quietest low-band frame within 0.6 s of 16.0833. Opens at 0.84 of its width, shuts fully on the loudest bars. **Not rendered.**
- The earlier `w` take at 16.0833 and gain 2 opened nearly closed and was dropped.

## Knobs

193 frames, 1024x576, band gain auto, release 12, motion gain 1, stage studio, seed 42, CFG 1; still exactly 16:9.

## Swaps

- **Subject:** region from `keyframes.json` → `robot` (the dancer). The agent scales the rectangle to the still's size and edits only that rectangle with the user's prompt (Klein region edit of the first still); a vision check is only the fallback for a hand-made still that drifts.
- **Space:** Swap the hall's surfaces and light; keep "the long walls close in toward the dancers".
- **Track:** change `--track` and `--start`; start on a quiet low-band frame.

## Known limits

- Start on a quiet frame: the planned start sat on a bass hit and opened closed.
