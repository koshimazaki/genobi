---
tags: [workflows, comfy, backend, models, sound, world-builder]
summary: Offline recipe and endpoint catalogue for the worked LTX and World Builder workflows, with owner-run build, linux/nvidia release and shared deployment steps, costs and remaining platform checks.
---

# Deploy the worked LTX / World Builder workflows

The 30 October 2026 GPU session proved the graph families, on a rented RTX PRO
6000 (96 GB), ComfyUI 0.41.0. It did not prove a Comfy Developer Platform build
or deployment. The owner starts the paid build, release, deployment and test
jobs. This change performs offline preparation and checks only.

The [workflow catalogue](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-world-builder.README.md)
and [endpoint manifest](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-world-builder.endpoints.json)
keep every successful variant. Each graph has its own input/result README.
The [existing deployment reference](comfy-deployment.md) explains the pinned
comfy-cli v1.23.0 syntax used below. No new CLI or pricing lookup was made.

## One shared deployment

Build `genobi-ltx-world` with sets **world-builder-l2r** and **ltx-i2v**.
It carries exactly nine model files, 109.464 GB in decimal units, with three
shared VAE/upscaler files deduplicated. Of these, 109.301 GB are gated and
must be present locally for upload; the AKUSPACE LoRA is public and hash-pinned.
No Klein, Union Control, SeedVR2, swap weights or Gemma e2b enhancer is included.
A reference is an owner-supplied still, made outside these endpoints.

Sources are pinned in `comfy-build/sources.lock`: ComfyUI `98cc0bf…`,
ComfyUI-LTXVideo `220e1d4…`, Koshi-Nodes `6f3351e…`, and this repository's
World Builder pack at `9f6d2eb…` plus `patches/world_builder.patch`. That
patch carries the box's 2 GiB Capture cap and Inputs preview downscale;
the same changes are in the current node source. The subfolder pack is
uploaded as `source: local`; the other packs use their pinned Git refs.
The graph's Storyboard fix is 448 × 256, already set in every L2R template.

The table's endpoint names select workflows on **one** deployment. They are
catalogue names, not additional HTTP services: materialize by `--endpoint`,
then submit the resulting graph through `comfy deploy run`. The manifest is
the complete mapping, including earlier party/studio and two text/narration
candidates per brief.

| Endpoint                                         | Workflow file                       | Room / role                                        |
| ------------------------------------------------ | ----------------------------------- | -------------------------------------------------- |
| `dive`                                           | `world-builder-l2r-dive.json`       | Empty dive between towers                          |
| `cathedral`                                      | `world-builder-l2r-cathedral.json`  | L2R cathedral, reference at take angle             |
| `party`                                          | `world-builder-l2r-a2v.json`        | L2R + track + CPU Reverb; medium_room geometry     |
| `studio`                                         | `world-builder-l2r-a2v-studio.json` | L2R + track + CPU Reverb; small_room geometry      |
| `medium_room`                                    | `ltx-i2v-dive-medium-room.json`     | Empty big-room dive, scene IR applied separately   |
| `small_room`                                     | `ltx-i2v-dive-small-room.json`      | Empty small-room dive, scene IR applied separately |
| `cathedral_i2v`                                  | `ltx-i2v-dive-cathedral.json`       | Empty cathedral dive                               |
| `studio_cpu`                                     | `ltx-i2v-a2v.json`                  | Track latent mask 0; external CPU room treatment   |
| `studio_akuspace`                                | `ltx-i2v-a2v-akuspace.json`         | Track latent mask 0.5; learned small-room audio    |
| `chain_cathedral`, `chain_party`, `chain_studio` | `ltx-i2v-chain-*.json`              | Previous last frame → next stage                   |

Room names do not rewrite a recipe or switch a model preset. L2R reads the
uploaded recipe's geometry; the i2v dives have `space_mode Off` and generate
audio, so their room reverb is an external IR step. Party maps to medium_room,
studio to small_room; neither is a new AKUSPACE trained preset. Only the
AKUSPACE endpoint actively sets Room / small_room / Heavy / high.

## Offline preparation and validation

