# MiniMax FastH3 OmniRef

The Camera family **H3** offers RGB, Canny and depth reference-to-video recipes.
Each takes two images (identity, then look), one owned or catalogue MP4 guide,
and a prompt using `<Picture 1>`, `<Picture 2>` and `<Video 1>`.
It is semantic reference guidance; it does not promise frame-aligned pose control.
Without a guide video, the Router entry `minimax-h3-router` runs the hosted model
from the two images alone (`shared/comfy/h3-router.ts`, see
[architecture](../docs/architecture.md)).

The sanitized API graph derives from Comfy-Org's MIT-licensed
[`video_fasth3_ominiref_r2v.json`](https://github.com/Comfy-Org/workflow_templates/blob/67984637eefcd4825dcf5c134e39034785be1682/templates/video_fasth3_ominiref_r2v.json).
Genobi adds the second image and video guide, fixes the tested output size,
removes example prompts/input filenames, and supplies Canny/DA3 variants in
`shared/comfy/h3.ts`. No weights or example artwork are redistributed here.

## Recipe

- FastH3 OmniRef INT8 ConvRot diffusion weights, matching Qwen3-VL NVFP4 encoder,
  video INT8 ConvRot VAE and audio FP32 VAE. Local hardware must support the
  encoder format, or map a compatible encoder through the existing model slots.
- Euler, simple scheduler, eight steps, guidance 1, seed 42, VSA 10%,
  video/audio sigma shifts 12/3. No upscale.
- 1344 × 768, 124 frames at 24 fps (about 5.17 seconds). The nominal duration
  control is 5 seconds; this model's frame grid determines the actual duration.
  Comfy's template turns its Duration into the 17k+5 frame grid and notes a 15 s
  (362-frame) run at 1344 × 768, but ships 5 s "to avoid OOM on some low-VRAM
  GPUs"; it names no other size. Neither a longer nor an other-shaped Cloud run,
  nor its GPU time, has been measured here, so the composer keeps these four at
  this recipe and its Duration control points to **MiniMax H3 · Reference to
  video · 4–15 s** (the Router entry, first in the H3 menu) for 4–15 s, six
  ratios and 2K. Widening them needs one approved paid run per new length or
  shape, and an estimate taken from it.
- Guide frames: longer dimension 1024, Lanczos. Canny thresholds 0.2/0.5;
  depth uses DA3 Small, resolution 504, mono inference and v2-style rendering.

Three earlier standalone Cloud comparisons completed and their downloaded
MP4s were inspected: RGB, Canny and depth used about 115–123 active GPU seconds
each. That proves the recipe, not this application's new upload integration.
The application estimate allows 240 active GPU seconds at 0.266 credits/second;
it is an estimate, not a spending cap or a guaranteed runtime.

Both adapters reserve a run before uploading the three input files. Images
are persisted only as fingerprints. The guide uses existing source ownership
and size checks. Comfy Cloud uploads use SDK assets; a local ComfyUI uses its
upload route and preflights nodes/models. Uncertain submission is never retried.

The [FastVideo model card](https://huggingface.co/FastVideo/FastH3-Omni-Comfy)
names the components and reference tags. Weights use the
[MiniMax H3 Community License](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/LICENSE),
including territory and commercial conditions; open weights do not mean MIT.

## FLUX image to video

Camera → FLUX also offers **FLUX 3 · Image to video**, which runs on BFL directly. It sends `mode: i2v` and
one to ten ordered base64 `keyframes` to BFL's `/v1/flux-3-video` endpoint.
One image starts the shot; two set the start/end; additional images are evenly
spaced over the selected duration. Explicit timestamp editing and video
continuation are not exposed in this slice. This entry requires a BFL key;
Router support for this input contract has not been verified here.
Contract checked against the **Image to Video** tab of
[BFL's API reference](https://docs.bfl.ai/api-reference/utility/generate-a-video-with-flux-3)
on 27 October 2026. No paid app-level i2v run is claimed by this change.

## Omni Combined (test preset)

One uploaded MP4 fans out into RGB, Canny and DA3 depth; the three frame
batches feed reference video slots 0, 1 and 2 of the same OmniRef node.
One diffusion model, encoder and pair of VAEs are shared. The prompt should
identify `<Video 1>` as appearance/motion, `<Video 2>` as edges and
`<Video 3>` as spatial depth of the same shot. These are three reference
streams, not three independently weighted ControlNet conditions.

This combination has not had a paid smoke run. It may need more VRAM and
reference-encoding time; success of the separate variants does not prove fit.
The provisional estimate allows 480 active GPU seconds (about $0.61 at the
current conversion), not a measured price or cap. Test with a short guide
before a production run. An OOM or uncertain submission must not trigger an
automatic retry or switch to another backend.
