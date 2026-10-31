# flux-3-klein-t2i

The workflow behind the open run of **FLUX 3 Image Klein** (registry entry
`flux-3-klein`, route `workflow`, model `workflow/flux-3-klein-t2i`). The same
model's API run, `flux-3-klein-api`, posts to BFL's
`POST /v1/flux-3-image-klein` instead and does not use this file.

## Source

Comfy's official Klein text-to-image template,
`templates/image_flux3_klein_distilled_t2i.json` in
[Comfy-Org/workflow_templates](https://github.com/Comfy-Org/workflow_templates/blob/369c1ed12496587bbce50a7797ca342da170e5f7/templates/image_flux3_klein_distilled_t2i.json)
(MIT, commit `369c1ed`, 17 October 2026), translated by hand into API format
on 21 October 2026. Its one subgraph, "Text to Image (FLUX 3 Image Klein SD)",
is flattened into nodes `18:*`, as the Comfy frontend names flattened nodes.
Every value comes from the template: the subgraph's inputs (16 steps, `euler`,
`simple`, the four model files, the upsampler on) and its inner widgets (CFG 1,
denoise 1, the upsampler's sampling settings and its system prompt, copied
verbatim into `18:14`).

| Node          | Change from the template                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| `19`          | `ResolutionSelector` removed: the studio sizes the latent itself                                      |
| `20`, `27`    | Markdown notes removed                                                                                |
| `23`, `25`    | `CreateBoundingBoxes` and `Flux3LayoutPrompt` removed: the studio writes the rows (see below)         |
| `18:13`, `24` | `PreviewAny` nodes removed                                                                            |
| `18:20`       | Added: core `StringConcatenate` (`string_a` the chosen caption, `string_b` the rows, delimiter space) |
| `18:4`        | The positive encoder reads `18:20` instead of the switch                                              |
| `9`           | `SaveImage` prefix `image/FLUX3-Klein_t2i`                                                            |
| `18:7`        | Seed is a slot; the template's own seed is not kept                                                   |
| `18:17`       | The template's caption replaced by a placeholder (a slot)                                             |
| `18:1`        | `unet_name` is Cloud's catalogue alias, not the template's hyphenated filename (see Models)           |

