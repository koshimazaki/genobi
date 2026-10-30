# World Builder → LTX-2.5 depth / canny control

`world-builder-canny-depth.json` is a UI-format graph for the ComfyUI editor,
not a studio template. Capture already produces control signals: a linear
`depth` pass over the same camera path and `canny` edges from the colour
frames. This graph previews both and feeds one to LTX-2.5 as video guidance.

## The control route

ComfyUI-LTXVideo at `220e1d4` has no separate depth or canny node. Its control
route is the **Union Control IC-LoRA** applied with
`LTXICLoRALoaderModelOnly` and `LTXAddVideoICLoRAGuide`, as in its
`example_workflows/2.5/LTX-2.5_ICLoRA_Union_Control_Distilled.json`. That
example derives depth, canny or pose from a reference video with annotators
(Video Depth Anything, Canny, DWPose); here Capture's own passes replace the
annotators, so no annotator model is needed.

- **Guide with canny** (off by default): a switch picks depth or canny.
- The control batch is capped at 193 frames (8 s) and sized to 1024×576,
  the take's own size. The LoRA's header sets `reference_downscale_factor` 2,
  so the latent sides (pixels ÷ 32) must be even: 1024×576 gives 32×18, while
  960×544 would give 30×17 and stop `iclora.py` with an error. Keep both
  sides multiples of 64. The guide sits at frame 0 in both stages and is cropped after each.
- **Skip the still** (on by default) bypasses both `LTXVImgToVideoInplace`
  nodes; off opens the clip on the reference still (a Klein still of the take's
  first frame).
- The sampler spine, prompt (AKUSPACE Prompt), sound (the take through Reverb),
  Storyboard (colour, canny, depth, render) and Inputs are as in the
  [Layout-to-Render graph](world-builder-layout-to-render.README.md).

Layout-to-Render remains the route that restyles a take from its colour frames
and a look still; this graph is for following only the take's geometry.

## Models

All from `comfy-build/models/layout-to-render.txt`: the BF16 transformer,
Gemma 4 encoder, video VAE, ×2 upscaler and the Union Control IC-LoRA,
`ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors` from
`Lightricks/LTX-2.3-22b-IC-LoRA-Union-Control` at `20a580c` (654,465,352
bytes, sha256 recorded; the repository is public). It is the file Lightricks'
2.5 Union Control example loads and `workflows/ltx-2-5-genmod-control.json`
uses.

## Inputs

| Node             | Value                                                                                                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capture          | `director/world-take.webm`, `director/world-take-depth.webm`, recipe 193 frames; an empty `depth_file` gives a black depth batch                                                                                                                         |
| Reference still  | `world-p03.png`; used only when **Skip the still** is off                                                                                                                                                                                                |
| LoadAudio (test) | `mix-track.mp3`: **Koshi Mosaic · Dimensions**, the first 60 s at 128 kbps with a 1.5 s fade, the World Builder's example track (`public/media/director-templates/dimensions-mix/mix-track.mp3`). Optional; not MIT: bundled with the owner's permission |

## Files ComfyUI's `input/` must hold

Copy these into the input directory before queueing (the box upload step copies the same list):

| File                             | Source                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| `mix-track.mp3`                  | `public/media/director-templates/dimensions-mix/mix-track.mp3` (the test audio)     |
| `director/world-take.webm`       | **Send take to Comfy** from the World Builder (colour frames, 193 frames at 24 fps) |
| `director/world-take-depth.webm` | the same take's depth pass                                                          |
| `world-p03.png`                  | the reference still (used only with **Skip the still** off)                         |

## Validation, 29 October 2026

- `node scripts/check-ui-workflows.mjs --object-info http://127.0.0.1:8188`:
  59 nodes, 91 links, 39 classes, no errors, every model in
  `comfy-build/models/`, every guide and latent a multiple of 64. The two LTXVideo pack classes were
  checked against `scripts/comfy-schemas/ltxvideo-220e1d4.json`.
- **Queued on the Mac, model-free part only** (Capture with `world-p03.webm`
  and its depth, the depth and canny previews, Acoustics, AKUSPACE Prompt,
  Reverb): status `success`, 17 depth and 17 canny 1024×576 frames, the IR and
  wet FLACs.
- **No LTX render was run on the Mac** (no weights there). Whether the Union
  Control LoRA, trained on annotator output, follows Capture's linear depth
  and Sobel canny as well as its own annotators is unproven until a GPU run.
