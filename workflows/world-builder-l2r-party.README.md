# Layout-to-Render party, base resolution

`world-builder-l2r-party.json` is an API-format template. Colour take + reference look → Layout-to-Render → two-stage sampling and ×2 latent upscale. Capture → Acoustics → Reverb processes the original track independently and saves the IR and wet mix.

## Inputs

Fill every token with the offline [materializer](ltx-world-builder.README.md#fill-a-template) before queueing. Seeds must become JSON numbers, not strings.

| Placeholder           | Node.input           | Required value                                                                                                      |
| --------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `__TRACK_AUDIO__`     | `40.audio`           | Uploaded audio filename. L2R/a2v need a slice at least 193/24 seconds long; no private media is included.           |
| `__TAKE_WEBM__`       | `1.capture_file`     | Uploaded colour take filename relative to ComfyUI input/.                                                           |
| `__RECIPE_JSON__`     | `1.recipe_json`      | The complete captured recipe as a JSON string: v1, 24 fps, 1024 × 576, 193 frames; keep the matching room geometry. |
| `__DEPTH_WEBM__`      | `1.depth_file`       | Matching uploaded depth filename, or an empty string to omit depth.                                                 |
| `__REFERENCE_PNG__`   | `8.image`            | Uploaded owner-supplied still; for L2R, make it from the take’s first frame at the same angle.                      |
| `__PROMPT__`          | `30.value`           | Your scene/action/audio description; preserve the intended continuous camera move.                                  |
| `__REVERB_SEED__`     | `10.seed`            | JSON integer seed for the scene IR.                                                                                 |
| `__IR_PREFIX__`       | `11.filename_prefix` | Relative output prefix for the impulse response.                                                                    |
| `__WET_PREFIX__`      | `13.filename_prefix` | Relative output prefix for the CPU wet/dry mix.                                                                     |
| `__NEGATIVE_PROMPT__` | `32.text`            | Your exclusions, including cuts, shot changes, artefacts and unwanted figures as appropriate.                       |
| `__SEED_STAGE_1__`    | `80.noise_seed`      | JSON integer noise seed for the first sampler.                                                                      |
| `__SEED_STAGE_2__`    | `90.noise_seed`      | JSON integer noise seed for the second sampler.                                                                     |
| `__VIDEO_PREFIX__`    | `61.filename_prefix` | Relative output prefix for the encoded video.                                                                       |

## Models and nodes

Build set: `comfy-build/models/world-builder-l2r.txt`. Model filenames and all sampling/widget values from the successful graph are retained:

- `gemma4-12b-with-proj-ltx-2.5-bf16.safetensors`
- `ltx-2.5-22b-distilled-transformer-bf16.safetensors`
- `ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors`
- `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors`
- `ltx-2.5-video-vae-bf16.safetensors`

Packs: director_world_builder, ComfyUI-LTXVideo and Koshi-Nodes, plus ComfyUI core. Capture is 1024 × 576; the guide is 1024 × 576 and the output 2048 × 1152.

## Run evidence, 30 October 2026

The supplied GPU session’s WORKFLOWS.md lists `l2r5-party` under **Worked**. The party dive worked; the crowd remained frozen. Evidence is from a rented RTX PRO 6000 (96 GB), ComfyUI 0.41.0; it has not been rerun here or on the Developer Platform. Private captures, stills and audio are not redistributed.

## Known limits

- Match the reference’s camera angle to the take. An eye-level cathedral reference produced a static shot in the unsuccessful earlier test.
- Empty references and a negative prompt excluding the mannequin mattered for the no-person dives; a hidden head in a follow-camera take produced a folded pose.
- The scene supplies one static IR per clip, not a moving listener. IR mean levels of −46 to −55 dB made wet sound quiet; use the [whole-track script](room-reverb.README.md) for levelled room transitions.
- A standing crowd reference can override the track: the party i2v + audio tests stood and mingled. Frozen crowds, drinks and late stand-in colour blobs remain known limits; the final cut trimmed the party to 6 seconds.
- These are API templates for ComfyUI or the named Developer Platform deployment, not registered studio slots or proof of managed Comfy Cloud availability. L2R + AKUSPACE, cathedral a2v, Union Control and final-cut SeedVR2 upscale remain untried.

## Fixes this depends on

Storyboard 448 × 256 cells are already set in this graph, satisfying the node’s multiples-of-64 rule. Capture’s 2 GiB cap and Inputs preview downscale are now in `custom_nodes/director_world_builder/__init__.py`; the build applies the same fixes to its pinned pack via `comfy-build/patches/world_builder.patch`. The original local cap was 1.25 GiB and rejected a 193-frame 1024 × 576 take. This graph has no Inputs return node, but the downscale is needed if you attach one to a large render.

## How to repeat it

Prepare the inputs above, fill the template, then follow the [shared deployment plan](../docs/comfy-deploy.md). Endpoint name: `party_base`. The owner starts every paid build, deploy and test generation.
