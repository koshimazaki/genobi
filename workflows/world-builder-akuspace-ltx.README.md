# World Builder → AKUSPACE on LTX-2.5

`world-builder-akuspace-ltx.json` is a UI-format graph for the ComfyUI editor,
not a studio template. It runs a World Builder take end to end: Capture (take,
depth, recipe) → Acoustics (room tail, impulse response, AKUSPACE preset) →
AKUSPACE Text Encode → LTX-2.5 with the AKUSPACE LoRA **loaded** → two-stage
sampler → video and audio decode → CreateVideo → SaveVideo, plus the Reverb
branch (the take's dry audio → Reverb → wet) feeding a second video. Groups and
Note nodes explain each branch and which inputs are optional, in the layout of
the owner's AKUSPACE demo graphs.

## Two routes to the same room

| Route | Where the room comes from                                                                                      | Output                                      |
| ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| LoRA  | `akuspace-ltx25-v0.5.safetensors` at 1.0; `AKUSPACEReferenceAudioAligned` places the take's dry audio at t = 0 | `video/world-builder-akuspace-lora`, a FLAC |
| DSP   | World Builder · Reverb: image-source early reflections and a seeded tail computed from the recipe's room       | `video/world-builder-akuspace-dsp`          |
| none  | The take's frames with the Reverb audio, no model (the only video output that runs on the Mac)                 | `video/world-builder-take-room`             |

Both LTX outputs carry the same picture, so the two sounds can be compared.
World Builder · Inputs takes the rendered frames and the LoRA audio back to the
open World Builder (**Send inputs to World Builder**).

## Wiring

- The chain is the owner's `1 DEMO text to video+audio one pass` (Koshi Text
  Encode, aligned reference, `LTXVDualCFGGuider` 1/1, euler_ancestral, 8 then 3
  sigmas, ×2 latent upsample, stage-1 audio carried into stage 2).
- Acoustics' `space_mode`, `application` and `room_preset` outputs are linked
  onto both the AKUSPACE Prompt (a readable preview of the caption) and the
  AKUSPACE Text Encode, so the room built in the World Builder sets the
  caption. One scene-text node feeds both.
- The take sets the timing: frame count (Get Image Size) → video latent length
  and audio latent frames; Capture's `fps` → `LTXVConditioning`, the audio
  latent, both CreateVideo nodes and Inputs.
- **Text only** (on by default) bypasses both `LTXVImgToVideoInplace` nodes.
  Off opens the clip on the take's first frame (strength 0.7, then 1.0 in
  stage 2, as in Comfy's LTX-2.5 template).
- Width 832 and height 464 are half the output (1664×928 after the ×2 upsample).

## Inputs

| Node             | Value                                                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capture          | `director/world-take.webm`, `director/world-take-depth.webm`, recipe v1 at 24 fps, 1024×576, 193 frames (8 s). **Send take to Comfy** fills these.                                                                                                       |
| LoadAudio (test) | `mix-track.mp3`: **Koshi Mosaic · Dimensions**, the first 60 s at 128 kbps with a 1.5 s fade, the World Builder's example track (`public/media/director-templates/dimensions-mix/mix-track.mp3`). Optional; not MIT: bundled with the owner's permission |
| Scene text       | A neutral club-room paragraph; write your own                                                                                                                                                                                                            |
| AKUSPACE nodes   | `effect_level` `low` (the most audible today), `source_type` `female spoken voice`                                                                                                                                                                       |

## Files ComfyUI's `input/` must hold

Copy these into the input directory before queueing (the box upload step copies the same list):

| File                             | Source                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `mix-track.mp3`                  | `public/media/director-templates/dimensions-mix/mix-track.mp3` (the test audio)     |
| `director/world-take.webm`       | **Send take to Comfy** from the World Builder (colour frames, 193 frames at 24 fps) |
| `director/world-take-depth.webm` | the same take's depth pass                                                          |

## Models (`comfy-build/models/akuspace.txt`)

`ltx-2.5-22b-distilled-transformer-comfy-int8-convrot.safetensors`,
`gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot.safetensors`,
`ltx-2.5-video-vae-bf16.safetensors`, `ltx-2.5-audio-vae-bf16.safetensors`,
`ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors` and
`akuspace-ltx25-v0.5.safetensors`. Packs: ComfyUI-Koshi-Nodes `6f3351e` and the
`director_world_builder` folder in this repository.

## Validation, 29 October 2026

- `node scripts/check-ui-workflows.mjs --object-info http://127.0.0.1:8188`
  against ComfyUI Desktop 2.0 (ComfyUI 0.43.1) with the World Builder and Koshi
  packs loaded: 61 nodes, 90 links, 40 classes, no errors. Every class exists,
  every link's type matches both ends and the classes' schemas, every required
  input is linked or set. The same check passes the owner's own demo graph.
- Every core class was also found in ComfyUI `98cc0bf` (v0.41.0, the build
  pin), and the three Koshi classes in Koshi-Nodes `6f3351e`.
- `tests/world-builder-workflows.test.ts`: link integrity, every model file in
  `comfy-build/models/`, the LoRA loader wired, the Director nodes present.
- **Queued on the Mac, model-free part only** (Capture with `world-p03.webm`, a
  17-frame take; the test track; Acoustics; AKUSPACE Prompt; Reverb; the take
  preview): status `success`, a 0.71 s 1024×576 H.264 + AAC 48 kHz stereo MP4,
  the IR and wet FLACs, and the caption ending "AKUSPACE female spoken voice
  outdoors in daytime, gentle open-air acoustics with continuous birdsong
  ambience" (that recipe carries no room).
- **No LTX render was run on the Mac** (no weights there). The LTX chain is
  unrun; a GPU run on a build from `comfy-build/` (the `akuspace` set) is the
  remaining proof.
