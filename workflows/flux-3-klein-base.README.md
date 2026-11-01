# FLUX 3 Image Klein Base — Comfy Cloud workflows

These are the **Base** text-to-image and image-edit API graphs provided for
Genobi, normalized for dynamic studio inputs. They are **not** the Distilled
workflow. Base is the default open Klein workflow; the original Distilled
graph remains in `flux-3-klein-t2i.json` as an alternate template.

| Workflow | Model | Sampler | Prompt |
| --- | --- | --- | --- |
| `flux-3-klein-base-t2i.json` | `flux3-image-klein-base-int8-convrot.safetensors` | 50 steps, CFG 3.5, Euler/simple | Text plus prompt upsampler |
| `flux-3-klein-base-edit.json` | Same Base model | 50 steps, CFG 1, Euler/simple | Image-aware `TextGenerate`, with upsampler bypass for box coordinates |

## Source and normalization

The source files were supplied as `image_flux3_klein_t2i (1).json` and
`image_flux3_klein_image_edit (1).json`. The Comfy API node IDs and
model/sampler choices were retained, with these deliberate transformations:

- Remove editor-only previews, compare views, resolution selectors and static
  bounding-box widgets. Studio ratio/size controls fill numeric latent size,
  and the existing box editor supplies the actual layout JSON.
- Replace demonstration prompts and `LoadImage` sample paths with template
  slots. Each reference is uploaded once, then connected to both
  `ReferenceMultiLatent` and the edit graph's `BatchImagesNode`.
- Retain the **Base edit graph's image-aware prompt upsampler**. Bypass it
  when coordinates are supplied, so its system prompt cannot strip the box JSON.
- Keep node `9` as the image output. Both graphs return ordinary image takes.

## Providers and missing models

For **BFL API**, the split Generate control sends directly to BFL's
`/v1/flux-3-image-klein` endpoint with a BFL key. It does not submit
either Comfy graph and does not consume Comfy credits.

For **Comfy workflow**, the Base graph runs on Comfy Cloud (or a configured
local ComfyUI) using the Comfy route. Cloud's node and model inventory is
checked before upload/submission. Missing `UNETLoader`, Base weights, CLIP,
VAE, `ReferenceMultiLatent` or `BatchImagesNode` cause an unsent error
rather than a charged GPU failure. Genobi never substitutes Distilled weights
for Base, because their samplers have different settings.

No live paid Base inference is claimed by the repository tests; validate an
actual Base text-to-image and one-reference edit on the connected Cloud account
before merging.
