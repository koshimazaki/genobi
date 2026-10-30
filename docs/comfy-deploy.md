---
tags: [workflows, comfy, backend, models, sound, world-builder]
summary: The three key adaptive-reverb workflows, one remote-model LTX build with two GPU endpoints, local CPU reverb, comfy-cli 1.24 commands and scale-to-zero costs.
---

# Deploy the key LTX and World Builder workflows

One shared deployment, **genobi-ltx-world**, serves two GPU workflow selectors.
The CPU reverb workflow stays local. These are API-format graphs; selecting a
name fills a graph, not a new HTTP service or a registered studio generator.

| Selector          | Workflow                                 | Runtime                                                    |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `layout-to-video` | `world-builder-l2r-a2v.json`             | GPU; World Builder take + track → LTX-2.5 Layout-to-Render |
| `akuspace`        | `ltx-i2v-a2v-akuspace.json`              | GPU; image + track → LTX-2.5 with learned room sound       |
| `cpu-reverb`      | `world-builder-adaptive-reverb-cpu.json` | Local CPU/Mac; scene recipe + track → IR and wet mix       |

The [workflow instructions](https://github.com/koshimazaki/Genobi/blob/main/workflows/README.md#key-adaptive-reverb-workflows)
and [endpoint manifest](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-world-builder.endpoints.json)
are the catalogue. Layout-to-video's `--preset studio` only changes guide and
mask dimensions; it shares the same endpoint and models.

## Exact shared build

`comfy-build/models/ltx-world-key.txt` carries exactly **nine model files,
109.464 GB** (decimal). It combines the BF16 L2R transformer/encoder and int8
AKUSPACE transformer/encoder, shared video/audio VAEs and ×2 upscaler, plus the
L2R and AKUSPACE LoRAs. All models are remote `sourceUri` + SHA-256 + size;
**zero local model uploads**. Eight source URLs/hashes/sizes came from verified
`comfy build refs resolve` results on 30 October 2026. The AKUSPACE LoRA keeps
its existing pinned Hugging Face URL and SHA-256. Resolver URLs using `main`
are byte-pinned by their checksums: changed upstream bytes must fail validation.
The older, broader sets remain separate recipes; do not combine them with this set.

ComfyUI is pinned to `98cc0bf84b7cb1383654c5b402e7612d875d6d22` (0.41.0).
The only custom packs are ComfyUI-LTXVideo (`220e1d45…`, git), Koshi-Nodes
(`6f3351e7…`, git; used in both graphs), and `director_world_builder` from
this checkout (`source: local`). Only that local node pack is zipped/uploaded.
Its Python changes include the 2 GiB Capture cap and bounded Inputs preview
downscale. The saved-take API graphs require no browser frontend build.

## Generate and check offline

From the repo root, with Python 3.10+:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 comfy-build/scripts/comfy_build_spec.py --name genobi-ltx-world --sets ltx-world-key --check-workflows > ./comfy-build.yaml
python3 -B -I -m unittest discover -s comfy-build/tests -v
```

The generated root YAML is local operator state, excluded from the proposed
commit. Keep the push-written build id/revision for subsequent commands;
regenerating over it would discard its remote-state tracking. Tests verify
exact model coverage, graph links, the studio-only input differences, both
samplers' audio wiring, native integer seed bounds, and no local models.
These checks neither build nor deploy nor run GPU inference.

## Owner commands: push, release, deploy

Syntax checked against the installed **comfy-cli 1.24.0** source
([build commands](https://github.com/Comfy-Org/comfy-cli/blob/v1.24.0/comfy_cli/command/build.py),
[deploy commands](https://github.com/Comfy-Org/comfy-cli/blob/v1.24.0/comfy_cli/command/deploy.py)).
The [platform guide](https://docs.comfy.org/development/serverless/overview)
explains releases and deployments. Authenticate using the CLI's private store
or environment. The commands below are owner-run steps, not evidence they ran.

With the root spec generated, no local weights or prepared ComfyUI checkout
are needed. From the repo root:

```sh
comfy build push --custom-nodes-dir ./custom_nodes
comfy build release create --target linux/nvidia --watch
comfy deploy refs compute
comfy deploy up . --gpu <id> --region <r> --min 0 --max 1 --create --name genobi-ltx-world
```

Stop after push if it reports model-link warnings; resolve them before
`release create`. Choose the GPU id and region from `refs compute`; start with a 96 GB RTX PRO
6000 to match the recorded successful GPU session. The remote model fetches
still need to succeed under the platform's access rules and model licences.
Verified resolver results are not proof of a completed remote build; a fetch
failure is a release blocker, not permission to silently upload local weights.

**FFmpeg and FFprobe must exist on the worker's PATH for WebM Capture.**
The YAML generator does not install OS packages. Check the release worker's
binaries before accepting it for Layout-to-video. CPU-only local reverb does
not decode a take and has no Capture dependency.

## Owner commands: materialize and run

Prepare a values JSON containing exactly the tokens in the chosen workflow's
README. The helper never submits a job:

```sh
python3 workflows/materialize-ltx.py --endpoint layout-to-video --values /tmp/layout-values.json --output /tmp/layout.api.json
python3 workflows/materialize-ltx.py --endpoint akuspace --values /tmp/akuspace-values.json --output /tmp/akuspace.api.json
```

Put your named inputs in `./input/`. Use the actual deployment id returned by
`deploy up`. Each `run` below is a new billed generation; run only when ready:

```sh
comfy deploy run . --workflow /tmp/layout.api.json --deployment <deployment-id> --asset-root ./input --output-dir /tmp/layout-results --timeout 1800
comfy deploy run . --workflow /tmp/akuspace.api.json --deployment <deployment-id> --asset-root ./input --output-dir /tmp/akuspace-results --timeout 1800
```

Check that the asset upload list includes the Capture colour/depth files as
well as LoadImage and LoadAudio. Resolution of custom-node filename strings
remains unverified on the platform; if missing, stage them with the platform's
asset API and verify the resolved names before submitting. An uncertain paid
submission must be recovered by its existing job id, never automatically retried.
Listen against the dry track: AKUSPACE mask 0.5 changes the music. Inspect
reference/take alignment and late party colour artefacts before accepting a cut.

For CPU reverb, use the
[local template and builder](https://github.com/koshimazaki/Genobi/blob/main/workflows/world-builder-adaptive-reverb-cpu.README.md)
on a local ComfyUI with this repo's node pack. It needs no GPU deployment.
The [whole-track helper](https://github.com/koshimazaki/Genobi/blob/main/workflows/room-reverb.README.md)
levels and crossfades exported scene IRs.

## Costs and scale to zero

[Comfy API pricing](https://www.comfy.org/pricing), checked 30 October 2026:
RTX PRO 6000 96 GB **$3.49/hour**, H100 80 GB **$6.23/hour**; network model
storage **$0.20/GB-month**. For this set, storage is about **$21.89/month**;
12.5 minutes of RTX PRO 6000 compute is about **$0.73**, before startup/other
billable worker time. Recheck availability and the account's rates before use.

`--min 0 --max 1` requests scale to zero with at most one worker. Confirm the
worker count returns to zero after jobs; it does not eliminate persistent
model storage. The platform guide says storage starts at deployment and
continues while paused. Builds/releases without deployments are stored free.
To pause compute, use `comfy deploy stop --deployment <deployment-id>` and
verify status. Removing storage requires removing the relevant deployment;
check the account state before deletion. Standard/Creator jobs have a
30-minute ceiling, Pro one hour; account limits and beta access still apply.

## Evidence and limits

The two GPU families ran on a rented 96 GB GPU, not on the Developer Platform.
The local CPU template ran in seconds on a Mac. This port performs offline
checks only: no build, release, deploy or paid generation. There is no new
studio handoff, live endpoint, or managed Comfy Cloud availability claim.
[Adaptive reverb](adaptive-reverb.md#how-to-regenerate-a-room) distinguishes the
v5 scene-derived CPU soundtrack from the separate AKUSPACE experiment.
