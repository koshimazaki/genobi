---
tags: [workflows, comfy, backend, models, sound, world-builder]
summary: The three key adaptive-reverb workflows, one remote-model LTX build with two GPU endpoints, local CPU reverb, comfy-cli 1.24 commands and scale-to-zero costs.
---

# Deploy the key LTX and World Builder workflows

One shared deployment, **genobi-ltx-world**, serves two GPU workflow selectors.
The CPU reverb workflow stays local. These are API-format graphs; selecting a
name fills a graph on that shared service. The hosted and local studios can register its
endpoint and run these two GPU workflows from Camera.

| Selector          | Workflow                                 | Runtime                                                    |
| ----------------- | ---------------------------------------- | ---------------------------------------------------------- |
| `layout-to-video` | `world-builder-l2r-a2v.json`             | GPU; World Builder take + track → LTX-2.5 Layout-to-Render |
| `akuspace`        | `ltx-i2v-a2v-akuspace.json`              | GPU; image + track → LTX-2.5 with learned room sound       |
| `cpu-reverb`      | `world-builder-adaptive-reverb-cpu.json` | Local CPU/Mac; scene recipe + track → IR and wet mix       |

The [workflow instructions](https://github.com/koshimazaki/Genobi/blob/main/workflows/README.md#demo-workflows)
and [endpoint manifest](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-world-builder.endpoints.json)
are the catalogue. Layout-to-video's `--preset studio` only changes guide and
mask dimensions; it shares the same endpoint and models.

## Deploy your own endpoint, or test as a team

Use a deployment and Comfy API key from the **same workspace**. The deployment's
workspace pays for its GPU worker time and model storage; a caller's key does
not move that bill to another workspace. Comfy's
[v2 API contract](https://github.com/Comfy-Org/docs/blob/main/openapi-v2.yaml)
checks deployment ownership against the caller's workspace. Someone else's
workspace key is not an access pass to your endpoint.

For a Comfy team evaluation, one deployment in the team's workspace is enough.
Use that workspace's authorized API keys and endpoint in Genobi; each tester
does not need a separate deployment. Check workspace membership and permissions
with the workspace owner rather than distributing the owner's key. Comfy's
[deployment guide and billing FAQ](https://support.comfy.org/articles/2703236295-comfy-api-deploy-your-comfyui-workflow-as-an-api)
describe workspace billing and current plan requirements.

| What the team wants to test                              | Available path                                                                                                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layout-to-video with scene acoustics and reverb          | Register the team's deployment endpoint in Settings on hosted or local Genobi, then connect a key from its workspace. The GPU runs at Comfy either way.                                                                               |
| The same custom workflows entirely on `genobi.pages.dev` | Supported. Hosted Settings saves the endpoint for the session, and the studio stages inputs, quotes and submits. Hosted inputs are capped at 32 MB per file where local allows 150 MB, and nothing runs until the quote is confirmed. |
| A hosted agent paired to a local runner                  | Pairing relays agent prompts and progress; it is not the media path. Results reach the studio through Settings, and paid approvals stay in the studio bubble.                                                                         |

To deploy your own copy, authenticate in your workspace, generate the build spec
below, then follow the [four push/release/deploy commands](#owner-commands-push-release-deploy).
The build fetches the nine model files from pinned remote sources; only the
local custom-node pack is uploaded. Paste the resulting endpoint URL and use
your workspace's key in the local studio. Keep someone else's endpoint for
explicitly arranged access; it is not a free public generation service.

## Use it from Camera

Open hosted or local Genobi and connect your Comfy key. In Settings → Generation setup,
register the deployment's `https://<deployment>.run.comfy.app` URL. Registration
saves the endpoint for this session, not the key, and submits nothing. Camera's
LTX menu labels these workflows **setup required** until an endpoint is registered, then offers **Comfy Deploy · layout-to-video** and **Comfy Deploy ·
akuspace**. Layout-to-video also offers Party and Studio input presets.

Attach the selected graph's files and, for Layout-to-video, its matching capture
recipe. Inputs stage on that endpoint through the SDK. Local ownership tickets
last two hours and expire on server restart; reattach then. The graphs keep their
fixed eight-second, 24 fps geometry. CPU reverb remains a separate local workflow.

### Scene Builder to picture and sound in one job

Layout-to-video already includes CPU reverb: the capture's recipe feeds both
Acoustics (room/prompt information) and Reverb; its colour take guides LTX
Layout-to-Render. The original track conditions both LTX sampler stages with
audio noise mask zero. The final video uses Reverb's wet/dry mix, not generated
AKUSPACE audio. IR and wet audio are saved alongside it. Two sampler stages are
internal to one submitted job, not two generation requests or an audio rerun.

In 3D → Capture, choose **Use Layout-to-video format** (1024 × 576,
193 frames, 24 fps), load your track and capture. **Use take in Layout-to-video**
opens Camera with the frozen capture recipe and scene prompt. **Attach captured
scene** explicitly stages its colour/depth take, first frame and matching WAV
on the registered endpoint. The first frame is the initial look reference;
replace it with your styled still at the same camera angle when needed. If the
scene had no track, attach one in Camera. Review all inputs before Generate.
Manual recipe upload accepts both **Save recipe** JSON and the **Capture receipt**.
Switching away from deployment models while attachment is in progress discards
that attempt's result and keeps the captured scene pending. Switch back and
choose **Attach captured scene** again to stage it for the selected model.

The audio-only `cpu-reverb` graph is optional: redo a soundtrack without paying
to regenerate its picture. A single L2R clip uses one static room IR. A cut
through multiple rooms still needs its room treatments sequenced/crossfaded
(as in the final demo); this graph does not automate time-varying room changes.

Generate requests a quote, then asks for confirmation of paid GPU time, with no
fixed price or cost cap. Only confirmation submits once. The reservation is
saved first; recovery never repeats an uncertain submission. A changed endpoint,
workflow or input invalidates the quote. Polling uses the recorded endpoint even
if Settings changes later. Ready video and companion IR/wet/audio files are
saved under the studio session's ownership and linked from the result card.

The output contract names the final video node and every required audio node.
Cloud, deployment and local polling require those exact node IDs and media kinds;
another video (such as a guide preview) cannot stand in for a missing result.
A completed workflow missing a required companion reports an output error instead
of becoming a partially delivered Ready take. Link-read failures remain retryable
unless the asset has expired; polling never submits another generation.

MCP/CLI generation does not yet expose deployment input staging. Their model
discovery omits these Camera-only entries; use Camera for this route. Director
agent handoffs keep their existing quoted generation tools.

### Whose account pays?

A key alone runs supported Comfy Router and Cloud models. The custom deployment
workflows also need Genobi's build deployed in **your own Comfy workspace**.
Create that deployment using the commands below, paste its endpoint in Settings,
and connect a key authorised for that workspace. **Comfy bills the workspace that
owns the deployment**; using someone else's endpoint with your key does not move
its charges to your account. Genobi has no shared generation key or fallback.

Hosted settings keep only the session's endpoint/preset in D1. Keys remain in page
and request memory and must be re-entered after refresh. Upload receipts bind the
session, endpoint and input role for two hours. Hosted inputs are capped at 32 MB
per file to bound Worker memory; local inputs keep their 150 MB ceiling. The hosted
adapter uses the official low-level SDK upload transport without the optional
client-side WASM dedup hash; Comfy hashes the uploaded bytes on its server.

Hosted settings writes are bounded by caller IP and across the deployment as well
as by session, with 2 KB streamed request bodies and a ceiling of 10,000 settings records,
where a new session displaces the least recently saved one. Choosing Cloud for a new session stores no settings row.
Companion-output receipts are retained until the Ready job and its audio links
have been saved, so a failed final save can recover those links on the next poll.

Registering an endpoint uploads nothing and starts no GPU job. Attaching files is
explicit; Generate obtains a quote and confirmation before one reserved submission.
Comfy may bill storage or warm-worker time separately from a generation. Use
scale-to-zero and review your workspace's deployment settings.

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
checks only: no build, release, deploy or paid generation. The Camera handoff is implemented and checked with mocked provider responses;
this does not verify a live Camera generation or managed Comfy Cloud availability.
[Adaptive reverb](adaptive-reverb.md#how-to-regenerate-a-room) distinguishes the
v5 scene-derived CPU soundtrack from the separate AKUSPACE experiment.