No `comfy build validate` command is assumed; it is unavailable in the target
CLI. These checks generate a spec and exercise the repo's validator without
fetching sources, weights, schemas or GPU compute:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 comfy-build/scripts/comfy_build_spec.py --name genobi-ltx-world --sets world-builder-l2r ltx-i2v --check-workflows > /tmp/genobi-comfy-build.yaml
PYTHONDONTWRITEBYTECODE=1 python3 -I comfy-build/tests/test_comfy_spec.py
PYTHONDONTWRITEBYTECODE=1 python3 -I comfy-build/tests/test_ltx_workflows.py
```

The validator checks graph links, exact model coverage, the absence of the
enhancer branch, and Storyboard cells. Tests cover template filling and
cross-stage audio wiring. This does not verify the platform's build schema,
runtime node imports, FFmpeg availability or uploaded media resolution.

## Owner: build → linux/nvidia release → deploy

The commands below use the recipe's existing CLI syntax and deliberately
remain unexecuted. Confirm the installed CLI's `comfy build --help` and
`comfy deploy --help` before spending; don't substitute an unavailable validate
command. First accept LTX-2.5 and Layout-to-Render model licences with the
Hugging Face account used to download gated files. Keep authentication in the
environment or CLI's private store, never in this repository.

From the repository root, with enough model disk space:

```sh
sh comfy-build/scripts/prepare-comfy-build.sh ./comfy-work world-builder-l2r ltx-i2v
HF_TOKEN="$HF_TOKEN" python3 comfy-build/scripts/models.py --gated-only ./comfy-work/ComfyUI/models comfy-build/models/world-builder-l2r.txt comfy-build/models/ltx-i2v.txt
```

Preparation fetches source code and applies the World Builder patch; it does
not build or deploy. It writes the default combined-set name in the spec;
regenerate it with the shared deployment's chosen name, then authenticate:

```sh
python3 comfy-build/scripts/comfy_build_spec.py --name genobi-ltx-world --sets world-builder-l2r ltx-i2v --check-workflows > ./comfy-work/ComfyUI/comfy-build.yaml
comfy setup --where cloud
cd comfy-work/ComfyUI
comfy build refs resolve akuspace-ltx25-v0.5.safetensors
comfy build push --dry-run --models-dir ./models --custom-nodes-dir ./custom_nodes
comfy build push --release --target linux/nvidia --models-dir ./models --custom-nodes-dir ./custom_nodes
comfy build status
comfy deploy refs compute
comfy deploy up . --gpu <GPU_ID> --region <REGION> --min 0 --max 1 --create --name genobi-ltx-world
```

Replace GPU_ID and REGION from `refs compute`; start with an RTX PRO 6000
96 GB, matching the successful box. Review the dry-run upload list: eight
gated weights plus the patched World Builder pack, with the public LoRA as
a source URI. Do not upload input media or credentials in the build. The
release target is **linux/nvidia**. A new deployment needs both GPU and region.

The generated spec follows the existing recipe; the platform installs core
and each node pack's requirements and owns torch. Before accepting the build,
verify that the worker provides **FFmpeg and FFprobe** on PATH. The rented box
installed them as OS packages; this YAML generator does not provision OS
packages. Missing binaries or unsupported NVIDIA architecture are release
blockers for WebM Capture. No browser or World Builder frontend bundle is
needed to run the captured-take API graphs.

## Owner: one test generation per endpoint

First fill a template with the [offline materializer](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-world-builder.README.md#fill-a-template).
Put all its named media in the prepared ComfyUI `input/` directory. For example,
from `comfy-work/ComfyUI`, with the filled graph copied there as `party.api.json`:

```sh
comfy deploy run . --workflow party.api.json --deployment <DEPLOYMENT_ID> --asset-root ./input --output-dir ./results --timeout 1800
```

Use the actual deployment id returned by the owner-run deployment. Inspect
the CLI's upload list before approving a run: it must include the filenames
inside `DirectorSceneCapture`, LoadImage and LoadAudio. Platform resolution
of custom-node string filenames into `input/` remains unverified; if the CLI
does not discover them, stage assets explicitly using the installed CLI/API
and verify the resolved names before submitting. Do not treat a missing asset
as a reason to retry a paid request. There is no automatic endpoint rollout
or automatic retry in this repository.

Check every manifest endpoint, including earlier candidates: model loads,
uploaded take/recipe alignment, the video, audio and IR outputs, room sound,
and peak VRAM/time. Party needs 1280 × 704 sampling followed by ×2 upscale;
the earlier successful example used 87 GB and 12.5 minutes. Freeze/cylinder
artefacts remain possible. Listen against the dry original. An AKUSPACE test
must explicitly accept that audio mask 0.5 changes the music. L2R + AKUSPACE
and cathedral a2v are still untried combinations, not additional endpoints.

## Costs, scale to zero and stopping

The [deployment reference](comfy-deployment.md) records 27 October 2026 rates:
RTX PRO 6000 **$3.49/hour**, H100 **$6.23/hour**, staged-model storage
**$0.20/GB-month**. At those recorded rates, this shared model set is roughly
**$21.89/month** of model storage; 12.5 minutes of RTX PRO 6000 execution alone
is about **$0.73**. These are dated planning numbers, not a live quote;
build charges, startup time, storage policy and current account limits must
be checked by the owner before starting the paid build or deploy.

`--min 0 --max 1` requests scale to zero with at most one worker. It avoids
keeping a warm minimum worker but does not delete model storage or guarantee
zero cost immediately after a job. Confirm the live worker count reaches
zero after the endpoint smoke tests. To stop service, disable or remove the
deployment in the account's deployment controls, and confirm no workers or
queued jobs remain; remove its staged models/builds separately if storage is
no longer wanted. Consult the installed `comfy deploy --help` for the actual
stop/removal command rather than assuming a `stop` or `down` verb. The older
reference records 30-minute lower-plan job limits and account-specific beta
access; verify both for this release.