**Boxes are prompt coordinates.** BFL writes boxes into the prompt as a JSON
array after the caption, `[top, left, bottom, right]` in integers from 0 to
1000 ([bounding boxes guide](https://docs.bfl.ai/flux_3/flux3_image_bounding_boxes)).
Comfy's `Flux3LayoutPrompt` writes the same thing: the prompt, a space, then
`[{"id", "bbox", "desc"}, …]`. The studio already builds those rows in
`src/image-regions.ts`, so the graph takes them as text: `kleinValues`
(`shared/comfy/klein.ts`) splits the prompt with `readLayout`
(`shared/image-layout.ts`), sends the caption to `18:17` and the rows to
`18:20`. No mask is made anywhere.

**The upsampler.** BFL: "Do not use Klein without its prompt upsampler"
([Klein page](https://docs.bfl.ai/flux_3/flux3_image_klein)). The template's
upsampler (`18:11` `TextGenerate` on the Qwen3.5 9B upsampler, `18:16`
`ComfySwitchNode`) stays on for every plain prompt, and the studio starts the
prompt with `TARGET CANVAS: W:H`, a line the template's system prompt says it
reads. That system prompt also forbids JSON, ids and coordinates in its
output, so a prompt with rows switches the upsampler off (`upsample: false`)
and goes to the encoder in BFL's layout format. BFL's own box-mode upsampler
prompt is not in the template; using it is later work.

## Slots

| Slot        | Path             | Value the studio sends                                                     |
| ----------- | ---------------- | -------------------------------------------------------------------------- |
| `prompt`    | `18:17.value`    | The caption; `TARGET CANVAS: W:H` first when it is upsampled               |
| `layout`    | `18:20.string_b` | The layout rows' JSON as written in the prompt, or empty                   |
| `upsample`  | `18:16.switch`   | `true` without rows, `false` with them                                     |
| `width`     | `18:6.width`     | From the ratio and tier, a multiple of 16 (`kleinSize`)                    |
| `height`    | `18:6.height`    | The same                                                                   |
| `seed`      | `18:7.seed`      | A fresh random seed                                                        |
| `unet_name` | `18:1.unet_name` | Only on a local ComfyUI with `GENOBI_KLEIN_MODEL` set; otherwise unchanged |

`text_encoder` (`18:2.clip_name`), `upsampler_encoder` (`18:12.clip_name`) and
`vae` (`18:3.vae_name`) are model slots too: a local ComfyUI's model map
(`GENOBI_LOCAL_MODELS`) fills them; Comfy Cloud keeps the names in the graph.

Tiers are equal-area squares (768, 1024, 1536, 2048 and 4096 px a side),
reshaped to the ratio, with both sides rounded down to a multiple of 16 so a
frame never exceeds its tier's area. At 4K that keeps every ratio within the
16,777,216 pixels `inspectImage` reads back (4:3 is 4720 × 3536; rounding up
gave 4736 × 3552, a paid image neither adapter could save). BFL does not
publish its exact sizes, so these are the graph's own. `auto` has nothing to size from, so the open run offers the named
ratios only, and a box layout is square unless a ratio is chosen.

## Models

| File                                                 | Folder             |
| ---------------------------------------------------- | ------------------ |
| `flux3_image_klein_sd_int8_convrot.safetensors`      | `diffusion_models` |
| `qwen3vl_4b_int8_convrot.safetensors`                | `text_encoders`    |
| `qwen3.5_9b_flux3_prompt_upsampler_w4a8.safetensors` | `text_encoders`    |
| `flux2-vae.safetensors`                              | `vae`              |

The weights come from BFL's gated
[flux-3-image-klein-comfy](https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy)
repository, under the FLUX Kommunity License ([LICENCES.md](../LICENCES.md)).

**Which diffusion filename.** The graph names
`flux3_image_klein_sd_int8_convrot.safetensors`, the Comfy Cloud catalogue
alias. It is the only Klein filename recorded as accepted by Cloud: on 17
October Cloud rejected the repository's hyphenated name,
`flux3-image-klein-int8-convrot.safetensors`, and accepted the alias. The
official template has since moved to the hyphenated name, but neither the
[Cloud inventory](../docs/comfy-cloud-inventory.md) nor any public catalogue
shows Cloud accepting it, and Cloud's `/api/object_info` answers 401 without a
key (checked 21 October), so the alias stays until a keyed read or a first
Cloud run says otherwise. The other three files keep the template's names.

**A local ComfyUI.** A local install holds the repository's own filenames, so
set `GENOBI_KLEIN_MODEL` to the diffusion model's name as ComfyUI lists it,
relative to its `models/diffusion_models` folder (or a folder
`extra_model_paths.yaml` adds), for example
`GENOBI_KLEIN_MODEL=flux3-image-klein-int8-convrot.safetensors` or
`flux3/flux3-image-klein-bf16.safetensors`. Unset, a local run asks for the
Cloud alias. The server
checks it is a plain relative `.safetensors` or `.gguf` name (no leading slash,
drive, `..` or backslash; `parseModelFile` in `shared/comfy/destination.ts`)
and never prints it. It replaces `unet_name` on the local destination only.
`GENOBI_LOCAL_MODELS` names the other three files the same way, and the local
client refuses a run before submission when ComfyUI does not list one, naming
the slot ([run location](../docs/run-location.md#the-local-model-map)).

## Nodes against the Cloud inventory

[`docs/comfy-cloud-inventory.md`](../docs/comfy-cloud-inventory.md) lists the
official Klein templates as running on Comfy Cloud. Every node class here comes
from that template except `StringConcatenate`:

| Node class                                                    | Verdict                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `UNETLoader`, `CLIPLoader`, `VAELoader`, `CLIPTextEncode`     | In the official Klein template                                     |
| `KSampler`, `VAEDecode`, `SaveImage`, `EmptyFlux2LatentImage` | In the official Klein template                                     |
| `TextGenerate`, `ComfySwitchNode`, `PrimitiveStringMultiline` | In the official Klein template (inside its subgraph)               |
| `StringConcatenate`                                           | Core ComfyUI (`comfy_extras/nodes_string.py`); unverified on Cloud |

Input names were read from ComfyUI's source (`comfy_extras/nodes_textgen.py`,
`nodes_flux.py`, `nodes_string.py`, `nodes_logic.py`, `nodes_primitive.py` at
`Comfy-Org/ComfyUI` `87ed5a0`), including `TextGenerate`'s dotted
`sampling_mode.*` inputs. None of this has run: no Cloud or local submission,
no `/api/object_info` read, and no image made. `tests/klein-workflow.test.ts`
checks the links, slots, models and the class list above.

## Editing an existing image

A request with references uses the derived graph in `shared/comfy/klein-edit.ts`,
following Comfy's official `image_flux3_klein_distilled_image_edit.json`. Each
image is a `LoadImage` input to `ReferenceMultiLatent`, connected to both positive
and negative conditioning. Its empty latent follows the first reference's aspect;
the chosen tier sets the reference megapixels. The caption and edit-box rows go
directly to the encoder so a text-only upsampler cannot remove their coordinates.
The existing diffusion/encoder/VAE model slots and output node are retained.

Source-conditioned open edits require `imageAspect: "auto"` (or its default).
An explicit canvas ratio is rejected rather than silently ignored; use the API
route if the edit needs a different canvas. Local model-file overrides apply
only to slots present in the derived graph, so a configured text-only
`upsampler_encoder` does not break image edits.

Local and hosted adapters upload the actual source bytes before the one reserved
job submission. Hosted uploads use the official low-level SDK transport because
the high-level SDK's runtime WASM hashing cannot execute in workerd. The server
computes the asset hash. Validation and mocked submissions pass; no live paid
edit is claimed by these checks. Boxes guide edits; they are not masks.
