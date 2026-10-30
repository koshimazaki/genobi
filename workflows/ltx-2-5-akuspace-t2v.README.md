# ltx-2-5-akuspace-t2v

The workflow behind the **LTX-2.5 · Acoustic Space** registry entry
(`ltx-2-5-akuspace`, route `workflow`, model `workflow/ltx-2-5-akuspace-t2v`).
`ltx-2-5-t2v.json` beside it is the same graph without the LoRA (template
`ltx-2-5-t2v`): a session can swap Acoustic Space onto it where the LoRA is not
installed, the treatment still in the prompt, and a later plain LTX-2.5 entry
can run it.

## Source

Both files are Comfy Cloud's built-in LTX-2.5 image-to-video template in API
format (`video_ltx2_5_i2v`, read 10 October 2026), with these changes:

| Node      | Change                                                                       |
| --------- | ---------------------------------------------------------------------------- |
| `398:363` | `Switch to Text to Video?` set to `true`                                     |
| `398:383` | Prompt enhance kept `false`: the enhancer rewrites the camera and room text  |
| `398:376` | The template's image-led prompt replaced by a neutral placeholder (a slot)   |
| `405`     | Removed (see below)                                                          |
| `75`      | SaveVideo prefix `video/LTX-2.5_akuspace_t2v` (`video/LTX-2.5_t2v` in plain) |
| `900`     | Added in the AKUSPACE graph only: the LoRA (see below)                       |

**Why `405` is gone.** `LatentUpscaleModelLoader` loaded the MiniMax H3 latent
upscaler, and nothing consumed it. The MiniMax H3 open-weights licence excludes
the EU, UK and US and bars showing outputs there, so the node stays out of the
repository's graphs.

**The LoRA.** Node `900` is a core `LoraLoaderModelOnly` with
`model: ["398:384", 0]` (the `UNETLoader`), `lora_name:
akuspace-ltx25-v0.5.safetensors` and `strength_model: 1.0`; both
`LTXVDualCFGGuider` nodes (`398:388`, `398:391`) take their model from it.
These values match node 80 of the AKUSPACE reference workflow
(`akuspace_ltx25_t2v_split_chain.json`). The run uses the Cloud library of the
key that submits it, so the LoRA must be imported there, which needs the
Creator tier. If it is missing, Cloud answers with node errors and the job
fails with that fix named.

No Koshi custom node runs on Comfy Cloud: the studio composes the AKUSPACE
treatment itself (`shared/acoustic.ts`, a port of the AKUSPACE Prompt node) and
appends it to the prompt, so the graph's text encoder receives the finished
prompt.

**Still in the graph.** `395` `LoadImage` keeps the template's
`neon_cyborg_portrait.png`. Text to video bypasses it (`398:363` feeds the
`bypass` input of both `LTXVImgToVideoInplace` nodes), but Cloud may still
validate the file; the first real run confirms whether it does.

## Slots

`shared/comfy/akuspace.ts` names them; `shared/comfy/slots.ts` writes them into a
copy of the graph and refuses the run, unsent, if a path is missing or holds a
link.

| Slot            | Path                 | Value the studio sends                                                     |
| --------------- | -------------------- | -------------------------------------------------------------------------- |
| `prompt`        | `398:376.value`      | The LTX paragraph (scene and camera sentences) with the AKUSPACE treatment |
| `duration`      | `398:362.value`      | Whole seconds, 2–20; frames = seconds × 24 + 1 (`8n+1`)                    |
| `fps`           | `398:361.value`      | `24`, as in the AKUSPACE reference workflow                                |
| `width`         | `398:372.value`      | Final width, aligned to 64 pixels                                          |
| `height`        | `398:360.value`      | Final height, aligned to 64 pixels                                         |
| `lora_strength` | `900.strength_model` | `1.0`, the node pack's recommended strength for a trained caption          |
| `seed`          | `398:339.noise_seed` | A fresh random seed for the first pass                                     |
| `refine_seed`   | `398:338.noise_seed` | A fresh random seed for the refining pass                                  |

Every loader is a `model` slot as well (`unet_name`, `text_encoder`,
`prompt_encoder`, `video_vae`, `audio_vae`, `latent_upscaler`, and `lora_name`
in this graph only), filled on a local ComfyUI from `GENOBI_LOCAL_MODELS` and
left as written on Comfy Cloud. A local run also needs `neon_cyborg_portrait.png`
in ComfyUI's `input` folder, because `LoadImage` `395` validates its file even
when text to video bypasses it.

`ResolutionSelector` node `403` has been removed: the studio supplies explicit
width and height through the existing core integer nodes. All seven studio
ratios are available. Presets preserve each tier's pixel budget and snap both
sides to 64 pixels, because this graph starts at half size (multiples of 32)
and then doubles the latent. The UI shows the resulting dimensions. Landscape
presets are 1280×704, 1920×1088, 2560×1472 and 3840×2176; higher tiers are no
longer silently capped. These changed graph settings have unit/schema checks;
new shapes and higher tiers still need GPU execution before quality claims.

At 24 fps, 8 seconds supplies 193 frames; the encoded clip is approximately
8.04 seconds. Both video and audio use that same frame count. The graph always
renders audio. The negative prompt (`398:373.text`) remains the template text.

The plain graph is selectable as **LTX-2.5 · Open workflow**. This is an explicit
workflow route, billed by the chosen Comfy destination, not an automatic retry
or fallback after a Router submission. Router Fast/Pro remain separate entries
and offer only their documented landscape/portrait sizes; Pro stops at 1080p.

Public AKUSPACE workflows for reference:
[github.com/koshimazaki/ComfyUI-Koshi-Nodes/tree/main/workflows/akuspace](https://github.com/koshimazaki/ComfyUI-Koshi-Nodes/tree/main/workflows/akuspace).
