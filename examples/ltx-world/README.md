# LTX, 3D layouts and room acoustics: worked examples

The [prompt examples](prompts.json) contain the exact positive prompts,
negative prompts and sampler seeds transcribed from the 23 worked API graphs
in the 30 October 2026 GPU session. They are historical run inputs, not newly
invented example prompts or proof of a managed deployment. Media inputs are
not bundled; replacing a capture, still or music changes the result.

[All 23 workflow graphs and input guides](https://github.com/koshimazaki/genobi/blob/main/workflows/ltx-world-builder.README.md) ·
[Endpoint-to-graph manifest](https://github.com/koshimazaki/genobi/blob/main/workflows/ltx-world-builder.endpoints.json) ·
[Deployment recipe and remaining checks](https://github.com/koshimazaki/genobi/blob/main/docs/comfy-deploy.md)

## The README's 3D/acoustics showcase

The recorded CPU comparison uses four Layout-to-Render shots:

| Endpoint    | Picture                                                              | Sound                                                     |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| `dive`      | Empty camera dive between towers toward the cathedral                | Scene-derived CPU reverb                                  |
| `cathedral` | Top-down dive between columns toward the altar                       | Cathedral scene IR                                        |
| `party`     | Party-room layout, styled reference and music in the audio latent    | Party scene IR; original track retained in the final mix  |
| `studio`    | Wooden studio layout, styled reference and music in the audio latent | Studio scene IR; original track retained in the final mix |

World Builder supplies the 3D scene, capture and recipe. Klein made the look
references in an earlier step; Klein is not in this deployment's nine-model
set. LTX-2.5 with Layout-to-Render IC-LoRA supplies the picture. The CPU
Acoustics/Reverb nodes derive an approximate room response from the original
scene. The continuous-track comparison crossfades those IR treatments outside
ComfyUI. The scene does not reconstruct the generated picture's geometry.

`studio_akuspace` is a separate image/audio-to-video experiment: AKUSPACE with
an audio mask of 0.5 can change the music as well as its room sound. The source
ledger explicitly leaves **Layout-to-Render + AKUSPACE together untested**.
Older showcase overlays use AKUSPACE preset labels and illustrative decay
values; they do not establish which graph produced the CPU cut.

## How to repeat it

1. Pick an endpoint in `prompts.json` and open its graph's input guide from
   the workflow catalogue. Keep the graph's recorded model and sampler settings.
2. Supply your own matching World Builder capture/recipe, look reference and
   audio where required. L2R captures are 1024 × 576, 193 frames at 24 fps.
   Image-to-video and narration graphs have their own fixed dimensions.
3. Copy that example's `values` into a values file. Add the remaining tokens
   listed by the graph: capture filenames, recipe JSON as a string, reference,
   audio and relative output prefixes. The example does not include filenames,
   provider identifiers, credentials or private scene data.
4. Materialize offline; this creates JSON and never submits:

   ```sh
   python3 workflows/materialize-ltx.py --endpoint party --values values.json --output party.api.json
   ```

5. On your own prepared ComfyUI, upload the matching inputs and inspect the
   filled graph before queueing. For the Developer Platform, follow the linked
   deployment recipe, review the GPU billing and verify asset path resolution
   before authorizing a run. No live platform endpoint was tested in this release.
6. Inspect the generated output and original track before cutting. The recorded
   party shot developed stand-in colour blobs near its end, so the CPU cut
   trimmed it at 6.5 seconds. Align the look reference to the take's camera:
   an earlier eye-level cathedral reference produced a static shot.

For the continuous-fall experiment, use the previous result's actual final
frame as the next stage's `FIRST_FRAME_PNG`: cathedral → party → studio. Each
stage is a separate paid run; there is no automatic retry or paid chaining.

## What was tested

The source runs used a rented RTX PRO 6000 (96 GB), ComfyUI 0.41.0. This release
checks the templates, input mappings, build recipe and prompt transcription
offline. All named workflows target the proposed shared `genobi-ltx-world`
deployment; those names are graph selectors, not 23 provisioned HTTP URLs.
A successful GPU session does not prove Developer Platform asset upload,
submission, polling or delivery, nor a Genobi Camera generation handoff.
