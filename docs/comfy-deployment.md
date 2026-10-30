---
tags: [workflows, comfy, backend, models, research]
summary: A Comfy Developer Platform build recipe for the Openjutsu swap, AKUSPACE and Layout-to-Render from one set of pins in comfy-build/; how comfy build push treats weights, the shared ComfyUI version, sizes per workflow and one build versus several.
---

# Comfy Developer Platform deployment

For the current compact LTX / World Builder release, use the
[key deployment guide](comfy-deploy.md) and its `ltx-world-key` set with verified
remote model references and comfy-cli 1.24 commands. The older recipes and
1.23 command research below describe separate builds; their local-model
requirements do not apply to the key release.

Comfy runs Openjutsu as a Comfy Developer Platform deployment: a build made with
`comfy build`, released, then deployed. Comfy Cloud and these deployments host
everything Genobi runs. The recipe reads one set of pins in `comfy-build/`, so
builds cannot drift: `comfy-build/sources.lock` (ComfyUI and node packs by set,
with patches) and `comfy-build/models/<set>.txt` (weights at pinned revisions
with size and SHA-256).

Nothing here has been run against a Comfy account. The command syntax is read
from comfy-cli v1.23.0 (released 20 October 2026), not executed.

## Does push upload the weights?

It depends on the entry, and the recipe chooses per entry so that **public
weights are never downloaded or uploaded from your machine**:

