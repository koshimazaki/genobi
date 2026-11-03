# Look stills with FLUX 3 Klein Base

`look.py` makes the art-directed still that the Layout-to-Render candidate
needs for each captured guide, so nobody preps it by hand. It edits a guide
frame with the Klein Base image-edit graph: the frame is reference 0, and the
prompt keeps its composition, camera, object placement and silhouettes while
changing surfaces, light and atmosphere to the requested aesthetic. The guide
frame itself is never used as the look.

The prompt never contains the words clay, 3D, Unreal or render; an aesthetic
that does is refused rather than edited.

## Usage

Run on the box (or through an SSH tunnel) against its local ComfyUI. Each look
posts `/prompt` once; nothing is retried.

```sh
cd workflows/experiments

# One look from one frame. --reference adds a style reference (e.g. a finished
# first look); --aesthetic-image adds an owner mood image (palette and light only).
python3 look.py one --frame CAPTURE/frame-0000.png \
  --aesthetic "sunlit desert pyramid, clean pale-blue sky, wind-rippled sand" \
  --width 1536 --height 896 --seed 42 --url http://127.0.0.1:8189 \
  --out LOOKS/look-first.png --wait-seconds 600 --preflight

# All keyframes of a capture: first, then closed and open with the first look
# as a style reference so the three match.
python3 look.py batch --capture CAPTURE --aesthetic "..." [--aesthetic-image mood.png] \
  --width 1536 --height 896 --url http://127.0.0.1:8189 --out LOOKS

# A look that outlived --wait-seconds: read /history and download only.
python3 look.py fetch --receipt LOOKS/look-first.receipt.json
```

`batch` writes `look-first.png`, `look-closed-NNNN.png`, `look-open-NNNN.png`,
a `*.receipt.json` beside each, and `looks.json`
(`{"aesthetic", "looks": [{"role", "index", "frame", "look", "receipt"}], ...}`).
Re-running `batch` reuses finished looks and refuses to continue past an
unfinished one; `fetch` it first.

A receipt is written before any upload and records the request and prompt ids,
the status, the exact prompt, seed, size, each input's file name, role and
sha256, the graph's sha256 and the downloaded output's sha256. It holds no
machine paths and no credentials.

### Inputs and checks

- **Capture contract.** `keyframes.json` in the capture directory:
  `{"frames": [{"role": "first", "index": 0, "file": "frame-0000.png"}, {"role": "closed", "index": N, "file": "frame-closed-NNNN.png"}, {"role": "open", "index": M, "file": "frame-open-MMMM.png"}], "band": "low"}`.
  `first` at index 0 is required; `closed` and `open` are optional, once each.
  Guide size comes from `recipe.json`, else `capture.json`'s `recipe`. No real
  capture carried this file when this was written; the tests build a fixture
  to the contract.
- **Size.** Width and height are multiples of 16, at most 2048. Their aspect
  must match the guide within one pixel of the 2x output stage — the same
  arithmetic `media.image_contract` applies to `prepare.py --look`, copied into
  `look_graph.py` so this tool does not import a module under change. Use 2x
  the guide size when it divides by 16: 768x448 → 1536x896, 960x544 → 1920x1088.
  The downloaded PNG's size is checked; a mismatch is recorded as
  `output_size_mismatch` and the file is kept.
- **Endpoint.** The same rule as `run.py`: plaintext `http` only on loopback
  (`localhost`, `127.0.0.0/8`, `::1`), so a remote box is reached through an
  SSH tunnel; `https` is accepted elsewhere. No token is read or sent.
- **Preflight.** `--preflight` on `one` or `batch` GETs `/object_info` once
  (once per batch) and refuses before any receipt, upload or `/prompt` if a
  node class of the filled graph is missing, a loader does not list its model
  file, or the graph no longer loads all four Klein files. It is a small copy
  of `comfy_client.preflight_graph` in `look_graph.py`; it loads no model.
- **Prompt.** Aesthetic text 1-600 characters with control characters
  stripped; the built prompt is bounded to 2000 characters.

## The graph and what `look.py` changes in memory

`workflows/flux-3-klein-base-edit.json`, `flux-3-klein-base-t2i.json` and
`flux-3-klein-base.README.md` are byte copies from the main repository
(`main` at `e648b7ee`). The last commits touching them there: edit graph
`98597237`, t2i graph `a4d510b8`, README `432a7a09`.

`look_graph.fill_graph` changes a copy of the edit graph only:

