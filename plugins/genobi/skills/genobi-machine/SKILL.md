---
name: genobi-machine
description: Check the machine the Genobi studio runs on (memory, free disk, Apple silicon or an NVIDIA GPU) and explain which models run locally and which on Comfy Cloud - transcription, listening, vision, Klein, LTX and the upscaler - with the reason and documented source for each. Reads only; never downloads, installs or pays.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director), the genobi MCP server and Node 22 or later.
metadata:
  version: "0.1.0"
  phase: "machine check (issues 12 and 14)"
  tags: "agents, models"
  docs: "docs/machine-check.md"
---

# Genobi machine check

Genobi runs open models on the person's own machine when they fit, and on
Comfy Cloud when they do not. This skill reads the machine and explains the
plan. It changes nothing: it never downloads a model, installs anything,
changes a setting or pays.

## Run the check

1. `genobi_status {}` → the studio is up.
2. `genobi_machine {}` → `machine` (one line: chip or GPU, memory, free disk),
   `summary` (one line per capability), `plan` and `probe`.

The probe is read on the local server, so the hosted studio has no machine
check. It is cached for a minute; asking again sooner returns the same
answer.

## Explain the plan

Give the person a short table from `plan.capabilities`, one row each:

| Capability | Where                                 | Model   | Why                 |
| ---------- | ------------------------------------- | ------- | ------------------- |
| `label`    | `where`: this machine, or Comfy Cloud | `model` | `reason`, shortened |

Then, in a sentence or two each:

- **Transcription** is voice mode's speech to text, Qwen3-ASR-0.6B. It is
  always on this machine (Metal on a Mac, the CPU elsewhere), because voice
  mode runs on the local server only; it has no Cloud fallback. Its maker
  documents no memory figure, so the plan checks only its 1.88 GB download.
  It is not listening: transcription writes down speech, listening describes
  music and sound.
- **Listening** is the largest listening model that fits, from Qwen3-Omni
  down to Voxtral Mini 3B. If none fits, it is Gemma 4 on Comfy Cloud.
  `hosted` names the API-only premium options (Gemini, hosted Qwen Omni
  Flash); mention them only if the person asks.
- **A local row is a plan, not a run.** Read its `note`: Genobi has no local
  listening or vision worker yet, and Klein, LTX and the upscaler run locally
  only once the local ComfyUI client and run location land. Until then the
  studio runs them on Comfy Cloud. A note may also say too little memory is
  free right now.
- **Cloud rows say why.** `candidates` holds each local model considered,
  largest first, with `fits`, the memory and download it needs and its
  `reason`: too little memory, too little disk, a figure documented for
  NVIDIA GPUs only, or no documented figure at all.
- Read `plan.caveats` and pass on the ones that matter here: figures are the
  makers' documented minimums, a Mac counts three quarters of its unified
  memory and has not been measured by any maker, and the disk keeps 10 GB
  free.

Cite a figure only from a candidate's `sources`. Never estimate memory for a
model whose `memoryGb` is `null`, and never suggest a quantised build as if
it were documented. If the person wants a model planned locally that the
plan sends to Cloud, say what is missing (memory, disk, or a documented
figure) rather than overriding the plan.

## Where the result is kept

Return the plan in your answer. Genobi has no agent profile yet: when agent
profiles land, the plan is saved there, so a
later session reads it instead of probing again. Do not write it to a file
of your own.

## Not this skill

Choosing a generation model for a shot is `genobi-camera`; a whole cut is
`genobi-director`. The machine check only says where models would run.
