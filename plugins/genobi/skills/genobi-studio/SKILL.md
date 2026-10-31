---
name: genobi-studio
description: Start here to use the local Genobi video studio through its MCP tools - check the studio, see every tool, follow the paying rules for generation behind a quote the person accepts, and pick the skill for the job (genobi-director for a cut, genobi-camera for a shot).
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director) and Node 22 or later.
metadata:
  version: "0.2.0"
  phase: "1 - quoted generation"
  tags: "agents, mcp, backend"
  docs: "docs/agent-sessions.md, docs/agent-approvals.md, plugins/genobi/README.md"
---

# Genobi studio

Genobi is a local video studio: Camera, Director timeline, 3D, Dual Swords
frame editor and Ninja panels, over Comfy Router (LTX 2.5, FLUX 3), Comfy
Cloud workflows, registered Comfy deployments and a local ComfyUI. This plugin's MCP server is a thin
client of the studio running on this machine. It holds no keys.

## Terminal alternative

When using a terminal instead of MCP, load `genobi-cli`. Run `genobi tools` and
`genobi schema COMMAND`; commands dispatch through the same tool definitions.
Use named profiles for stable ownership across calls and load task skills with
`genobi skill`. Shared project context and Taste work in either transport.

## Intended use and credits

Before selecting libraries, models or input assets, load `genobi-licensing`
with `genobi_skill`. Use the prompt's intent and studio context `usage`; ask
only if missing. Check the planned inventory, then record the actual run's
licences and creator credits beside the output. Unknown rights are not a pass.
Read context `selection` as global model/execution defaults. Pass it to
`genobi_models` with `status: "ready"`; explicit session instructions may
override it. The licensing skill also describes first setup and the independent
choices of weights, local/cloud execution and agent host. Do not repeat setup
questions when choices are already supplied.

## Before anything else

Call `genobi_status`. If it says Genobi is not running, ask the person to run
`npm run dev` in the camera-director folder; do not start servers yourself
unless they ask.

Read its `capabilities` for the running adapter's supported operations, limits
and status routes. This differs from the offline capability catalogue; support
alone does not prove local models or credentials are configured. An older server
may omit this field. MCP and CLI are intentionally local stdio/loopback adapters;
hosted REST routes do not make a remote MCP connection available.

## Which skill

Load skills as the task needs them, not all at once: `genobi_skill {}` lists
them with a one-line description each, and `genobi_skill {"name": "genobi-director"}`
returns one skill's instructions. Before you act, load the ones the request
needs; load more as the job reaches them.

To find the tools and skills for a topic, search the registry:
`genobi_registry {"tag": "sound"}` returns every tool and skill tagged
`sound`, with its docs, whether a tool is read-only or paid, and which skill
teaches it; `genobi_registry {"text": "beat grid"}` searches names and
descriptions, and `genobi_registry {}` lists the tags.

For how something works, read the project wiki (`docs/`) rather than guessing:
`genobi_docs {"tag": "storyboard"}` or `genobi_docs {"text": "run location"}`
returns matching pages with a one-line summary each, and
`genobi_docs {"page": "scrolls.md"}` returns one page's Markdown.
`genobi_docs {}` lists the wiki tags. It works when the plugin runs from a
clone of camera-director, and never pays.

| Skill                                              | For                                                                              |
| -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `genobi-director`                                  | The main surface: a whole job in the person's Director project, any tools        |
| `genobi-camera`                                    | One shot: a workflow card per model, with its prompt and camera wording          |
| `genobi-upscale`                                   | Upscale a clip: one run up to 20 s, or a longer one in parts behind one approval |
| `genobi-akuspace`                                  | Acoustic Space on an LTX-2.5 shot: where the sound is heard, and where it runs   |
| `genobi-scrolls`                                   | A character sheet or storyboard before the video, timed to a song                |
| `product-video`, `character-piece`, `audio-visual` | A house template, step by step                                                   |
| `genobi-hermes`                                    | The open route on Hermes, the Klein box edit and the two-pass run                |
| `anime-teaser`                                     | The anime teaser run card: four quoted shots, then the cut in the Director       |
| `genobi-teaser-run`                                | Recreate the Genobi teaser from its brief and prove it: verifier, repeat run     |
| `genobi-machine`                                   | Which models run on this machine and which on Comfy Cloud, and why               |
| `genobi-swords`                                    | Dual Swords: probe, pull frames, trim, join and crossfade with ffmpeg            |

