---
tags: [workflows, comfy, ltx, sound, models]
summary: A Docker image of ComfyUI with the Koshi AKUSPACE nodes and ComfyUI-LTXVideo, running AKUSPACE text to video, audio to audio and image to video on LTX-2.5.
---

# AKUSPACE ComfyUI in Docker

`docker/akuspace/` builds one ComfyUI image that runs the three AKUSPACE
workflows on LTX-2.5 on an NVIDIA GPU.
It is the box the [Koshi setup script](https://github.com/koshimazaki/ComfyUI-Koshi-Nodes/blob/main/scripts/akuspace/setup_ltx25_box.sh)
provisions by hand, made repeatable: every pack pinned to a commit, the
silent-failure check built in, and the weights kept on a volume.

## Hosting

The image is for a local or rented GPU box, reached as the studio's Local
ComfyUI. A hosted run of the same graphs belongs on a Comfy Developer Platform
deployment built from the pinned recipe in `comfy-build/` (the `akuspace` model
set); see [Comfy Developer Platform deployment](comfy-deployment.md). Comfy
Router cannot forward an arbitrary graph; its
[workflow support is on the roadmap](https://comfy.org/platform/router).

## What is in the image

| Part                                                                      | Pinned at              | Why                                                                                          |
| ------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------- |
| ComfyUI                                                                   | v0.42.5, `483dae43`    | `LTXVDualCFGGuider` and the LTX-2.5 audio nodes are core from 0.33.0                         |
| torch, torchvision, torchaudio                                            | 2.11.0, 0.26.0, 2.11.0 | PyPI's Linux wheels, CUDA 13.0 (driver 580+); `constraints.txt` holds them for every install |
| [ComfyUI-Koshi-Nodes](https://github.com/koshimazaki/ComfyUI-Koshi-Nodes) | `6f3351e`              | AKUSPACE Prompt, Text Encode and Reference Audio (aligned)                                   |
| [ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo)        | `220e1d4`              | `LTXVAudioOnlyModel` and `LTXVAudioOnlyEmptyVideoLatent`, used by audio to audio             |

`custom-nodes.lock` lists the packs. The Koshi box script also installs
KJNodes, ComfyMath and VideoHelperSuite; none of the bundled graphs uses a node
from them, so the image leaves them out. Add a line to the lock to bring one
back.

**torchaudio matters.** `AKUSPACEReferenceAudioAligned` imports torch,
torchaudio and ComfyUI's LTX core inside a guarded block, by design: the node
still registers when they fail, and the failure only surfaces when a graph runs
it. Removing torchaudio from the built image reproduces exactly that (the node
is listed, `verify` reports `No module named 'torchaudio'`). The constraints
file pins torchaudio to torch's own release, and `verify` imports the module
the way ComfyUI does to catch this before a GPU hour is spent.

## The workflows

All are ComfyUI API format, in `/opt/akuspace/workflows` in the image and
copied to `data/workflows` on start.

| File                       | Does                                                            | Source                                                     |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| `akuspace-t2v.json`        | Text to joint video and audio, one pass plus a ×2 latent refine | Koshi `akuspace_t2v_native_onepass.json`, copied at build  |
| `akuspace-t2v-2stage.json` | The same with a two-stage composition lock                      | Koshi `akuspace_t2v_2stage_hq.json`, copied at build       |
| `akuspace-a2a.json`        | A space on your own dry recording, audio only                   | Koshi `akuspace_a2a_treat_recording.json`, copied at build |
| `akuspace-i2v.json`        | Image to joint video and audio from a first frame               | Genobi's, below                                            |

The Koshi graphs are copied from the pinned pack at build time, so they always
match the nodes installed beside them. Every AKUSPACE graph uses a dry
reference recording through the aligned node and keeps both `LTXVDualCFGGuider`
nodes at `video_cfg=1.0, audio_cfg=1.0` (the transformer is CFG-distilled; more
clips the audio, per the Koshi README).

### Image to video

`akuspace-i2v.json` is `akuspace_t2v_native_onepass.json` at the pinned commit
with the first frame added the way Comfy's LTX-2.5 image-to-video template
(`video_ltx2_5_i2v`, the graph behind [`ltx-2-5-akuspace-t2v`](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-2-5-akuspace-t2v.README.md))
adds it:

| Node       | Change                                                                           |
| ---------- | -------------------------------------------------------------------------------- |
| `90`       | `LoadImage` of `akuspace_first_frame.png`                                        |
| `91`       | `ResizeImageMaskNode`, longer edge 1536, lanczos (template values)               |
| `92`       | `LTXVPreprocess`, compression 18 (template value)                                |
| `93`       | `LTXVImgToVideoInplace` on the base latent `35`, strength 0.7, feeding `39`      |
| `94`       | `LTXVImgToVideoInplace` on the upsampled latent `71`, strength 1.0, feeding `72` |
| `12`       | Prompt rewritten to describe motion from the frame, AKUSPACE controls unchanged  |
| `65`, `66` | Output prefixes `video/AKU_i2v` and `video/AKU_i2v_audio`                        |

`LTXVImgToVideoInplace` scales and centre-crops the frame to the latent, so the
graph keeps the one-pass size (832×464, 337 frames at 24 fps). The image
shapes the opening frame only; AKUSPACE still treats the reference recording.
It has not been rendered yet.

## Inputs

`LoadAudio` and `LoadImage` resolve bare names in ComfyUI's input folder,
`data/input`. **Copy files in, do not symlink**: ComfyUI rejects links that
leave the folder and can report the job as a success with no outputs.

| Graph                      | Needs in `data/input`                             |
| -------------------------- | ------------------------------------------------- |
| `akuspace-t2v.json`        | `dj_dry_voice.wav`                                |
| `akuspace-t2v-2stage.json` | `dry-base-generated-voice.mp3`                    |
| `akuspace-a2a.json`        | `submission_dry_voice.wav`                        |
| `akuspace-i2v.json`        | `dj_dry_voice.wav` and `akuspace_first_frame.png` |

These are the names baked into the graphs; the recordings themselves are not
public and are not in the image. Use your own and set the name on the node.

## Models

`fetch-models` downloads the six files in `models.txt` (about 37 GB) into
`data/models` with `HF_TOKEN`:

| Folder                  | File                                                   | Used by          |
| ----------------------- | ------------------------------------------------------ | ---------------- |
| `diffusion_models`      | `ltx-2.5-22b-distilled-transformer-comfy-int8-convrot` | all              |
| `text_encoders`         | `gemma4-12b-with-proj-ltx-2.5-comfy-int8-convrot`      | all              |
| `vae`                   | `ltx-2.5-audio-vae-bf16`                               | all              |
| `vae`                   | `ltx-2.5-video-vae-bf16`                               | the video graphs |
| `latent_upscale_models` | `ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0`          | the video graphs |
| `loras`                 | `akuspace-ltx25-v0.5`                                  | all              |

LTX-2.5 is [gated](https://huggingface.co/Lightricks/LTX-2.5): accept the
licence with the token's account first. The AKUSPACE LoRA and nodes are public
(published with the Koshi node pack), so the LoRA needs no extra access. A
401 answer is refused rather than saved as a `.safetensors` page, and `verify`
flags any model file under 1 MB. The Koshi box script leaves out the latent
upscaler, which the one-pass and image graphs load; this list includes it.

The Koshi README measured the graphs on an RTX PRO 6000 (95 GB) at about 44 GB
peak VRAM; the audio-only graph needs about 35 GB.

## Run it

```sh
cd docker/akuspace
cp env.example .env       # HF_TOKEN
docker compose build
docker compose run --rm fetch-models
docker compose up -d
docker compose exec comfyui sh /opt/akuspace/scripts/entrypoint.sh verify
```

The host needs the NVIDIA Container Toolkit and a driver for CUDA 13.0. For an
older driver, build with `TORCH_INDEX_URL=https://download.pytorch.org/whl/cu128`.
ComfyUI has no sign-in, so compose binds port 8188 to `127.0.0.1` only; reach a
rented box through an SSH tunnel or Tailscale. The container starts as root
only to own the `data` folders on a bind mount, then runs as uid 1000.

**From the studio.** The studio's Local ComfyUI run location expects
`http://127.0.0.1:8188`, the port this container serves. Genobi's own
`ltx-2-5-akuspace-t2v` template is Comfy's Cloud graph, not the Koshi one: it
also loads the prompt-enhance encoder `gemma4_e2b_it_int8_convrot.safetensors`
and the `neon_cyborg_portrait.png` first frame, which `fetch-models` does not
download. Put both in `data` (or map them in `GENOBI_LOCAL_MODELS`) before
running it from the studio; see [run location](run-location.md).

## Verify

`verify` reads the running instance's `/object_info` and checks every bundled
graph against it: each node type is registered (the three AKUSPACE nodes by
name), every required input is set, every link names
a node and output that exist, and every literal dropdown value is offered,
which covers the model files and the input recordings. It also imports the
aligned reference module with the server's `COMFY_ARGS` and fails when the
module registered but cannot run, names a model file under 1 MB, and exits 1 on any failure. `--skip-files` turns
missing weights and inputs into warnings, for checking an image with no models.

Every GPU hour on a rented box is paid. Nothing in
this setup queues a graph.

## Checked

24 October 2026, in a sandbox with no GPU, so the image was built and run on CPU
(`COMFY_ARGS=--cpu`). The sandbox's TLS proxy needed a local base image with its
CA and apt over HTTPS; the Dockerfile itself was unchanged. The image then also
held a third-party API node pack and a fifth graph for it (ComfyUI-Runware),
both removed on 28 October 2026; the results below predate that.

- The image builds (about 12 GB on disk, 4 GB compressed). ComfyUI starts in
  about 16 seconds, imports every node pack without a failure, and runs as `comfy` after taking over a root-owned bind
  mount.
- `verify --skip-files` with no weights: every node type in the five graphs
  registered. It caught one real fault, a graph's `fps` sent as text, since
  fixed.
- `verify` with placeholder model and input files under the real names: all five
  graphs match (1,479 node types), exit 0. A 0-byte `.safetensors` is reported
  as a likely 401 page.
- torchaudio uninstalled in the running container: `verify` fails with
  `No module named 'torchaudio'`, exit 1.
- `fetch-models.sh` against a local server: refuses without `HF_TOKEN`, keeps a
  real file, refuses an HTML 401 page without saving it, removes a 404's
  partial, and skips a file it already has.

Not run: any render, on CPU or GPU; a real model download. The
image-to-video graph is checked against the node schemas, not rendered.

The verifier refuses empty or UI-format graphs and invalid output socket
indices, including negative indices and links from nodes with no outputs.
