# Workflows

Start with the app workflows below, or the three [demo workflow paths](#demo-workflows)
for World Builder picture and sound. This folder also holds base graphs,
ComfyUI editor examples and experiments; a JSON file is not proof that an app
route or GPU deployment runs it.

App registration lives in `shared/comfy/workflows.ts`. A running studio's
`GET /api/settings/workflows` lists what that host exposes to the current session.
The hosted catalogue is fixed; local choices depend on setup. Registration does
not establish a successful live generation. See [run location](../docs/run-location.md).

## App workflows

These API-format graphs have registered studio routes. The H3 variants are
generated from `minimax-h3-omniref.json` by `shared/comfy/h3.ts`; retain that
base graph as well as the four exported variants.

| Family                        | Files                                                                                               | Availability and evidence                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MiniMax H3                    | `minimax-h3-rgb.json`, `minimax-h3-canny.json`, `minimax-h3-depth.json`, `minimax-h3-combined.json` | Hosted and local catalogue. RGB/Canny/depth have recorded standalone Cloud runs; Combined is an untested preset. [Inputs and limits](minimax-h3-omniref.README.md).  |
| LTX-2.5                       | `ltx-2-5-t2v.json`, `ltx-2-5-akuspace-t2v.json`                                                     | Hosted and local catalogue: plain video and Acoustic Space. [Requirements](ltx-2-5-akuspace-t2v.README.md).                                                          |
| FLUX Klein                    | `flux-3-klein-t2i.json`                                                                             | Hosted and local catalogue. [Image workflow](flux-3-klein-t2i.README.md).                                                                                            |
| SeedVR2                       | `seedvr2-upscale.json`                                                                              | Hosted and local catalogue. [Upscale workflow](seedvr2-upscale.README.md).                                                                                           |
| MiniMax Music 3               | `minimax-music-3.json`                                                                              | Local studio only. [Music workflow](minimax-music-3.README.md).                                                                                                      |
| Openjutsu swap                | `openjutsu-swap.json`                                                                               | Local studio, with its own configured deployment. [Swap workflow](openjutsu-swap.README.md).                                                                         |
| World Builder Layout-to-video | `world-builder-l2r-a2v.json`, `world-builder-l2r-a2v-studio.json`                                   | Local Camera after deployment registration. Party and Studio are two presets of one combined video/reverb workflow. [Requirements](world-builder-l2r-a2v.README.md). |
| AKUSPACE image + track        | `ltx-i2v-a2v-akuspace.json`                                                                         | Local Camera after deployment registration. Separate learned-audio experiment. [Requirements](ltx-i2v-a2v-akuspace.README.md).                                       |

The first four rows comprise eight hosted templates. Local studio adds Music
and Openjutsu; registering the LTX deployment adds three templates behind two
Camera entries. The hosted Worker does not stage or run the deployment entries.
Model APIs such as FLUX video through BFL/Router are separate routes, not JSON
workflow files in this folder.

### How the app runs a graph

`shared/comfy/slots.ts` fills named slots; each template declares its nodes,
model slots, output and allowed hosts. Comfy Cloud uses the official SDK
(`server/comfy-sdk.ts`); local ComfyUI uses its own HTTP API
(`server/comfy-local.ts`); registered deployment graphs use their bound endpoint.
Paid generation requires a quote and explicit confirmation, then a durable
reservation before one submission. Never automatically retry an uncertain run.

## Demo workflows

The compact set used for the final adaptive-reverb v5 work, plus its separate
AKUSPACE experiment. [Recorded evidence and how to repeat it](../docs/adaptive-reverb.md).

| Selector          | Workflow and instructions                                                                                                    | Role                                                                                                                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout-to-video` | [World Builder L2R + track](world-builder-l2r-a2v.README.md), with a [Studio preset](world-builder-l2r-a2v-studio.README.md) | One job: the same scene supplies layout guidance and acoustics; LTX renders the video and CPU reverb processes the original track; the saved video uses that wet mix.                                         |
| `cpu-reverb`      | [Adaptive reverb on CPU](world-builder-adaptive-reverb-cpu.README.md)                                                        | Audio-only scene recipe + track → room IR and wet mix. Useful for redoing sound without regenerating video; not a required second pass of Layout-to-video. Local CPU/Mac, outside the app workflow catalogue. |
| `akuspace`        | [Image + track + AKUSPACE](ltx-i2v-a2v-akuspace.README.md)                                                                   | Separate learned small-room audio experiment. It changes the music; it did not supply the final CPU soundtrack.                                                                                               |

One shared [Developer Platform deployment recipe](../docs/comfy-deploy.md)
covers the two GPU selectors with the exact `ltx-world-key` model set. CPU
reverb also runs inside the combined Layout-to-video graph; the audio-only
selector needs no GPU. The [manifest](ltx-world-builder.endpoints.json) maps the
three selectors; it is not a fourth graph. [room-reverb.sh](room-reverb.README.md)
levels and crossfades exported IRs across a multi-room edit's continuous track.

In the local studio, use 3D → Capture → **Layout-to-video capture preset**, then
capture and choose **Use take in Layout-to-video**. Camera keeps the captured
files in this tab until **Attach captured scene** stages them on the registered
endpoint. Check the look reference, track and prompt before Generate. Generation
starts only after the separate quote confirmation.

### Fill a demo workflow offline

Create a JSON object keyed by token name without the surrounding `__`.
Use exactly the tokens in that workflow's README. `RECIPE_JSON` is a JSON
string, seeds are JSON integers, and media names are relative to ComfyUI `input/`.

```sh
python3 workflows/materialize-ltx.py --endpoint layout-to-video --values values.json --output /tmp/layout.api.json
```

Add `--preset studio`, or choose `--endpoint akuspace` or `--endpoint cpu-reverb`.
The helper writes a new file exclusively, refuses missing/unknown tokens and
invalid seeds/paths, and never submits. The CPU
[recipe builder](world-builder-adaptive-reverb-cpu.README.md) also accepts a
recipe file or capture receipt directly.

## Manual ComfyUI examples

These remain useful examples, but are not registered studio generation routes.
Their editor layout is separate from the API templates above.

| File                                                                            | Purpose                                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [world-builder-akuspace-ltx.json](world-builder-akuspace-ltx.README.md)         | ComfyUI editor graph: Capture → acoustics → AKUSPACE LTX, with a separate CPU-reverb branch. |
| [world-builder-layout-to-render.json](world-builder-layout-to-render.README.md) | ComfyUI editor graph for layout guidance.                                                    |
| [world-builder-canny-depth.json](world-builder-canny-depth.README.md)           | ComfyUI editor graph for Union Control canny/depth guidance.                                 |
| [world-builder-acoustics.api.json](world-builder-acoustics.api.README.md)       | Acoustics API example, also used by the [Falling room](../docs/falling-room.md).             |

`node scripts/check-ui-workflows.mjs --object-info <ComfyUI URL> <file>` checks
an editor graph against a running ComfyUI without queueing it. Keep these paths
stable: docs, examples and tests refer to them.

## Experimental graphs

[Gen-Mod audio/control](genmod.README.md) (`ltx-2-5-genmod-audio.json` and
`ltx-2-5-genmod-control.json`) are not registered app routes and have not been
run. They remain inputs to `shared/comfy/genmod.ts` and its tests. H3 Combined
is exposed as a test preset, but has no paid smoke-run evidence. Treat neither
as a proven production path.

## Adding a workflow

Add an API graph and README, its slots/values in `shared/comfy/`, then register
it in `workflowTemplates` with a capability and host restrictions. Tests must
check links, loaders, slot completeness and the quote/submission boundary for
each adapter that runs it. Document the difference between structural checks,
mocked app integration and a real paid result.