Load `genobi-3d` to prepare a scene document and its room acoustics; the person
loads it into the 3D tab for rendering. `genobi-swords` pulls
frames, slices and recomposes clips; re-running a generation from a frame and
Dual Swords timeline commands are not available yet.

Start with `genobi-director` when the person has a project open; it calls the
others. A request to change the studio itself (its UI, a tool, a skill, a
workflow, a node) is not yours to edit or to send back to the person: load
`genobi-develop` and start a Developer with `genobi_develop`. Every template and run ends with `genobi_provenance`.

Routing examples, from request to the skills to load:

| The person asks                                                                              | Load                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Extract two frames from this clip"                                                          | `genobi-swords` only                                                                                                                                                                                        |
| "My character talks in a church, then walks out to the street; show the church from outside" | `genobi-director` for the cut, `genobi-3d` for the set outside, `genobi-camera` for the LTX-2.5 cards and `genobi-akuspace` for the treatment: `cathedral` inside, `outdoor_day` or `outdoor_night` outside |
| "A cyberpunk alley at night in the rain, with heavy reverb on the sound"                     | `genobi-akuspace` (an AKUSPACE treatment at `high`) with `genobi-camera` for the shot; `genobi-director` too if it goes into the person's project                                                           |

## Tools

| Tool                      | Use it to                                                                       |
| ------------------------- | ------------------------------------------------------------------------------- |
| `genobi_status`           | Confirm the studio is up, whether it holds a provider key, and its budget       |
| `genobi_models`           | See runnable models and their route: `router`, `workflow` or `bfl`              |
| `genobi_budget`           | What the studio's demo budget leaves this session today; check a recipe first   |
| `genobi_jobs`             | List this session's recent jobs with status, cost and result link               |
| `genobi_job`              | Check one job; safe to repeat, never pays, may save a finished clip             |
| `genobi_quote`            | Price a generation without running it; returns a `quoteId` for ten minutes      |
| `genobi_submit`           | **Spends money.** Start the quoted run with its `quoteId` and a request key     |
| `genobi_take`             | Read a Ready job's take: recipe, input hashes, outputs and the cost receipt     |
| `genobi_take_to_project`  | Copy your Ready take or your own media cut into the linked project, as an asset |
| `genobi_link_project`     | Link the Director project the person is editing, with the studio's code         |
| `genobi_projects`         | List the Director projects this session may see                                 |
| `genobi_project`          | Read one project: tracks, clips, assets, shots and the person's frame notes     |
| `genobi_project_feedback` | Read what the person changed since your last command, as commands and notes     |
| `genobi_director_command` | Apply one Director command at the revision you read; never pays                 |
| `genobi_template_plan`    | Plan a house template: each shot's `genobi_quote` arguments and its price       |
| `genobi_provenance`       | Build the provenance card for finished takes: models, time, cost, tier          |
| `genobi_audio_upload`     | Bring a local WAV, FLAC or MP3 into the session by path; returns `sourceId`     |
| `genobi_audio_analysis`   | Tempo, fitted beat grid, onsets, intensity and key moments of an audio file     |
| `genobi_voice_status`     | Read local speech-to-text readiness, supported languages and duration limit     |
| `genobi_voice_transcribe` | Transcribe scoped audio or an external agent's file; return text for review     |
| `genobi_media_tools`      | Whether ffmpeg is installed for the local media tools                           |
| `genobi_media_probe`      | A clip's duration and video and audio streams                                   |
| `genobi_media_frames`     | Pull still frames from a video at given times, as PNG sources                   |
| `genobi_media_trim`       | Cut a section of a video or audio clip into a new source                        |
| `genobi_media_concat`     | Join two to eight clips end to end into a new source                            |
| `genobi_media_crossfade`  | Overlap two clips with a fade into a new source                                 |
| `genobi_media_space`      | Put an AKUSPACE room on a clip's sound in timed segments, as a new source       |
| `genobi_run_location`     | Read or set `local`, `cloud`, `both` or a registered `deployment`               |
| `genobi_deployment_stage` | Stage a scoped input for a deployment and receive a session-bound ticket        |
| `genobi_workflows`        | List the workflow templates per capability; `checkLocal` checks ComfyUI         |
| `genobi_workflow_select`  | Swap the template behind a workflow model, within its capability                |
| `genobi_machine`          | This machine's memory, disk and GPU, and which models run here or on Cloud      |
| `genobi_skill`            | List the skills, or load one by name when the task needs it; never pays         |
| `genobi_registry`         | Search the tools and skills by tag or text; never pays                          |
| `genobi_docs`             | Search and read the project wiki by tag, text or page; never pays               |
| `genobi_develop`          | Start a Developer for a change to the studio itself, or read one; never pays    |