- `comfy build init` hashes every file under `models/` locally
  (`scan_models` in
  [`comfy_cli/command/build.py`](https://github.com/Comfy-Org/comfy-cli/blob/v1.23.0/comfy_cli/command/build.py)),
  so the scan route needs all the weights on disk.
- On `push`, a scanned file whose SHA-256 matches a public Hugging Face or
  CivitAI file becomes a `sourceUri` and is not uploaded; anything else is
  uploaded, one presigned PUT per file
  ([`build_push.py`](https://github.com/Comfy-Org/comfy-cli/blob/v1.23.0/comfy_cli/command/build_push.py),
  `prepare_push`). Openjutsu's "these commands do not download model files" is
  true of `init`, not of `push`.
- A model entry may instead be written by hand with `type`, `filename`, an
  `https` `sourceUri` and `sha256`; `push` reads a file from disk only for
  `source: local` entries, so such an entry needs no local copy
  ([comfy-build-authoring skill](https://github.com/Comfy-Org/comfy-cli/blob/v1.23.0/comfy_cli/skills/comfy-build-authoring/SKILL.md),
  "The spec format").
- The builder fetches anonymously, so a **gated** file (LTX-2.5,
  Layout-to-Render) cannot be a `sourceUri`; it must be uploaded from disk
  (the same skill, on gated sources).
- [Comfy's serverless overview](https://docs.comfy.org/development/serverless/overview)
  confirms `comfy-build.yaml` describes the environment and holds no weights.

So the swap build needs no weights locally: all seven files are public and
hash-pinned. AKUSPACE and Layout-to-Render need their gated LTX files on disk
for the push (39.7 GB and 72.4 GB); that belongs on the lab PC, not the Mac with
77 GB free.

The skill also warns that a hand-written URL is "the same mistake" as one from
memory, preferring `comfy build refs resolve`. These URLs are not guesses: each
is the repository and revision Openjutsu pins, with the SHA-256 from Hugging
Face's LFS metadata at that revision. Run `comfy build refs resolve <filename>`
for each hand-pinned file and `comfy build validate --remote .` before every
push: they check the URLs and hashes against the builder.

## The recipe

```sh
sh comfy-build/scripts/prepare-comfy-build.sh ./comfy-work swap
```

It fetches ComfyUI and the set's node packs at their commits (patching the swap
pack), creates an empty `models/`, writes `comfy-build.yaml`
(`scripts/comfy_build_spec.py`), and prints the next commands. The spec has:

- `baseComfyVersion`: the ComfyUI commit, `98cc0bf8…` (v0.41.0).
- `h3_character_swap` as `source: local`: it comes from a subfolder and carries
  a patch, so push zips the patched folder. The pack's `pyproject.toml` names
  `h3-character-swap-nodes` 0.1.0, which the registry does not publish; a
  scanned build would pin that and be refused, which is why the spec is
  generated rather than scanned.
- Other packs (Koshi-Nodes, ComfyUI-LTXVideo) as `repository` + `gitRef` at
  the commits in `sources.lock`.
- `pipDependencies` empty: the builder installs ComfyUI's and each pack's
  `requirements.txt` and owns torch (the
  [comfy-build-pins skill](https://github.com/Comfy-Org/comfy-cli/blob/v1.23.0/comfy_cli/skills/comfy-build-pins/SKILL.md)).
  The patched swap pack's `requirements.txt` already adds `imageio-ffmpeg`.

Then, with comfy-cli installed (`pip install comfy-cli`):

```sh
comfy setup --where cloud
cd comfy-work/ComfyUI
comfy build validate .
comfy build refs resolve <filename>    # each hand-pinned model URL
comfy build validate --remote .
comfy build push --dry-run --models-dir ./models --custom-nodes-dir ./custom_nodes
comfy build push --release --target linux/nvidia --models-dir ./models --custom-nodes-dir ./custom_nodes
comfy build status
comfy deploy refs compute          # GPU ids and regions; RTX PRO 6000 sells out
comfy deploy up . --gpu <id> --region <region> --min 0 --max 1 --create --name genobi-swap
```

The `--dry-run` total should be the node pack zip only. For a gated set, fetch
just its gated files first (size-checked, `HF_TOKEN` never logged):
`HF_TOKEN=... python3 comfy-build/scripts/models.py --gated-only ./models comfy-build/models/akuspace.txt`.

A new deployment needs `--region` as well as `--gpu`; take both from
`comfy deploy refs compute`.

Running a workflow: `comfy deploy run --workflow comfy-build/workflows/openjutsu-swap.api.json --deployment <id>
--output-dir out --timeout 1200`. Each run is a new billed job with a fresh
idempotency key, so resubmitting is not a retry. Direct calls go to
`https://<deployment>.run.comfy.app` (`POST /api/v2/jobs`, uploads through
`/api/v2/assets`; [v2 API](https://docs.comfy.org/api-reference/v2/overview));
the request body is capped at 10 MB.

**Cost and limits** ([pricing](https://www.comfy.org/pricing), read 27 October
2026, per second): RTX PRO 6000 (96 GB) $3.49 an hour, H100 $6.23, plus
$0.20 per GB-month for a deployment's staged models (the swap's 46.3 GB is about
$9 a month). Job timeout is 30 minutes on Standard and Creator, an hour on Pro;
two workers and two deployments on the lower plans. The platform may still be a
limited beta for some accounts (`build_not_enabled`).

## One ComfyUI version

| Workflow         | Needs                                                                                 | 0.41.0 (`98cc0bf8`) | 0.42.5 (`483dae43`) |
| ---------------- | ------------------------------------------------------------------------------------- | ------------------- | ------------------- |
| Openjutsu swap   | MiniMax H3, SAM 3.1, Video Slice, attention backend nodes; the pack's ComfyUI imports | Tested by Openjutsu | Present, untested   |
| AKUSPACE         | LTX-2.5 core (Gemma 4 encoder, `LTXVDualCFGGuider`, audio VAE nodes) and two packs    | Present, untested   | CPU-verified        |
| Layout-to-Render | 25 core node types plus three ComfyUI-LTXVideo nodes (`LTXICLoRALoaderModelOnly`, …)  | Present, untested   | Present, untested   |

"Present" means the node ids and the swap pack's `comfy`/`comfy_api` imports
exist in that tree's source (checked 27 October 2026). The two commits differ in
76 files; the MiniMax model change is additive (optional `pdd_steps`, default 1),
and the requirements differ only in the frontend, templates and comfy-kitchen
0.2.37 → 0.2.39. One commit can very likely serve all three. The pins stay on
0.41.0 because it is the only one a swap ran on; move to 0.42.5 after a swap
passes there. ComfyUI-LTXVideo at `220e1d4` defines all three Layout-to-Render
pack nodes (`LTXICLoRALoaderModelOnly`, `LTXAddVideoICLoRAGuide`), including the optional `GemmaAPITextEncode`.

## Sizes

| Set                | Files                                                                                                                 | Size     | Gated                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- |
| `swap`             | H3 int8 transformer, Qwen3-VL nvfp4 encoder, two VAEs, SAM 3.1, two LoRAs                                             | 46.3 GB  | No                     |
| `akuspace`         | LTX-2.5 int8 transformer and Gemma 4 int8 encoder, two VAEs, ×2 upscaler, LoRA                                        | 39.9 GB  | LTX-2.5 (39.7 GB)      |
| `layout-to-render` | LTX-2.5 BF16 transformer and Gemma 4 BF16 encoder, two VAEs, ×2 upscaler, Layout-to-Render and Union Control IC-LoRAs | 73.1 GB  | Six of seven (72.4 GB) |
| All three          | AKUSPACE and Layout-to-Render share only the VAEs and upscaler (2.8 GB)                                               | 156.5 GB |                        |

The supplied Layout-to-Render graph and its model card name the BF16 files; the
int8 ones AKUSPACE uses would share another 36.9 GB but are untested there. The
AKUSPACE LoRA and nodes are public (published with the Koshi node pack), so the
LoRA is a hash-pinned `sourceUri` like the swap's files; only the LTX-2.5 base
weights are gated ([the AKUSPACE image page](akuspace-docker.md)).

## One build or several

Separate deployments per workflow, built from the same pins:

- **Cold start and storage.** A worker stages every weight in its build, and
  staged models bill as storage: 155.8 GB for all three against 46.3 GB for
  the swap.
- **GPU memory.** Each graph alone wants most of a 96 GB card (the swap was only
  tested at 96 GB; Layout-to-Render's BF16 weights are 68 GB). Mixing them on one
  worker means unloading and reloading tens of GB from disk at every switch.
- **Build size and risk.** ComfyUI-LTXVideo brings `openimageio`,
  `colour-science`, `diffusers` and `ninja`; the swap needs none of them.
  A dependency conflict in one pack would block the other workflows' build.
- **Licences and access.** The swap is ungated; the LTX sets need an
  `HF_TOKEN` with accepted licences and an upload from the lab PC.

The pins stay single either way: `prepare-comfy-build.sh` takes the sets a
build carries. For the first deploy, ship the swap alone.
