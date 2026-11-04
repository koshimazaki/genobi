---
tags: [director, sound, templates, world-builder]
summary: Audio Reactive Acoustic Spaces v2, the 3D + LTX template - five World Builder rooms rendered by LTX-2.5 Layout-to-Render on one track, each room's own CPU room sound under it, cut on the phrases with every room, the track and every overlay a swappable layer.
---

# Audio Reactive Acoustic Spaces v2: the 3D + LTX template

The fifth **mix** template (`run: "mix"`, [run kinds](templates.md#run-kind-mechanical-or-agent)),
added on 3 November 2026, and version two of
[Adaptive reverb](adaptive-reverb.md). Five World Builder rooms, each rendered
by LTX-2.5 Layout-to-Render (open weights) on the owner's track "Adaptive
Reverb v2", play one after another with each room's own CPU room sound under
its section: a drop between towers, a cathedral, inside a pyramid, outside it
in the desert, and a small studio, where the singer of the original Adaptive
reverb take turns to the camera and smiles while the credit is traced in
beside her. Nothing is generated, quoted or paid when
you open it. In the Gallery it sits in the wide column right after Forest guardian (the
owner's order of 4 November 2026), named
**Audio Reactive Acoustic Spaces v2 · 3D · LTX template**.

| Piece    | Where                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------- |
| Template | `shared/templates/audio-reactive-drop.ts` (id `audio-reactive-drop`; the pipeline keeps its `drop-` names)           |
| Cut      | `shared/templates/audio-reactive-drop.cut.json`, written by `drop-make-cut.py`                                       |
| Media    | `public/media/director-templates/audio-reactive-drop/`                                                               |
| Pipeline | [`audio-reactive/edit/`](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/edit/audio-reactive-drop.md) |
| Showcase | [v1, v2 and their memory](director-bundle/showcase/audio-reactive-drop/README.md)                                    |
| Tests    | `tests/audio-reactive-drop.test.ts`, `tests/gallery-badges-order.test.ts`                                            |

## Every layer swaps

The owner's brief: _"a proper director template with all the layers included.
They should be visible as layers, swappable. Every detail should be there to
swap. Basically, whatever it was used."_ So, unlike Adaptive reverb's one take
in four slices, each room is its own file and its own shot:

| Shot | Room            | File                       | Frames  | Seconds     |
| ---- | --------------- | -------------------------- | ------- | ----------- |
| 01   | Towers          | `drop-towers.mp4`          | 0–174   | 0–7.25      |
| 02   | Cathedral       | `drop-cathedral.mp4`       | 174–342 | 7.25–14.25  |
| 03   | Pyramid inside  | `drop-pyramid-inside.mp4`  | 342–511 | 14.25–21.29 |
| 04   | Pyramid outside | `drop-pyramid-outside.mp4` | 511–679 | 21.29–28.29 |
| 05   | Studio (singer) | `drop-studio.mp4`          | 679–776 | 28.29–32.33 |

Each file holds exactly its shot (`sourceSeconds` 0), so a new room drops in
with no re-timing: replace the file under the same name, or point the shot at
another asset in the Editor. The track is `drop-track.mp3`, one file and its
`durationSeconds`.

The studio's picture is not a World Builder room render: it is the last 97
frames (26.417–30.458 s) of the original Adaptive reverb take
(`adaptive-reverb/reverb-ltx.mp4`, 1280 × 720), upscaled once to 1920 × 1080,
the singer turning to the camera and smiling. Its sound is still the booth
capture's: the track carries the booth's room sound under it (RT60 0.20 to
0.34 s), and the singer clip itself was not measured. To swap the ending,
replace `drop-studio.mp4` with any 97-frame, 1920 × 1080 clip, or point the
studio shot at `drop-studio-booth.mp4`, the booth's LTX render that the
template also lists. The credit's words are the `end-title` layer's `text`
and `line` parameters; its `x` is the text's centre.

The hologram over both pyramid rooms and the depth heatmap in the dancer's box
are baked into the picture. To drop them, use the plain pair the template also
lists, `drop-pyramid-inside-plain.mp4` and `drop-pyramid-outside-plain.mp4`;
the cut uses the hologram pair.

Every overlay is its own layer, an existing trusted recipe:

- **The whole cut**: a `screen-open`, a gentle `crt` visor (a third of the
  stock strength) from beat 4, and a `hud` per room (`● REC DRONE 01 //
DESCENT`, `CAM 01 // ROOM SCAN`, `CAM 02 // PYRAMID INTERIOR`, `DRONE 02 //
PYRAMID EXTERIOR`, `CAM 03 // STUDIO`).
- **Into every room**: a `wire-scan` sweep and a `slice-glitch` on the phrase.
- **Towers**: the DROP title traced in by `gen-title` (Transitions.dev), 4 s
  and 14 track beats long, at the owner's request.
- **Cathedral**: one `scan` readout, then a `ui-focus` box measuring the nave.
- **Pyramid inside**: a `gen-status` pill, then the dancer tracked by a
  `ui-focus` box with the depth heatmap inside it.
- **Pyramid outside**: a wireframe reveal, then PYRAMID · DESERT traced in.
- **Studio**: one `build-panel` readout, four track beats.
- **The ending** (`end-title`, `gen-title` traced text): REACTIVE SPACES and
  ADAPTIVE REVERB · V2 / WORLD BUILDER ROOMS · LTX-2.5 / KOSHIMAZAKI traced in
  beside the singer for the last 5.2 track beats, at x 0.31 (the text centre;
  at 0.2 it clipped at the left edge), y 0.3, size 46. No still covers the
  picture. The owner approved this ending on 3 November 2026: _"great, use it
  as official template with all the layers"_.

## What made each room

The rooms record what made them (`mix.recipes` in
`shared/templates/audio-reactive-drop.ts`), so **Make my version** shows the
still beside the slot and **Recreate in Camera** restores it
([Recreate in Camera](director-generate.md#recreate-in-camera)). Each still is
the look still the LTX-2.5 Layout-to-Render take named in `drop-assemble.py`
started from, checked against that take's first frame, encoded once as JPEG
quality 90 into `public/media/director-templates/audio-reactive-drop/stills/`:

| Slot                   | Still                             | Size    | Preset                   | Still prompt                  | Render prompt (take)                |
| ---------------------- | --------------------------------- | ------- | ------------------------ | ----------------------------- | ----------------------------------- |
| `drop-towers`          | `stills/drop-towers.jpg`          | 649 KiB | `towers-descent`         | not recorded                  | executed (`towers-descent-w0`)      |
| `drop-cathedral`       | `stills/drop-cathedral.jpg`       | 548 KiB | `cathedral-gallery-grow` | not recorded                  | executed (`cathgrow-mid-p2`)        |
| `drop-pyramid-inside`  | `stills/drop-pyramid-inside.jpg`  | 369 KiB | `pyramid-inside`         | not recorded                  | executed (`pyrparty-p3`)            |
| `drop-pyramid-outside` | `stills/drop-pyramid-outside.jpg` | 388 KiB | `pyramid-outside`        | the owner's, given 4 November | executed (`pyrout-p4b`)             |
| `drop-studio`          | none                              |         |                          | no record                     | a slice of the Adaptive reverb take |
| `drop-studio-booth`    | `stills/drop-studio-booth.jpg`    | 595 KiB | `studio-walls`           | not recorded                  | executed (`booth-p5`)               |

A record's `prompt` is the still's own prompt, which Camera restores; one not
written down is listed in `missing`. The pyramid's, as the owner wrote it (the
World Builder scene was then built to match the still and captured for the
render):

> cybernetic pyramid, isometric view, architectural concept, realistic
> cyberpunk, movie capture, on the desert, pyramid its on its own, fuji camera
> shot

It describes the outside still. The towers' still is not a Klein still: by
the owner's note it is a frame taken from a video made with the LTX
text-to-video workflow, recorded as `source: "ltx-video frame"`, and Camera's
notice says "First still taken from an LTX video". That video's prompt is not
recorded, so the towers' prompt is named as not stored. The interior's still is another picture, a
hangar interior with a gold robot ([pyramid-inside](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/presets/pyramid-inside.md)),
so the interior keeps its still with the prompt named as not stored.
`renderPrompt` is what each take's render bundle executed, quoted exactly;
Camera does not restore it. The cathedral's executed prompt follows the voice
("with the voice the stone piers and arches swell inward"), not the preset
page's beat wording. The plain pyramid pair shares each room's record. The
booth's still is 1920 × 1080 as supplied, the others 1360 × 765. Adaptive
reverb (v1) is one continuous take with no per-room still, so it records
nothing.

## The grid is double time

The track is 136.8 BPM, but the cut's grid is 273.6 BPM, eighth notes. A
Director shot starts on a whole beat, and on the track's own grid the phrase
starts (0, 7.21, 14.245, 21.29 and 28.33 s) fall between beats. On the double-time
grid they land on beats 0, 33, 65, 97 and 129, within a frame of each phrase
(frames 0, 174, 342, 511, 679), so the picture cuts on the phrases while the
overlays still snap. The cut is 147.44 beats, 776 frames, 32.33 s, inside the
32.341 s track. The `bpm` parameter of the HUD, scan, panel and title layers
stays 136.8: it is only their visual pulse.

## How the rooms change

Each room's sound is the browser shoebox engine of
[room sound along the scene timeline](world-builder-dynamic-sound.md): each
capture evaluates its scene per frame, samples up to 24 acoustic snapshots,
computes the Sabine RT60 from the room's volume and absorption, builds
image-source and diffuse-tail impulse responses, convolves the track and
crossfades the wet signals at the snapshot times. The track carries every
room's dynamic room sound at wet 0.45 under the dry track, crossfaded over
0.25 s at the picture cuts. From the captures' `room-sound.json` receipts:

| Room            | Seconds     | Width                                                                | RT60           |
| --------------- | ----------- | -------------------------------------------------------------------- | -------------- |
| Towers          | 0–7.25      | 5.7 to 22.4 m: the street, measured from the tower rows' inner faces | 2.10 to 5.46 s |
| Cathedral       | 7.25–14.25  | 7.0 to 20.4 m: the nave                                              | 2.01 to 3.48 s |
| Pyramid inside  | 14.25–21.29 | 9.6 to 29.4 m                                                        | 1.54 to 3.13 s |
| Pyramid outside | 21.29–28.29 | none: open air, no enclosure, the dry track                          | none           |
| Studio          | 28.29–32.33 | 1.0 to 3.0 m: the booth capture, under the singer's picture          | 0.20 to 0.34 s |

The towers' street and the cathedral's nave are proxies whose width now
follows the picture (`rowGap` in `scripts/experiments/recipes-clap.ts`): the
street goes from 22.8 m open to 5.7 m closed as the towers squeeze it, and the
nave from 28 m to 7 m (28 × `CLAP_FRACTION`). The table's ranges are what the
24 snapshots measured over each room's window. Both re-captures reproduced
their rendered guides byte for byte (SHA-256 prefixes `b1b516e9` for the
towers, `a007574b` for the cathedral), which is how the sound is known to
follow the same geometry as the picture. `DROP_ROOMS` in the template keeps
each room's seconds and asset.

## How to repeat it

The pipeline is in `audio-reactive/edit/`, with its own
[How to repeat it](https://github.com/koshimazaki/Genobi/blob/main/audio-reactive/edit/audio-reactive-drop.md):
capture the guides, render on the box, assemble, hologram, depth box, write
the cut, bundle, render. To render the gallery card from the template:

```sh
npx tsx audio-reactive/edit/drop-build-bundle.mts out/drop.zip
DIRECTOR_URL=http://127.0.0.1:4317 node audio-reactive/edit/drop-render.mjs out/drop.zip out/drop.mp4
```

The gallery copy is an encode of the final cut-v2 master render (libx264 CRF 24 at 1920 × 1080, the master's AAC copied, `+faststart`, 23 MiB under the 25 MiB Pages limit), a poster from the cathedral readout at frame 240, and the light
card previews (`.preview.mp4`, `.preview.jpg`, [media preparation](media-previews.md)).

The template's media is about 64 MiB in all (each file under 25 MiB, the
project under the 150 MiB the tests allow); v1's studio file, kept so v1
opens as it was, is another 1.2 MiB under `public/media/showcase/`.

## Limits

- Nobody listened to the cut in the build, v2 included. The room changes and
  their timing were checked by eye from frames; the sound was measured, not
  heard.
- The studio's picture (the original take's singer) and its sound (the booth
  capture's decay) come from different sources. The singer clip was not
  measured, and the original take's own reverb is not in the track.
- The RT60s are the shoebox model's, computed from the evaluated geometry, not
  measurements of the render. The impulse responses are capped at 4 s (the
  shoebox default), so the towers' longest decays are truncated.
- The hologram and the depth heatmap are baked picture passes, not live
  layers: swap them with the plain pyramid files, not in the layer list.
- The assembled picture the room files came from had a one-frame hole at
  7.25 s; each room file starts on its room's own first frame, so the rooms
  sit within a frame or two of where the assembly put them.
- The gallery badge reads the registry's `ltx-2-5-open` entry (LTX-2.5 through
  an open workflow); the Layout-to-Render endpoint has no registry entry of
  its own.
