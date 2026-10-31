---
name: genobi-akuspace
description: Give an LTX-2.5 shot an Acoustic Space (AKUSPACE) treatment - where the sound is heard, not where the camera is - with the room, outside and sound-effect presets and levels the studio accepts, the caption it appends, why it runs only on the workflow route (Comfy Cloud or a local ComfyUI) and never on Comfy Router, and how to run it without the LoRA, always behind a quote the person accepts.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director), the genobi MCP server and Node 22 or later. A Comfy Cloud run needs a Comfy key and the AKUSPACE LoRA in that key's Cloud library; a local run needs a ComfyUI on this machine.
metadata:
  version: "0.1.0"
  phase: "1 - quoted generation"
  tags: "sound, agents, ltx, workflows"
  docs: "docs/camera-wording.md, docs/run-location.md, workflows/ltx-2-5-akuspace-t2v.README.md"
---

# Genobi Acoustic Space

Acoustic Space describes **where the sound is heard, not where the camera
is**. It is the AKUSPACE LoRA, trained on LTX-2.5 audio, and it runs on one
registry entry: **LTX-2.5 · Acoustic Space** (`ltx-2-5-akuspace`, request
model `ltx-2.5-akuspace`). The video is LTX-2.5 Fast's; the treatment shapes
the room tone, reverb or effect on the audio LTX always generates.

For the shot itself (the LTX paragraph, camera terms, lengths and sizes) use
the `genobi-camera` skill: its Acoustic Space card holds the request, route
and cost. For the paying rules and every tool, `genobi-studio`.

## The treatment

`acoustic` is `{"mode", "preset", "level"}`, with an optional `text`. The
values come from the AKUSPACE node pack's `presets.json` (version 4, release
0.5), copied verbatim into `shared/akuspace-presets.json`; `shared/acoustic.ts`
(`acousticSections`, `readAcoustic`) accepts only these combinations:

| `mode`    | Studio section | `preset`                                               | `level`                                       |
| --------- | -------------- | ------------------------------------------------------ | --------------------------------------------- |
| `room`    | Room           | `small_room`, `empty_club`, `medium_room`, `cathedral` | `low` (Low), `mid` (Moderate), `high` (Heavy) |
| `outside` | Space          | `outdoor_day`, `outdoor_night`                         | `low`, `high`                                 |
| `sfx`     | Sound effects  | `dual_delay` (experimental)                            | `low`, `high`                                 |

The studio's default is `room`, `medium_room`, `mid`. A preset or level that
does not belong to its mode is refused before any quote. Off (dry) is not a
treatment: it bypasses the LoRA, which is LTX-2.5 Fast (`ltx-2.5`) on Router.

What each preset is, in the node pack's words:

| `preset`        | Caption the studio appends (at `mid` for rooms, `low` otherwise)                                                                         |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `small_room`    | `AKUSPACE in a small bathroom-like room, moderate bright close reflections and a short 0.67-second reverb decay, no background ambience` |
| `empty_club`    | `AKUSPACE in an empty club, moderate broad hard-surface reflections and a 1.2-second reverb decay, no crowd`                             |
| `medium_room`   | `AKUSPACE in a medium reverberant room, moderate smooth reflections and a 1.9-second reverb decay, no background ambience`               |
| `cathedral`     | `AKUSPACE through synthetic cathedral reverb, moderate wide diffuse reflections and a long decaying tail, no background ambience`        |
| `outdoor_day`   | `AKUSPACE outdoors in daytime, gentle open-air acoustics with continuous birdsong ambience`                                              |
| `outdoor_night` | `AKUSPACE outdoors at night, gentle open-air acoustics with crickets and distant car ambience`                                           |
| `dual_delay`    | `AKUSPACE through a modular granular delay, gentle scattered grains and unpredictable modulated echoes, no background ambience`          |

The level word is `gentle` (`low`), `moderate` (`mid`) or `heavy` (`high`).

## The caption

The studio builds the trained caption, trigger first, and joins it to the end
of the prompt exactly as the AKUSPACE Prompt node would (`acousticCaption` and
`appendAcoustic` in `shared/acoustic.ts`, ports of the node's `build_caption`
and `compose_prompt`): a space after `.`, `,`, `;` or `:`, otherwise `, `.

- **Do not write AKUSPACE wording into `description`.** Describe the scene,
  action and camera; the studio appends the caption. In the LTX paragraph
  order (`genobi-camera`), it opens the audio part.
- `text` (up to 600 characters, not empty) replaces the caption after the
  protected `AKUSPACE` trigger. Custom wording is experimental, not a trained
  caption; prefer a preset, and say so when you use `text`.
- The node's `source_type` stays at "none", the effect-only caption.

## Where it runs

**Comfy Router runs no LoRA**, so it cannot apply AKUSPACE. The entry's route
is `workflow` (`workflow/ltx-2-5-akuspace-t2v`): LTX-2.5's graph plus a core
`LoraLoaderModelOnly` with `akuspace-ltx25-v0.5.safetensors` at strength 1.0
([workflow README](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-2-5-akuspace-t2v.README.md)).
The studio never sends a treatment to Router, a treatment on any other model
is refused, and `ltx-2.5-akuspace` without one is refused too.