## Paying for a generation

For speech-to-text, call `genobi_voice_status {}` first. If available, use
`genobi_voice_transcribe` with exactly one session audio `sourceId`, linked
`projectAsset: {copyId, assetId}`, or (external agents only) absolute local
`filePath`. An optional `language` must be in the status list. Review the returned
text before any action; the tool neither executes the transcript nor installs
models. Studio-started agents cannot pass a filesystem path.

For generation from project images, read `genobi_project.brief.references` and
pass ordered `projectImageReferences: [{copyId, assetId}]`. The adapter resolves
the linked bytes internally for quote and submit. Load `genobi-comfy` to stage
deployment files and quote a deployment recipe. Staging and transcription are
available to studio-started agents within their existing project/World/source
scope; submitting a paid generation remains unavailable.

0. Call `genobi_budget` with the runs and dollars the whole job needs. On the
   studio's demo key the agent's runs are held to three per session per day
   and $5 a day shared; on a key the owner saved (`uncapped`) only the price
   counts. Runs on the local ComfyUI are free: pass them as `localRuns` and
   they are not counted. If they do not fit, stop before quoting anything.
1. Call `genobi_quote` with the generation inputs (generator, model,
   description, camera, duration, resolution and so on). The `genobi-camera`
   card for the model says which inputs it takes.
2. Show the person `estimateUsd` and the recipe, and ask whether to go ahead.
   Submit only after they agree. Silence, or agreement to an earlier price,
   is not agreement.
3. Call `genobi_submit` with that `quoteId`, exactly the quoted inputs, and a
   new `idempotencyKey` you choose for this run (8 to 100 letters, digits,
   `_` or `-`). Changed inputs are refused (`quote_mismatch`); a quote pays for
   one run (`quote_used`) and expires after ten minutes (`quote_expired`).
4. Poll `genobi_job` until the job is `Ready`, then `genobi_take` for its
   record. Each poll returns `progressLine`, the studio's own status line
   (`GENERATING KLEIN IMAGE  73% ⣿⣿⣿⣀⣀`, or the elapsed seconds while the
   provider reports no progress). Show it to the person, verbatim in a code
   block, whenever it changes, with the stage you are on before it when a run
   has several (`FINDING THE SUBJECT`, then the image, then the video). Never
   draw a bar or a percentage of your own: the line has one only when the
   provider reported it.

- Generation costs the person real money. Never call `genobi_submit` without
  a quote whose price the person accepted in this conversation.
- Never retry a submission yourself. If `genobi_submit` reports an uncertain
  outcome, check `genobi_jobs` for the run first. If it is not there, submit
  again with the **same** `idempotencyKey` and the same inputs: the studio
  replays the first run instead of paying twice. A new key could pay twice.
  If the quote expired meanwhile, quote again and still reuse that key. If the
  studio refuses the key as belonging to another session (the MCP server
  restarted), do not submit again: ask the person to check the studio history.
