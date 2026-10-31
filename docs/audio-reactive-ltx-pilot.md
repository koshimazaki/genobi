---
tags: [workflows, world-builder, sound]
summary: Capture editable music-driven fruit, architecture and descending-camera studies, then compare two local LTX candidates with the original soundtrack.
---

# Audio-reactive LTX pilot

This is an operator workflow for making and testing reusable scene templates.
It prepares the animation, soundtrack excerpt, camera, RGB/depth guides and
evidence before a GPU is rented. The rendered guides are ordinary World Builder
recipes. A successful guide capture is not evidence that LTX preserves its motion.

The [loop studio](world-builder-loops.md) supplies the editing foundation and
[dynamic room sound](world-builder-dynamic-sound.md) supplies CPU treatment.
The [Vast runner](vast-runner.md) prepares a pinned worker. The separate
[experiment tools](https://github.com/koshimazaki/genobi/tree/codex/vast-audio-reactive-lab/workflows/experiments)
freeze the inputs and submit a candidate graph once.

## Four source studies

| Study          | Authored guide                                                                                                                                   | Sound treatment                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `fruit`        | 192 retained voxels: banana → apple → papaya. Two short morphs begin at selected audio events; restrained twist and scale follow measured bands. | Original music.                                                                                   |
| `architecture` | 128 retained pieces: pyramid → eight towers → diamond. The fixed camera makes shape and event timing easier to compare.                          | Original music.                                                                                   |
| `falling`      | A descending camera moves from a geometric city into a cathedral form and a smaller room. The same 96 parts change arrangement.                  | Original music outdoors; an optional separate wet stem fades in at the interior entry.            |
| `room`         | The existing apartment expands into a loft with one explicit changing acoustic enclosure.                                                        | An original-music preview plus a separate CPU room preview. This is the simpler acoustic control. |

These are authored geometric studies. The falling scene's towers are about
38 metres tall; the cathedral sound uses an explicit 20 × 24 × 32 metre
shoebox proxy, then a 12 × 5 × 16 metre room. Decorative blocks do not define
an inferred acoustic mesh. The camera and indoor listener meet at the authored
entry/final points. The beginning is outdoors and the treated preview keeps that
part dry. There is no outdoor propagation, coupled-room simulation or moving-wall
wave solver. A falling character and identity replacement are later variants.

## Keep musical control explicit

The default cue picker finds the largest positive low-band and high-band changes
in two bounded parts of the chosen excerpt. It records those candidates in
`study.json`. It is **not a kick/snare classifier**. Inspect the excerpt and move
the cues if the selected transient is musically wrong.

Each cue is the **start** of a six-frame transformation; arrival is recorded
separately. The generated recipe holds its prior state until the cue, transitions
for six frames and then holds the new state. Continuous band modulation still
adds small scale/twist offsets. All values are frozen before capture, so random
seeking, preview and export use the same geometry.

For an exact kick/snare arrangement, author the desired event frames from the
track or supply a reviewed cue file. For example:

```json
[
  {
    "frame": 48,
    "source": "authored",
    "method": "authored-frame",
    "transitionFrames": 6
  },
  {
    "frame": 132,
    "source": "authored",
    "method": "authored-frame",
    "transitionFrames": 6
  }
]
```

Pass it with `--cues /path/to/cues.json`. These numbers are an illustrative
arrangement, not a claimed transcription of the bundled track. When replacing
the music, reanalyse it and review or replace the cues; an old envelope must not
silently remain attached to new sound.

## Capture without a model

Install the repository's dependencies and a Chrome-compatible browser, then run:

```sh
npm ci
node scripts/experiments/capture.mjs --output .local/ltx-pilot
```

Use `--browser /path/to/chrome` when the browser is not at Playwright's default
location. The harness starts a loopback-only Vite server, blocks external browser
requests and renders with the actual World Builder WebGL runtime. It does not
call a provider or create a GPU job.

The default uses the 16-second offset of the bundled **Koshi Mosaic — Dimensions**
excerpt. Its existing media licence applies. To choose another track:

```sh
node scripts/experiments/capture.mjs \
  --track /path/to/music.wav --start 12 \
  --studies fruit,architecture --output .local/my-morph-pilot
```

The default is 193 frames at 24 fps, with a 768 × 448 guide. The candidate's
second stage produces 1536 × 896 output. For a shorter smoke test, use
`--frames 97`; use a new output directory for each capture. Both dimensions must
be divisible by 64. Start and frame count are explicit; the harness refuses a
track that cannot supply the complete excerpt.

193 frames have a last frame timestamp of 8 seconds and an encoded duration of
**193/24 = 8.041666… seconds**. The original excerpt is fitted to that exact
sample count. A four-second endpoint similarly means 97/24 encoded seconds.
Do not relabel or crop these guides to whole seconds before conditioning.

Each study produces:

- `recipe.json`, compact enough for the native node's 64 KB input bound.
- `rgb.webm` and `depth.webm`, with matched decoded frame count and cadence.
- `first.png`, `depth-first.png` and selected state PNGs.
- `control.wav`, the exact excerpt used for motion analysis and soundtrack.
- `capture.json`, the existing frozen take receipt and hashes.
- `study.json`, cue arrivals, sampled frame hashes, scope and sound records.
- `preview.mp4`, a local guide with the original excerpt attached.
- For acoustic scenes, `room-wet.wav`, `room-sound.json` and a separately labelled
  `preview-room-sound.mp4` that retains the decay by holding the final picture.

The wet stem is rendered from an explicit copy of the chosen excerpt. It never
feeds back into the control envelopes. The treated preview uses bounded dry/wet
gains and is separate from the original-soundtrack comparison. Keep both versions.

## Make matching appearance references

Create an art-directed still **from `first.png`** for each study. Preserve its
camera, silhouette, framing, object placement and aspect ratio while changing
materials and lighting. Review the result beside the guide; a prompt asking for
alignment is not proof that alignment was preserved.

For a first fruit pass, retain the visible voxel construction and give it a
polished fruit or glazed-sculpture surface. For architecture, start with the
same pyramid and a coherent stone/metal treatment. Only move to a completely
smooth fruit or radically different building after the block-preserving pilot
shows that shape and timing survive.

Generating a beautiful pyramid image and reconstructing arbitrary 3D geometry
from it is a separate upstream task. This pilot already has editable geometry,
so appearance can be developed against that geometry. Optional later keyframe
references require a deliberate graph change; this candidate binds one look still.

## Prepare the controlled comparison

Follow the [candidate graph commands](https://github.com/koshimazaki/genobi/blob/codex/vast-audio-reactive-lab/workflows/experiments/README.md).
Use a fresh bundle directory outside the repository:

```sh
python3 workflows/experiments/prepare.py \
  --recipe .local/ltx-pilot/fruit/recipe.json \
  --rgb .local/ltx-pilot/fruit/rgb.webm \
  --depth .local/ltx-pilot/fruit/depth.webm \
  --capture-receipt .local/ltx-pilot/fruit/capture.json \
  --look /path/to/fruit-look.png \
  --audio .local/ltx-pilot/fruit/control.wav \
  --output /path/outside-the-repository/fruit-layout \
  --mode layout --frames 193 --seed 42 \
  --prompt 'Polished sculptural fruit pieces change from banana to apple to papaya, with the materials and lighting of the reference.'
```

Repeat into another directory with `--mode layout-audio`, retaining the same
guide, look, music, prompt and seed. Both candidates attach the original trimmed
waveform; neither replaces it with generated sound. The second candidate also
uses the music as frozen audio-latent conditioning. This is a comparison of
conditioning, not a claim that adding audio always improves visual fidelity.

The stock combined graph's static acoustic branch rejects moving recipes. The
candidate removes that branch explicitly rather than deleting animation from
the recipe. Dynamic CPU sound remains separate, so a reverb adjustment needs no
additional video generation. Depth is retained evidence, not an automatically
connected LTX control channel.

## Run and review in a bounded session

Prepare the [Vast worker and SSH tunnel](vast-runner.md), verify the frozen
bundle against its live node/model schemas, then submit **one** fruit pilot.
Keep the rental clock and actual remaining credit visible. The runner records
a budget note but cannot cap Vast billing or stop the machine.

Review the guide and output together:

1. Are banana, apple and papaya recognizable at their intended frames?
2. Does each morph begin at the selected cue and arrive six frames later?
3. Are the camera, large silhouettes and occupied regions preserved?
4. Does the original music remain aligned from the first frame to the last?
5. Are any blocks lost, duplicated or replaced by an unrelated subject?

Retain the failure if the first pilot misses these checks. Try one changed
variable before increasing clip length or resolution. Once fruit is readable,
run the matching audio-conditioned comparison, then architecture. The falling
camera is a harder camera/structure test; the room study independently checks
the acoustic layer. AKUSPACE and identity replacement are optional later tests.

A template becomes ready for others after there is an accepted generated take
plus its source recipe, explicit replacement slots, track offset, cue file,
appearance reference, exact candidate graph, seed and model/runtime provenance.
Keep the original guide preview available so a user can check their changed
inputs before paying for a generation. Until the GPU results are reviewed,
present these as experimental source studies.

## Verification

```sh
npx vitest run tests/experiment-recipes.test.ts
python3 -B -m unittest discover -s workflows/experiments -p 'test_*.py'
python3 -B -m unittest discover -s scripts/vast -p 'test_*.py'
```

The capture harness additionally checks real WebGL rendering, reverse-seek
pixel identity, decoded RGB/depth frame counts and timestamps, and soundtrack
length. These checks are separate from actual model execution and perceptual
review of LTX outputs.
