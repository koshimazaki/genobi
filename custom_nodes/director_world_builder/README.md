# World Builder for local ComfyUI

Build from the Director root with `node scripts/build-scene-adapter.mjs`, then copy
this `director_world_builder` directory into your local ComfyUI `custom_nodes`
and restart ComfyUI. FFmpeg must be on PATH, or in `/opt/homebrew/bin`,
`/usr/local/bin` or `/opt/local/bin` (ComfyUI Desktop starts the server with a
minimal PATH on macOS); torch, numpy and Pillow come with ComfyUI. The generated bundle is the same World Builder as Director, with no
Director backend dependency. Its `.mjs` extension avoids Comfy loading the
bundle as a top-level extension.

1. Add **World Builder · Capture**. The scene shows inside the node, where you
   can switch Shot, Build and Walk and play the take; **Open World Builder**
   enlarges the same editor (Back to graph or Escape returns it, edits kept).
   After a queue the node previews the first frame, depth and canny.
2. Click **Send first frame** for IMAGE guidance, or **Send take to Comfy** for
   a 24 fps frame batch and matching audio. This uploads into Comfy's input
   directory and fills the node widgets. It does not queue or spend credits.
3. Connect `frames` to image/video conditioning. Connect `frames`, `audio` and
   `fps` to your installed video-combine node. `recipe` preserves editable JSON.
4. To bring generated material back, connect an IMAGE batch and/or AUDIO into
   **World Builder · Inputs**, queue it, then click **Send inputs to World
   Builder**. Keep exactly one Capture editor open for this action. A frame
   batch becomes the screen's video texture; AUDIO drives fixed-grid modulation.
   The editor's Sound tab also lists this Comfy session's recent audio outputs
   (SaveAudio, PreviewAudio and Inputs, newest first, six at most) to pick
   from. They are read from this Comfy's `/view` and kept in the editor only.
5. Capture again after changing incoming assets. This is an explicit browser
   preparation step, not a cyclic graph or unattended renderer. Video generation
   happens in the downstream model workflow. A video object must first be
   decomposed into frames with the workflow's standard video-components node.

## Depth, canny, acoustics, reverb and storyboard

A take now carries a second, linear depth pass over the same camera path and
frame grid (`<name>-depth.webm`, or a depth PNG for **Send first frame**). Near
is white at the recipe's `depthNear` metres and fades to black at `depthFar`
(defaults 0.1 and 50); the receipt records both. **Send take to Comfy** uploads
it into the optional `depth_file` widget. The optional `audio` input
takes a connected AUDIO (LoadAudio, a TTS or music node) as the take's sound in
place of `audio_file`, so no WAV export is needed; it keeps its own sample rate
and channels and is trimmed or padded with silence to the take's length
(frames / 24 fps), the same rule as the 48 kHz WAV path. When both are set the
connected AUDIO wins. Capture's outputs are, in order,
`frames`, `audio`, `fps`, `recipe`, `depth` and `canny`. `depth` is greyscale
replicated to three channels (a black batch when `depth_file` is empty);
`canny` is computed here from the RGB frames (torch Sobel, non-maximum
suppression, double threshold), with no extra pip dependency.

- **World Builder · Acoustics** reads a recipe's `room-*` set, estimates RT60 by
  Sabine and names the AKUSPACE preset and level (see `acoustics.json` and the
  Acoustics section of `docs/world-builder.md`). Besides the `space_preset`,
  `level`, `rt60` and `room_summary` outputs, its `space_mode`, `application`
  and `room_preset` outputs carry Koshi_AKUSPACEPrompt's exact combo lists, so
  they can be linked onto those three widgets (convert or drop the link on the
  widget). `examples/rooms/` holds a recipe per preset, each with two
  reactive test objects (a low-band sphere and a mid-band cube circling the
  character); `small_room.json` names the creature, so attach its VRM under
  Scene before configuring it into the editor directly.