- Use a new `idempotencyKey` only for a new run the person asked for.
- Never ask for, print or store a provider key.
- Changing the run location or the workflow changes what a run costs and where
  it goes. Ask for a new quote after either; an older quote is refused.
- Model names, routes and open-weights flags come from `genobi_models`; do not
  assume a model exists.

## When the studio started you

A project prompt in the studio can start you as a local agent session. Then:

- `genobi_submit` is not available, and the studio refuses every paid step
  from your sessions (`agent_cannot_spend`), in its API and in your browser.
  Call `genobi_quote` with exactly the inputs the step should run. That quote
  appears in the person's studio, in the session's bubble, with what it will
  run, the model, where, the duration, the estimated cost and whose key pays;
  they press **Approve** or **Decline** there. Quote each paid step once,
  then stop and say what is waiting. Their approval runs your quoted inputs
  in their own session, so a quote for a workflow model must match their run
  location and template; if they changed either, the approval is refused and
  you quote again when asked. Quotes expire after ten minutes.
- The session's brief gives you a link code for the project they have open,
  and, when you have a browser, a one-use address that signs it in to the
  studio. That browser is yours, not theirs; use only the studio in it.
- Your instructions are this skill and the brief. Load the other skills the
  request needs with `genobi_skill` before you act.

### The studio's context: picks and settings

When the person has picked things or set up the composer, the brief ends
with **The studio's context**: a fenced block tagged `json genobi-context`
holding one JSON object. Read it before you act, and use its ids rather than
guessing or searching for "the right one".

```json
{
  "picks": [
    { "kind": "take", "id": "run-1", "media": "video", "name": "Penguin" },
    {
      "kind": "asset",
      "id": "audio",
      "media": "audio",
      "name": "pulse.wav",
      "projectId": "signal-studies"
    }
  ],
  "settings": {
    "generator": "video",
    "model": "ltx-2.5",
    "duration": 6,
    "aspectRatio": "16:9",
    "resolution": "hd",
    "runLocation": "local"
  }
}
```

- `picks` are newest first, at most eight. "My last pick" is `picks[0]`;
  "my last two picks" are `picks[0]` and `picks[1]`. A `take` id is a gallery
  run: read it with `genobi_job` or `genobi_take` (you may read exactly the
  picked takes; any other job of theirs is not found). An `asset` id is a media
  asset in the Director project `projectId`: find it with `genobi_project`.
- `settings` is what the composer holds now, in `genobi_quote`'s field names
  (`camera` and `light` are term ids per section, `gaps` LTX's filled gaps,
  `runLocation` where workflows run). "These settings" or "the same settings"
  means these values; quote with them unless the person changes one. Your
  studio session already runs workflows where the person's does (their run
  location and templates at the start); do not change it unless asked.
- The studio also writes what such phrases mean into the prompt, in
  brackets: "my last two picks [take run-1 “Penguin” (video); asset audio
  “pulse.wav” (audio, project signal-studies)]". The brackets and the block
  agree; they are the studio's, not the person's words.
- `direction`, when present, is the linked Director project's
  `globalPrompt` (the primary direction for the piece; `globalPromptCut`
  means `genobi_project` has the rest) and `clip`, the clip the person has
  selected, with its own `prompt` and typed `directions` (`shot`, `lens`,
  `camera`, `action`). The person's explicit request in this prompt outranks
  saved directions; when a clip's words and its directions disagree, say so
  and ask.
- `note`, when present, says what the studio left out, such as picks from a
  project other than the one you are linked to. Tell the person when the
  request needs them; you cannot open that project.
- When the prompt asks for more picks than there are, or for settings the
  block does not have, say so and ask. Never invent an id. The block never
  holds a key; do not ask for one.

## Coming next

Character swap and more Comfy workflows.

When working on a linked project, load `genobi-taste` with `genobi_skill` and
read `genobi_context` before editing. Shared project evidence and checkpoints
survive across harnesses; private harness memory is supplemental.
