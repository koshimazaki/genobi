---
tags: [setup, studio, comfy]
summary: Choose hosted or local Genobi, connect providers, set up an agent and optional voice, and keep your first project.
---

# Get started with Genobi

You can try the public gallery and edit existing media without generating
anything. Model generation is a separate step: cloud providers need your key
and credits; local generation needs a compatible ComfyUI installation and
the selected models. Running the studio locally does not require a local GPU
when generation uses a cloud provider.

## Choose how to run

| Setup                                     | What you need                                                                    | What it provides                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [Hosted studio](https://genobi.pages.dev) | A browser; your Comfy or BFL key for supported generation                        | Gallery, browser editing, export and supported cloud routes                      |
| Local studio + cloud generation           | Node.js 22+, a provider key and credits                                          | The studio plus local agent, voice and project integrations; models run remotely |
| Local studio + local ComfyUI              | Node.js 22+, ComfyUI, required nodes and downloaded weights on suitable hardware | Supported open-weight workflows on your own machine                              |

The hosted site does not run local voice transcription, the local Arena or
Music 3. Hosted agent use requires pairing a separately running local runner;
it does not install or host a harness. See [runner pairing](runner-pairing.md)
and [run location](run-location.md). **Start Genobi** offers the pairing
controls directly when a local runner is not connected. The local studio must
remain running; Cloudflare cannot launch a process on your machine.

## Make your first edit

1. Open a mix template from the Gallery, such as the Genobi teaser or Dimensions
   mix. Choose an editable version where the card offers one.
2. Choose **Take it to the editor**. On a public watch page, **Make your own**
   and **Open** also load that template in Editor. Change a title, move or trim
   a clip, then preview the result.
3. Export an MP4 to share and an editable project ZIP to keep working later.

Editing bundled media needs no model key. Generation templates may require
models or credits; check the selected route before generating. Browser drafts
are not a durable backup: save the editable bundle before closing or reloading.

## Connect generation

Comfy Cloud and the BFL API are the primary hosted generation choices. Comfy
Router handles supported model API calls; the official Comfy SDK handles
workflow jobs on Cloud or configured Comfy Developer Platform deployments.
These are separate routes, even when they use one Comfy key.

In Camera, choose the model and its run location, connect the appropriate
key in Settings, and inspect the displayed estimate before Generate. Agent
operations that cost money need an approved quote. A failed or uncertain
submission never authorizes an automatic second paid run.

On the hosted site keys stay in page/request memory and disappear on reload.
Keep the tab open until a generated result is saved. Download results you
want to keep; hosted media has retention limits. Local key handling is
described below.

If a model refuses a run, use [troubleshooting](troubleshooting.md) and that
workflow's setup notes before trying again.

## Run locally

For supervised creative work alongside repairs, install the separate
[Hermes Creative and Hermes Developer profiles](hermes-profiles.md).
Their role instructions and skills live in the repository and can be updated
from Hermes after review.

Requires Node 22+. Optional: `ffmpeg` and `ffprobe` on `PATH` (or `FFMPEG_PATH` / `FFPROBE_PATH`) for the local media tools — trim, frames, join and crossfade; everything else runs without them. Voice mode also needs a local Qwen3-ASR worker; see [voice mode](voice-mode.md).

```sh
git clone https://github.com/koshimazaki/genobi.git
cd genobi
npm ci
npm run dev     # http://127.0.0.1:4317
```

First run, with one Comfy key:

1. On a Mac, open http://127.0.0.1:4317 and paste your Comfy key (`comfyui-…`)
   into the key dialogue; it goes into your login Keychain. On Linux or Windows,
   set `COMFY_API_KEY` in the environment before starting the server.
2. Optional, free: `node scripts/check-router.mjs` reads Router's catalogue
   with that key and checks catalogue access, including `not_enabled` refusals.
   It never generates; submission access stays unverified until a paid run.
3. Pick a template in the gallery, or write a prompt in Camera. The composer
   shows a run's estimated cost beside Generate before you press it. A chain
   (draft, review, upscale) waits for your approval before each paid stage, and
   an agent's run waits for your Approve.

A Comfy key covers the supported Comfy routes: partner and hosted models through Comfy Router, open workflows through Comfy Cloud. On a Mac, enter it in the connection dialogue and the local server saves it in your login Keychain (service `Genobi`); the page never sees it again, only that it is connected. A BFL key is optional: when connected it takes over the FLUX API models it can run and the upscale (see **Studio settings** below), and it is the only way to run FLUX 3 Image Klein's API; LTX and Comfy Cloud workflows stay on the Comfy key. `COMFY_API_KEY` and `BFL_API_KEY` in the server environment still work and take precedence; without a Keychain (Linux, Windows) they are how the server keeps a key. A key from the environment is treated as the studio's demo key and held to the demo budget (three runs a session, $5 a day); a key you save in the Keychain spends your own credits and is not. Your agent signs in through its own setup (Claude Code's `/login`, Hermes's `hermes model`); Genobi stores no agent key and only shows whether one is found. No Cloudflare account is needed locally, and the local server binds to loopback only, including `npm run dev`'s hot-reload socket on the next port (`server/dev-server.ts`). `npm test` and `npm run build` are the other two commands worth knowing.

## Studio settings

The key icon opens a wide settings panel. **Studio setup** chooses Local ComfyUI,
Comfy Cloud or Both; Both combines local open workflows with cloud API models,
without automatic cloud fallback. Running the Genobi client locally is independent
of using cloud models. The hosted client keeps Comfy Cloud for workflows.
The model menu's **Local** tick, beside Open only, sets the same choice (ticked
is Both), and tags under the selected model say where the next run goes
("Open weights · Local ComfyUI", "API · Comfy Router"); see [run location](run-location.md).

