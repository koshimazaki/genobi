# Gen-Mod graphs

Two API-format graphs for [Gen-Mod](../docs/genmod.md)'s video pass, built on
24 October 2026 from `ltx-2-5-t2v.json` (Comfy Cloud's own LTX-2.5 template,
see [its README](ltx-2-5-akuspace-t2v.README.md)). **Core ComfyUI nodes only**:
every class was checked against ComfyUI `7cebca5` (23 October 2026), so no
custom node pack is needed locally or on Comfy Cloud. Neither has been run.
Their templates are `shared/comfy/genmod.ts`; they are not in the template
table yet, so no registry entry runs them.

| File                          | Template id              | Route     | What it does                                                               |
| ----------------------------- | ------------------------ | --------- | -------------------------------------------------------------------------- |
| `ltx-2-5-genmod-audio.json`   | `ltx-2-5-genmod-audio`   | `audio`   | Frame 0 + the source soundtrack: a lip-synced take, motion from the prompt |
| `ltx-2-5-genmod-control.json` | `ltx-2-5-genmod-control` | `control` | The same, with the source's pose guiding the motion (Union Control)        |

## Changes from `ltx-2-5-t2v.json`, both graphs

| Node                           | Change                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `398:380`–`398:383`, `398:393` | Prompt enhancer removed: Gen-Mod writes the prompt (`genmodPrompt`)                                                                                            |
| `398:363`                      | `Switch to Text to Video?` `false`: the approved frame 0 (`395`) conditions the take                                                                           |
| `398:357`                      | Stage 1 image strength 0.7 → 1: the take must open on frame 0                                                                                                  |
| `398:378`                      | Length is a `PrimitiveInt` of frames (8k+1) instead of seconds × fps + 1; `398:362` removed                                                                    |
| `901`, `902`                   | Added: `LoadVideo` of the cut source clip and its `GetVideoComponents`                                                                                         |
| `903`–`906`                    | Added: source audio trimmed to the clip, encoded, frozen with a zero `SolidMask`                                                                               |
| `398:377`                      | Stage 1 audio latent is the frozen source (`906`); the empty audio latent `398:366` removed                                                                    |
| `398:370`                      | `CreateVideo` muxes the original waveform (`903`); the audio decode `398:358` removed                                                                          |
| `75`                           | SaveVideo prefix `video/LTX-2.5_genmod_audio` or `video/LTX-2.5_genmod_control`                                                                                |
| `403`                          | `ResolutionSelector` removed: `398:372` and `398:360` are width and height slots, set from the source (`genmodSize`) so portrait and square keep their framing |

The freeze is the one Comfy's `video_ltx2_3_ia2v` template uses; muxing the
original waveform follows Lightricks' LTX-2.5 A2V graph ("muxes the original
waveform into the output").

## Added in the control graph

| Node  | Class                     | Role                                                                                   |
| ----- | ------------------------- | -------------------------------------------------------------------------------------- |
| `911` | `CheckpointLoaderSimple`  | `sdpose_wholebody_fp16.safetensors`, as Comfy's `utility_sdpose_ood_video_to_pose_map` |
| `912` | `ResizeImageMaskNode`     | Source frames, longer side 1024                                                        |
| `913` | `SDPoseKeypointExtractor` | Whole-body keypoints per frame, batch 16                                               |
| `914` | `SDPoseDrawKeypoints`     | The pose video (body, hands, face, feet; threshold 0.5)                                |
| `915` | `LoraLoaderModelOnly`     | `ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors` at 1.0, on the LTX-2.5 UNET     |
| `916` | `GetICLoRAParameters`     | The LoRA's `reference_downscale_factor`, from its metadata                             |
| `917` | `LTXVAddGuide`            | The pose video as the guide at frame 0, strength 1 (slot `guide_strength`)             |
| `918` | `LTXVCropGuides`          | Guides cropped after stage 1, so stage 2 upscales only the take                        |

Stage 1's guider (`398:388`) runs the IC-LoRA model with the guided
conditioning; stage 2's (`398:391`) the base model with the cropped one, as in
Lightricks' 2.5 Union Control graph. Comfy's `video_ltx2_3_ic_lora` template
wires the core IC-LoRA path the same way (`LoraLoaderModelOnly` →
`GetICLoRAParameters` → `LTXVAddGuide` → `LTXVCropGuides`).

## Not yet in these graphs

- **Isolation.** The pose is read off the whole frame, the recipe defaults'
  setting. `genmodValues` refuses a nonempty `isolate` until core
  `SAM3_Detect` / `SAM3_VideoTrack` / `SAM3_TrackToMask` (with
  `sam3.1_multiplex_fp16.safetensors`, as Comfy's templates load it) is wired.
- **Depth and canny guides.** Pose only; `genmodValues` refuses the others.
- **Comfy Cloud file upload.** The local ComfyUI client uploads `first_frame`
  and `source`; the Cloud SDK path does not upload files yet.
- **Generated sound.** Both graphs keep the source soundtrack. `genmodValues`
  refuses `audio: "generate"` rather than silently keeping the original.

## Trying one by hand

Load the JSON in ComfyUI (API format loads directly), set `395` to the
approved frame 0, `901` to a source clip already cut to 8k+1 frames (97 is the
proved length), `398:378` to that frame count, `398:361` to its frame rate and
`903.duration` to frames ÷ fps, `398:372` and `398:360` to the output width
and height (the source's aspect, each side a multiple of 64: 1280 × 704 for
16:9, 704 × 1280 for 9:16), write the prompt in `398:376`, then queue. The
models are the LTX-2.5 files of `ltx-2-5-t2v.json` plus, for control, SDPose
and the Union Control IC-LoRA.
