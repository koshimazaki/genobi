# Moving-scene LTX experiments

Prepare and run a private candidate from an already captured, audio-reactive
World Builder scene. These tools do not change the existing
[qualification matrix](../qualification/matrix.json), register an app endpoint,
or claim that LTX follows fruit/architecture morphs successfully.

## Two controlled candidates

| Mode           | Visual conditioning                             | Audio conditioning                                    | Saved soundtrack        |
| -------------- | ----------------------------------------------- | ----------------------------------------------------- | ----------------------- |
| `layout`       | RGB guide and matching art-directed first frame | Empty frozen audio latent                             | Original trimmed source |
| `layout-audio` | Same RGB guide and first-frame look             | Original audio encoded and frozen through both stages | Original trimmed source |

Both derive from `world-builder-l2r-a2v-studio.json`. They remove the static
Acoustics/Reverb and Koshi acoustic-prompt branches, which cannot describe a
moving room. The visual prompt enters text encoding directly. Both sample
stages keep zero audio noise masks, and `CreateVideo` receives the original
trimmed waveform. No generated-audio decoder or CPU room treatment enters the
soundtrack. Container encoding can change audio bytes.

The `layout` candidate retains the joint audio/video sampling architecture with
an empty audio latent; it is not an exact copy of the upstream Layout graph.
The `layout-audio` candidate retains the repository's combined conditioning.
Both require an actual GPU run and visual/audio review. A diagnostic clip or a
passing unit test is not that evidence.

## Prepare inputs before renting GPU time

Requires Python 3.12+, `ffprobe`, and this checkout. Preparation uses the Python
standard library. It performs no network requests and downloads no model.

Required inputs:

- A complete v1 scene recipe with audio envelopes already prepared from the
  chosen soundtrack segment. The compact JSON sent to the native Capture node
  must fit its 64 KB limit; indentation in a readable export is not counted.
- Its RGB **WebM** capture, exactly 97 or 193 frames at 24 fps. Dimensions must
  match the recipe and be divisible by 64. The native capture node still applies
  its 2 GiB decoded-frame bound.
- An **art-directed look still made from the first captured frame**, aligned
  to that camera. A raw clay screenshot is not the intended appearance input.
- The original music/control audio, long enough for the exact segment. Short
  inputs are refused rather than padded.

Optional depth is archived as evidence and never connected to generation.
An optional capture receipt must bind the exact RGB bytes and recipe.
Preparation verifies the look's aspect ratio, allowing only integer-dimension
rounding that changes either fitted dimension by at most one pixel at the final
×2 output size. The manifest records source/guide/output dimensions and the
measured discrepancy. Existing look-guide nodes 71/73 perform bilinear resizing
with `crop=center` inside LTX; preparation does not modify the supplied image.
Materially different aspects are refused. Visual alignment still needs review.
When a capture receipt binds control audio, supply that exact companion at zero
offset. Choosing another segment requires a new guide capture.

```sh
python3 workflows/experiments/prepare.py \
  --recipe /path/to/recipe.json \
  --rgb /path/to/guide.webm \
  --look /path/to/look.png \
  --audio /path/to/control.wav \
  --output /path/outside-the-repository/fruit-layout \
  --mode layout --frames 193 --seed 42 \
  --prompt 'A glossy sculptural fruit changes shape against a dark studio background.'
```

Repeat with a **new** output directory and `--mode layout-audio` for the
comparison. Keep source files, prompt and seed fixed. Optional flags are
`--negative`, `--depth`, `--capture-receipt`, `--label`, and `--audio-start`.
An audio offset must match the segment used to author the guide's envelopes.
It changes audio trimming only; it never retimes the scene automatically.