| Node                | Change                                                                           |
| ------------------- | -------------------------------------------------------------------------------- |
| `reference-0..3`    | `LoadImage` per uploaded reference, wired to `17` and `50` as `images.imageN`    |
| `edit-prompt`       | The built prompt                                                                 |
| `51` switch         | `true` (upsampler bypassed) unless `--upsample`, so the recorded prompt is exact |
| `47`, `7`           | Seed                                                                             |
| `17`                | `resolution.megapixels` = W·H / 2^20                                             |
| `look-latent` (new) | `EmptyFlux2LatentImage` W x H, wired to `7.latent_image`                         |
| `9` SaveImage       | Prefix `genobi-experiments/<request>/look`                                       |

The pinned graph samples from `ReferenceMultiLatent`'s own latent, sized from
the first reference at about 1 MP. An explicit W x H latent is the one
structural change; `EmptyFlux2LatentImage` is what the Klein Base t2i graph
uses. Whether the Base edit holds the layout as well with this latent as with
the reference latent is unverified until the first box run.

Node classes `--preflight` checks:
`BatchImagesNode`, `CLIPLoader`, `CLIPTextEncode`, `ComfySwitchNode`,
`EmptyFlux2LatentImage`, `KSampler`, `LoadImage`, `PrimitiveStringMultiline`,
`ReferenceMultiLatent`, `SaveImage`, `TextGenerate`, `UNETLoader`,
`VAEDecode`, `VAELoader`.

## Model files

Sizes and LFS sha256 from the Hugging Face API on 2 November 2026. The BFL
repository is gated (`auto`: accept the licence once with the account whose
token the box uses). The VAE is also in Comfy-Org's ungated Klein repo with the
same bytes; `Comfy-Org/flux2-dev`'s `flux2-vae.safetensors` is a different file
(`d64f3a68…`) and should not be substituted.

| File (ComfyUI folder)                                                | Repo                                         | Path                                                               | Bytes         | sha256                                                             |
| -------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------ |
| `flux3-image-klein-base-int8-convrot.safetensors` (diffusion_models) | `black-forest-labs/flux-3-image-klein-comfy` | `diffusion_models/flux3-image-klein-base-int8-convrot.safetensors` | 5,807,427,339 | `8949ecfc1bf3871b08be02cf43ec7276a4914e1a86eade6b5eb8f4204426bc92` |
| `qwen3vl_4b_int8_convrot.safetensors` (text_encoders)                | `black-forest-labs/flux-3-image-klein-comfy` | `text_encoders/qwen3vl_4b_int8_convrot.safetensors`                | 4,858,559,240 | `32de113cbf8282b02cbff0794b637b9d6676da09314a1db5a30bcea9bf4ee01c` |
| `flux2-vae.safetensors` (vae)                                        | `black-forest-labs/flux-3-image-klein-comfy` | `vae/flux2-vae.safetensors`                                        | 336,211,292   | `868fe7b343cc8f3a19dbcfcafbc3d5f888802be3f89bd81b65b3621a066ce8f3` |
| same VAE, ungated mirror                                             | `Comfy-Org/flux2-klein-4B`                   | `split_files/vae/flux2-vae.safetensors`                            | 336,211,292   | `868fe7b343cc8f3a19dbcfcafbc3d5f888802be3f89bd81b65b3621a066ce8f3` |
| `qwen3.5_9b_flux3_prompt_upsampler_w4a8.safetensors` (text_encoders) | `black-forest-labs/flux-3-image-klein-comfy` | `text_encoders/qwen3.5_9b_flux3_prompt_upsampler_w4a8.safetensors` | 6,724,090,780 | `e5d85a7421d197bf5a12474511936ecabce19a833252f16e9310a983194a4458` |

The upsampler is loaded by the graph even when bypassed (ComfyUI may skip an
unreached branch, but preflight lists it), so the box needs all four.

## Aesthetics for the current looks

Write the finished picture, not the capture. Keep the camera words out: the
instruction already holds the framing.

- **Desert pyramid:** `a lone limestone pyramid in a vast desert at late afternoon, clean cloudless pale-blue sky, fine wind-rippled golden sand, long soft shadows, warm low sun, crisp air, documentary landscape photograph on medium-format film`
- **NYC towers from above (towers-down):** `Manhattan skyscrapers seen from directly above at blue hour, glass and steel facades with lit office windows, streets of yellow cabs and headlights far below, light haze between the towers, aerial architectural photograph, cool blue and sodium-orange palette`
- **Cathedral nave interior:** `the nave of a Gothic stone cathedral, ribbed vaults and tall clustered columns, morning light through stained-glass windows casting coloured beams through faint incense haze, worn limestone floor, quiet and vast, interior architectural photograph`

## Not verified here

Nothing in this change ran on a GPU or a real ComfyUI. The tests fill the real
graph file and drive a fake transport. Unverified until the box: `--preflight`
against its real `/object_info`, that `ReferenceMultiLatent`
accepts the computed megapixels, that the explicit latent keeps the layout,
the output size, and how well closed/open looks match the first.