**BFL key** is a separate section: a connected BFL key overrides compatible FLUX
API models and upscales; Comfy-only models keep Comfy. Remove the saved BFL key to
return compatible models to Comfy. Hosted visits keep one key in page memory at a
time. Agents/hosted pairing and Activity/display each expand separately. Ninja’s
gear beside its preset controls only the layout.

## Settings and activity

Open **Settings** from the header for provider connections, workflow location,
agent setup guidance, optional tool history and bubble behavior. Both optional
logging/display checkboxes start off. Closing the Genobi bubble never stops a
run. Activity records identify tool outcomes and actual backends where known;
job receipts and replay protection remain independent. See
[settings and activity](activity-settings.md) for coverage and privacy.

Setup ends by starting the configured local agent as one Genobi session, after
voice connects when it was ticked; its brief does not install software or
authorize generation. Hermes authenticates outside Genobi. Hosted Settings can
[pair an existing local runner](runner-pairing.md), start a typed session and
show its progress in the bubble. The [Openjutsu character swap](openjutsu-swap.md)
runs on its own Comfy deployment with the Comfy key, its first frame made by a
FLUX 3 Image Klein box edit.

## Guided setup and licence preferences

Set global model and execution defaults at `/taste#setup`: FLUX/LTX or no
preference, open weights or any models, local/cloud, and preferred agent host.
New agent sessions receive them alongside the separate intended-use/licence
choices. Explicit session instructions can override them. The host choice does
not install or switch agents; cloud use still needs the existing paid approval.

On first use, Genobi welcomes you with an optional guided setup: creative models,
agent (Hermes/open models, Claude Code or external Codex), local/cloud generation,
and one licensing question (commercial use or research only; the agent picks
models whose licences fit), then **Connect**: on the local studio, your Comfy key and the
optional BFL key (saved in the Keychain), whether Claude Code, Hermes
and Codex are installed and signed in, and a **Sign in** button that opens the
harness's own login in Terminal. Hermes' model is a list of open models,
DeepSeek V4.1 Flash on Nous prefilled, and Genobi sets up Hermes' `genobi`
profile itself (**Set up Hermes**), with no script and no restart. Continuing saves the chosen agent on the server
(`.local/agent.json`, see [agent sessions](agent-setup.md));
`GENOBI_AGENT_RUNNER` still wins. The summary's **Save & set up** (or **Save &
start Genobi**) saves, installs voice when ticked (using a verified
Qwen3-ASR already on the machine instead of downloading it), then starts that
agent in the Genobi bubble; when it cannot start, the summary says why and offers **Sign
in** instead ([voice setup](voice-setup.md#setup-ends-by-starting-the-agent)).
Choose **Explore first** to skip setup. Reopen
**Set up Genobi** from the Genobi activity bubble. Other choices save only at the
final step; revisiting
setup keeps existing family and licence preferences. The animated Genobi mark
and transitions respect reduced motion. Share pages and scene embeds do not
show onboarding.

Setup also offers optional local voice. **Set up local voice** opens the existing
installer on the local server; it shows the model, download size and folder before
installation. You can continue with typed prompts or expand the GitHub clone
instructions. Runner pairing relays agent prompts; microphone transcription still
uses the local studio. No microphone or download starts from visiting setup.
Voice selection survives Back and is saved with setup; leaving it unchecked keeps
text and external-harness workflows available. It is an intent, not installation
status. Voice setup checks time out after 20 seconds and offer **Retry setup check**;
retrying that check never starts a download.

Director's finished-video card includes recorded models/libraries, unresolved
licence checks and a downloadable README. **Edit in Editor** continues the same
project. Missing provenance is shown as needing review, never as legal clearance.

## Next steps

- [Studio guide](studio-guide.md): image controls, timelines, workspaces and Taste.
- [Agent setup](agent-setup.md) and [local voice setup](voice-setup.md).
- [Local ComfyUI and workflow selection](run-location.md).
- [Licences](https://github.com/koshimazaki/genobi/blob/main/LICENCES.md): model, software and asset terms.
- [Cloudflare hosting](cloudflare.md): deploy your own instance after configuring its resources.
