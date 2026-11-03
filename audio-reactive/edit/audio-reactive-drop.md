# Audio Reactive Drop: how to repeat it

The pipeline behind the gallery's Audio Reactive Drop template
([the template page](../../docs/audio-reactive-drop.md)): five World Builder
rooms rendered by LTX-2.5 Layout-to-Render on the owner's track "Adaptive
Reverb v2", assembled on the phrases with each room's own CPU room sound, two
picture passes, then the cut as data, a Director bundle and a render.

The scripts take the run folder as `--runs DIR` (or `GENOBI_RUNS`): the
3 November 2026 run, holding `run3/` (the LTX renders), `guides-phrase/` and
`guides-v2/` (the World Builder captures: `recipe.json`, `depth.webm`,
`room-sound.json`, `room-wet.wav`). The track and the towers render are passed
as files.

## The order

1. **Capture the guides.** One World Builder capture per room, on the track,
   with its band envelopes and room sound (`scripts/experiments/capture.mjs`,
   `--band` picks the band the walls follow). The towers and the cathedral
   were re-captured after their acoustic widths were tied to the measured gap
   of their side rows (`rowGap`, `scripts/experiments/recipes-clap.ts`); the
   re-captures reproduced the rendered guides byte for byte.
2. **Render on the box.** LTX-2.5 Layout-to-Render on each capture
   ([Layout-to-video](../../workflows/world-builder-l2r-a2v.README.md)). This is
   a paid GPU run: quote and get the owner's approval first.
3. **Assemble** (`drop-assemble.py`): the five rooms on whole frames 0 / 174 /
   342 / 511 / 679 / 776, the cathedral's floor colours pulsing to the voice
   band, and each room's `room-wet.wav` at wet 0.45 under the dry track.
   Writes `OUT-dry.mp4` and `OUT.mp4`.
4. **Hologram** (`drop-holo.py`): the guides' depth edges in cyan,
   screen-blended over both pyramid rooms, following the low band.
5. **Depth box** (`drop-depthbox.py`): the interior's depth guide,
   false-coloured, inside the dancer's focus box for its window.
6. **The room files.** Cut the result (and the pre-hologram picture, for the
   plain pyramid pair) into one file per room, each from its room's first
   frame for exactly its shot: 174, 168, 169, 168 and 97 frames, 1920 × 1080,
   libx264 CRF 18, `-r 24`, no sound, `+faststart`, each under 25 MiB. The
   end card is a frame of the studio at 31 s. The track is the assembly's
   sound as MP3 320 kb/s.
7. **Make the cut** (`drop-make-cut.py`): writes
   `shared/templates/audio-reactive-drop.cut.json` on the double-time grid
   (273.6 BPM, shots at beats 0 / 33 / 65 / 97 / 129); then
   `npx prettier --write` it.
8. **Bundle** (`drop-build-bundle.mts`): `npx tsx audio-reactive/edit/drop-build-bundle.mts out/drop.zip`.
9. **Render** (`drop-render.mjs`): with the local studio running,
   `DIRECTOR_URL=http://127.0.0.1:4317 node audio-reactive/edit/drop-render.mjs out/drop.zip out/drop.mp4`
   (about 80 s), then the gallery copy under 25 MiB, a poster and the card
   previews.

## What was run on 3 November 2026

- Steps 1 to 5 were run on the owner's machine by the session that built the
  picture (as `assemble-v2e.py`, `holo.py` and `depthbox.py`, whose arguments
  became `--runs`, `--track` and `--towers` here). Their output,
  `spaces-v2e-holo-db.mp4` and `spaces-v2e.mp4`, is what the room files were
  cut from.
- `drop-assemble.py` as committed was run once against the same run folder to
  check it: 776 frames at 24 fps, no hole. Its first version, `assemble-v2e.py`,
  left a one-frame hole at 7.25 s (the towers section's input trim), so the
  shipped room files were cut from each room's own first frame (175 / 343 /
  513 / 681 by timestamp) instead of the grid frame. The committed script
  trims every section to an exact frame count.
- `drop-holo.py` and `drop-depthbox.py` as committed were not re-run; they are
  the run's scripts with the paths turned into `--runs`.
- Steps 6 to 9 were run in the template's pull request.

## Rules learned

- A Director shot starts on a whole beat. When the phrases fall between beats,
  double the grid rather than moving the picture off the phrases.
- Cut room files by timestamp, not frame index, and check the frame count of
  every file: an `-ss`/`-t` trim can leave a hole that shifts every later room.
- Encode each slice with `-r 24`: a source whose average rate is not exactly
  24 otherwise loses a frame at the end.