Timing is explicit: 193/24 seconds is approximately **8.041667 s**, with the last
frame timestamp at 8 seconds; 97/24 is approximately **4.041667 s**. The tools
do not relabel these as exact 8- or 4-second encoded clips. They check every
decoded frame timestamp and refuse unrequested cropping, padding and retiming.
The local guide command, `node scripts/experiments/capture.mjs`, defaults to
**768 × 448** guide frames. These candidates upscale them by two, producing
**1536 × 896** output frames. It verifies the exact decoded PCM length before
export and writes compact UTF-8 recipe JSON within the native 64,000-byte limit.
Choose an absent or empty output directory for every capture; the command
reserves it before writing, so another study cannot overwrite an earlier
capture's shared soundtrack and source receipt.

The private bundle contains copied assets, `workflow.api.json` and
`experiment.json`, including SHA-256 hashes, source commit/dirty state, script
hashes, source graph hash, seeds, precise timing and measured media metadata.
Every preparation starts as `prepared_not_run`. Keep bundles outside the repo;
they can contain private music, recipe data and prompts.

## Keyframes, Union Control and the refine pass

**Extra image guides (`--keyframe`).** Repeat `--keyframe PATH@INDEX[@STRENGTH]`
to add an art-directed still at guide frame `INDEX` (strictly between 0 and
`--frames`; strength 0.1–1.0, default 1.0). Each still passes the same
one-output-pixel aspect check as `--look`, and is refused when it is the
unmodified guide frame at that index (mean 8-bit difference below 2, decoded with
`ffmpeg`). Both sampling stages chain a new `LTXAddVideoICLoRAGuide` after the
look (nodes `key1s1`, `key1s2`, ...; `crop=center`, the look's VAE and
latent-downscale link), and the stage's guider, crop and AV-concat nodes read the
last one. The stills are frozen as `key1`, `key2`... and `run.py` uploads and
rewrites them like `look`. Without `--keyframe` the graph is byte-identical.

```sh
python3 workflows/experiments/prepare.py --recipe R.json --rgb guide.webm \
  --look look-000.png --audio control.wav --output /private/bundle-b \
  --keyframe look-096.png@96 --keyframe look-160.png@160@0.7 \
  --mode layout-audio --frames 193 --seed 42 --prompt '...'
```

**Union Control (`--mode union-depth`).** As `layout-audio`, but the IC-LoRA
loader loads `ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors` at 1.0 (the
LoRA Lightricks ships for the 2.5 base in `LTX-2.5_ICLoRA_Union_Control_Distilled.json`)
and the guide video is the capture's **depth** track: `--depth` is required and
becomes node 1 `capture_file`. The RGB capture is archived, unused by generation,
and still the reference for keyframe checks. Output prefix
`genobi-experiments/union-depth/candidate` at preparation.

**Refine pass (`refine.py`, on the box).** LTX Tiled Fusion video-to-video with
the Refine-Details IC-LoRA. The upstream graph uses subgraphs and pack nodes, so
it is converted against the live server's `/object_info`:

```sh
python3 workflows/experiments/refine.py convert --ui LTX-2.5_V2V_TiledFusion_Upscale.json \
  --url http://127.0.0.1:8189 --out refine.api.json
python3 workflows/experiments/refine.py submit --graph refine.api.json --video clip.mp4 \
  --prompt 'Crisp 35 mm grain, soft warm key light, teal-orange grade.' \
  --output-size FullHD --seed 42 --url http://127.0.0.1:8189 \
  --run-dir /workspace/runs/refine-001 --wait-seconds 900
python3 workflows/experiments/refine.py status --run-dir /workspace/runs/refine-001 \
  --url http://127.0.0.1:8189 --wait-seconds 600
```

`convert` expands subgraphs (`<instance>:<inner>` ids), maps saved widget values
by name (or by server order), folds literal switches so the unused prompt
enhancer and API encoder drop out, and refuses, listing them, any node type the
server lacks. `submit` finds nodes by class (`LoadVideo`, the positive/negative
`PrimitiveStringMultiline`, `LTXVGetTilingSizes`, sampler seeds, `SaveVideo`),
preflights models, reserves `refine.private.json`, uploads once and POSTs once
to `genobi-experiments/refine/<request>/refine`. A lost response is
`submission_unknown` and is never retried. **Prompts describe look and style
only** (lighting, palette, film stock, sharpness, grade); a named object can
stamp into every spatial tile. Models: `scripts/vast/assets.py --profile second-pass`.