- **World Builder · Reverb** convolves AUDIO with an impulse response computed
  from the recipe's room: image-source early reflections to order 3 in the
  Acoustics shoebox, then a seeded noise tail under its Sabine RT60 whose highs
  die first. Wire Capture → Acoustics → Reverb (Capture's `audio` and `recipe`),
  or any AUDIO → Reverb with a recipe string. Outputs: the wet/dry `audio`
  (same rate, channels and length), a mono `impulse_response` for SaveAudio,
  and a one-line `summary`. numpy and torch only; `pyroomacoustics` would be an
  optional later upgrade for per-band absorption and higher orders. See the
  Reverb section of `docs/world-builder.md`. This is the DSP route; the
  AKUSPACE LoRA route learns rooms from recordings inside LTX.
- **World Builder · Storyboard** tiles the first frame of up to eight IMAGE
  batches into one 2x2, 1x4 or 2x4 sheet for FLUX Klein; empty slots stay black and
  `panels` names each cell. `examples/storyboard/ninja/` holds eight recipes for a 2x4 board.

`examples/world-builder-acoustics.json` wires all of this into one graph: Capture
→ Acoustics → Koshi_AKUSPACEPrompt (the LoRA route; that node comes from the
ComfyUI-Koshi-Nodes pack, which must be installed too) and Capture → Reverb →
SaveAudio (the DSP route), a LoadAudio → Reverb branch that puts any voice into
the same room, with canny, depth and a storyboard sheet previewed.
Its LoadAudio names `dj_dry_voice.wav`, the same input as the API-format twin
(`workflows/world-builder-acoustics.api.README.md`), which no install ships:
if ComfyUI reports the file missing, pick any WAV already in its input folder
or upload one with the node's upload button, or bypass that branch (LoadAudio,
its Reverb, SaveAudio and summary) to run the rest without it.

This directory is self-contained: Python imports only its own modules,
`acoustics.json` lives here (Director's room presets read it at build time),
and every class is prefixed `Director`. Tests: `python3 test_nodes.py` and `python3 test_reverb.py`.

The Capture node decodes only uploaded PNG/WebM and matching PCM WAV files.
It restricts paths to Comfy's input directory, caps decoded takes at 2 GiB
(including 193 frames at 1024 × 576), and hashes
file contents for cache invalidation. Exported visual WebM and WAV are separate;
use the combine node to mux a soundtrack. No audio file produces silence.
Inputs shrinks large image batches to the 320M-value preview budget, keeping
full-resolution source tensors unchanged; it still allows at most 241 RGB frames.
FFprobe must accompany FFmpeg for WebM metadata checks.

Comfy Cloud uses the external World Builder's downloads with supported Load
Image/Load Video/Load Audio nodes. This custom node is for local installations;
it does not bypass Cloud's managed node catalogue. No arbitrary HTML, URLs or
GitHub projects are executed. Integrations provide declared recipe adapters.

Verified in an isolated ComfyUI 0.16.4 / frontend 1.41.20 CPU instance.
[Model-free example graph](examples/capture-round-trip.json): Capture → native
CreateVideo/SaveVideo for MP4 with audio, plus Inputs for the return path.
Other frontend versions still need a smoke test.

## Comfy Developer Platform build and run

The recipe in `docs/comfy-deployment.md` writes `comfy-build.yaml` from
`docker/runware-comfy/sources.lock`; it does not include this directory yet.
After `sh docker/runware-comfy/scripts/prepare-comfy-build.sh ./comfy-work akuspace`:

1. `node scripts/build-scene-adapter.mjs` (only needed for the in-graph editor;
   a headless run needs the Python files and `acoustics.json`).
2. `cp -R custom_nodes/director_world_builder ./comfy-work/ComfyUI/custom_nodes/`
3. Append under `definition.customNodes` in `./comfy-work/ComfyUI/comfy-build.yaml`:

   ```yaml
   - name: "director_world_builder"
     source: "local"
     localPath: "director_world_builder"
   ```

4. `cd ./comfy-work/ComfyUI && comfy build validate .`, then
   `comfy build push --dry-run --models-dir ./models --custom-nodes-dir ./custom_nodes`
   (the dry-run total should grow by this folder's zip only).

To submit a job with a captured take, put the files under the install's
`input/` folder at the paths the API workflow names, for example
`input/director/cathedral.webm`, `input/director/cathedral-depth.webm` and
`input/director/cathedral.wav`, with `capture_file`, `depth_file` and
`audio_file` set to `director/cathedral.webm` and so on, and `recipe_json` to
the recipe text. Then
`comfy deploy run . --workflow world.api.json --deployment <id> --output-dir out`.
`comfy deploy run` uploads files the workflow names from `models/`, `input/`
and `output/` (add `--asset-root <dir>` for anywhere else) and lists each
upload. Each run is a billed job.

Not yet verified on the platform: that the worker resolves an uploaded asset
to the same `input/` relative path the node reads, and that FFmpeg/FFprobe
exist in the worker image. WebM takes need both; PNG stills need neither.