A workflow entry follows the session's run location
([run location](https://github.com/koshimazaki/Genobi/blob/main/docs/run-location.md)):

1. `genobi_run_location {}` reads it: `cloud` (Comfy Cloud, charged to the
   Comfy key) or `local` (the ComfyUI on this machine, nothing charged), and
   whether a local ComfyUI answers.
2. `genobi_workflows {"checkLocal": true}` lists the template behind
   Acoustic Space and, for the local ComfyUI, the node types and model files
   it lacks there. Nothing is submitted.
3. Change either only when the person asks, then quote again: a quote taken
   before a change of location or template is refused (`quote_mismatch`).

On Comfy Cloud the run uses the Cloud library of the key that submits it: the
LoRA must be imported there (Creator tier). If it is missing, Cloud refuses
the run and the studio names the fix. On a local ComfyUI the LoRA must be one
of its model files (the operator's `GENOBI_LOCAL_MODELS` can name it per
slot; `genobi_workflows {"checkLocal": true}` says when it is missing), and
`neon_cyborg_portrait.png` must be in its `input` folder (the graph's bypassed
`LoadImage` still validates it).

### Without the LoRA

Where the LoRA is not installed, the person can run Acoustic Space on the
plain LTX-2.5 graph:
`genobi_workflow_select {"entry": "ltx-2-5-akuspace", "template": "ltx-2-5-t2v"}`.
The treatment still reaches the prompt as the caption, but no LoRA shapes the
sound, so say that the result is LTX reading the words, not the trained
effect. Selecting the default template switches back:
`genobi_workflow_select {"entry": "ltx-2-5-akuspace", "template": "ltx-2-5-akuspace-t2v"}`.

A session the studio started may inspect templates with `genobi_workflows`,
including `{"checkCloud":true}` or `{"checkLocal":true}`. It cannot call
`genobi_run_location`, `genobi_workflow_select` or `genobi_budget`; ask the person
to change run settings in the studio. It can still quote and request approval.

## Frame and length

- **`16:9` only.** The Cloud template names its frame by label and only the
  widescreen label is known. `hd` is 0.9 MP, `fhd` 2.1 MP; `qhd` and `uhd`
  are capped at 2.1 MP for now.
- LTX's lengths, 2 to 20 seconds (the `genobi-camera` LTX card lists them);
  24 fps, as in the AKUSPACE reference workflow.

## Paying

1. `genobi_budget` with the runs and dollars the job needs; stop if it does
   not fit. Local runs are free and left out (`localRuns`). Studio-started
   sessions skip this unavailable tool and show the quote estimate instead.
2. Quote, for example:
   `genobi_quote {"generator": "video", "model": "ltx-2.5-akuspace", "description": "Raw concrete walls catch hard slices of white light in an empty hall.", "camera": {"shot-sizes": "establishing", "movements": "crane"}, "cameraEnabled": true, "duration": 4, "resolution": "hd", "aspectRatio": "16:9", "acoustic": {"mode": "room", "preset": "cathedral", "level": "mid"}}`
   or, outside at night:
   `genobi_quote {"generator": "video", "model": "ltx-2.5-akuspace", "description": "A woman in a yellow raincoat waits at a tram stop under a flickering street lamp.", "camera": {"shot-sizes": "medium", "movements": "static"}, "cameraEnabled": true, "duration": 6, "resolution": "hd", "aspectRatio": "16:9", "acoustic": {"mode": "outside", "preset": "outdoor_night", "level": "low"}}`
3. Show the person `estimateUsd` (Comfy Cloud bills GPU time; the studio
   estimates it at LTX-2.5 Fast's rate, marked `est.`) and the recipe, with
   the run location and template. Wait for their yes to that price.
4. `genobi_submit` with that `quoteId`, exactly the quoted arguments and a new
   `idempotencyKey`. Never retry an uncertain submission with a new key.
   In a session the studio started there is no `genobi_submit`: quote once and
   stop; the person approves the quote in the studio.
5. Poll `genobi_job` until `Ready`, then `genobi_take` for the record.

## Planned, not built

Do not quote these or describe them as available:

- **AKUSPACE with audio input**, if the LoRA can process existing audio.
- **AKUSPACE on a segment**: only a chosen range of the track through the
  reverb LoRA, crossfaded back in.
  Without the LoRA, the rooms already run on existing sound on this machine:
  `genobi_media_space` (taught by `genobi-swords`) convolves a clip's sound
  with a synthetic room per timed segment. It has no outdoor or delay
  presets.
- Portrait frames, until the template's portrait label is known.

The public reference workflows are in
[ComfyUI-Koshi-Nodes](https://github.com/koshimazaki/ComfyUI-Koshi-Nodes/tree/main/workflows/akuspace).

## Rules

- Never call `genobi_submit` without a price the person accepted in this
  conversation, and never retry a submission with a new key.
- Never ask for, print or store a provider key.
- The studio's preview of a room is illustrative, not an acoustic simulation;
  do not promise how the generated sound will be.