## Read-only ComfyUI preflight

Run through an SSH-forwarded or otherwise explicitly configured private ComfyUI
address. The base URL must not contain credentials. If a private proxy requires
Bearer authentication, set `GENOBI_COMFY_BEARER` in the runner environment;
the token is never written to the bundle or receipt.

```sh
python3 workflows/experiments/run.py \
  --bundle /path/outside-the-repository/fruit-layout \
  --url http://127.0.0.1:8188
```

This checks frozen local bytes and reads `/object_info` for required nodes,
inputs, output slots and model filenames. It does not upload, load models or
submit a prompt. Availability is not GPU compatibility or quality validation.
Install the pinned runtime/model set from `comfy-build/`; these candidates use
the existing BF16 filenames, without AKUSPACE. The reduced-memory ConvRot
configuration is a separate workflow change and is not silently substituted.

## Explicit single submission and recovery

```sh
python3 workflows/experiments/run.py \
  --bundle /path/outside-the-repository/fruit-layout \
  --url http://127.0.0.1:8188 --submit --budget-usd 10

python3 workflows/experiments/run.py \
  --bundle /path/outside-the-repository/fruit-layout \
  --url http://127.0.0.1:8188 --resume --wait-seconds 300
```

`--budget-usd` is recorded as an operator planning limit. **It cannot enforce a
rental spending cap or stop the GPU instance.** Configure and monitor that in
the rental service. No paid request is made while preparing or running tests.

Submission reserves an exclusive, fsynced `run.private.json` before uploads,
uses a unique remote input/output folder and request identity, records the
executed graph, then sends **one** `POST /prompt`. It retains the actual prompt
ID returned by ComfyUI. A timeout, server error or lost response is
`submission_unknown`; a repeat `--submit` is refused. `--resume` only checks
the original queue/history and fetches its output. If ComfyUI cannot identify
the accepted request, uncertainty remains; inspect the machine before deciding
what to do. Do not delete a reservation or choose another ID to retry it.

Node validation rejection is terminal. An upload failure records that no prompt
was submitted. Recovery never starts a replacement job. Polling can be repeated
without generation, and an unfinished queue survives a runner disconnect.

Successful output download verifies frame cadence, expected ×2 dimensions and
bounded soundtrack timing, and remains `output_downloaded_unreviewed`. Review
the result beside the RGB guide for transitions, silhouette, camera adherence,
temporal artefacts, musical alignment and original-audio content. Preserve that
review separately before promoting a result into a reusable template.
Outputs must come from the run's isolated SaveVideo prefix. Resuming a finished
run rechecks its saved output hashes. If a crash left a video without a saved
receipt, recovery preserves it as unverified evidence and downloads that same
remote output again; it never queues a replacement generation.

## Separate sound treatment

For a changing room, render the dynamic CPU room-sound branch separately from
the frozen scene/control timeline, retain its dry/wet stems and decay tail,
then deliberately mix that treatment in Editor. These candidates preserve
the original track to make the visual conditioning comparison interpretable.
They do not feed wet sound back into motion analysis or infer outdoor/coupled
room acoustics.

## Offline verification

```sh
python3 -m unittest discover -s workflows/experiments -p 'test_*.py'
```

Tests cover the derivative wiring, missing look, exact cadence, audio segment
length, immutable input hashes, preflight rejection and uncertain submission
recovery. Fake ComfyUI responses are explicitly synthetic; no models execute.

Upstream references:

- [Layout-to-Render](https://docs.ltx.io/open-source-model/vfx-post-production/layout-to-render)
- [Audio-to-Video](https://docs.ltx.io/open-source-model/usage-guides/audio-to-video)
- [Workflow/model compatibility](https://docs.ltx.io/open-source-model/reference/workflow-asset-compatibility)
