---
name: genobi-comfy
description: Extend Genobi through ComfyUI as its Developer - add a workflow graph and register it as a template, check it against the run location's node and model catalogue, run it on a local ComfyUI, Comfy Cloud or a Comfy Developer Platform deployment, add or fix a custom node, and rebuild the deployment when a graph needs nodes Cloud does not hold. Every paid run is quoted and waits for the person's yes; remote writes and deploys stay within the person's scope.
license: MIT
compatibility: Needs a camera-director checkout, Node 22 or later, the Genobi studio running locally (`npm run dev`) with the genobi MCP server, and for the deployment steps the comfy-cli (`pip install comfy-cli`) signed in with `comfy cloud login`. A local ComfyUI on its own port is optional.
metadata:
  version: "0.1.0"
  phase: "developer role (Comfy skill, 29 October 2026)"
  tags: "agents, comfy, workflows"
  docs: "docs/run-location.md, docs/comfy-deployment.md, workflows/README.md, docs/hermes-profiles.md"
---

# Extend Genobi through ComfyUI

Genobi runs its open models as Comfy graphs: API-format JSON under
`workflows/`, registered as **templates** that stand behind a capability
(text to video, image, upscale, acoustic space, layout to render, references
to video, character swap, text to music). This skill is how an agent in the
Developer role gives Genobi a new capability, fixes a graph or node, or links
a run location, without inventing a route the app does not have.

Read `AGENTS.md` and `docs/read-through.md` first. Work in a development
checkout and test port, never in the checkout a Creative session is using.
Nothing here spends until step 6, and that step quotes first.

## 1. See what exists

1. `genobi_status {}` → the studio is up.
2. `genobi_run_location {}` → `location` (`local`, `cloud` or `deployment`)
   and whether a local ComfyUI answers.
3. `genobi_workflows {"checkLocal": true}` → every template, the capability
   it serves, which one each `workflow` model runs, and on a local ComfyUI
   the node types and model files it lacks. Free; nothing is submitted.
4. `genobi_docs {"text": "<what you are adding>"}` and
   `genobi_registry {"tag": "workflows"}` → the pages and tools that already
   cover it. A capability that exists as a template is swapped with
   `genobi_workflow_select`, not re-added.

## 2. Author the graph from a working one

Start from a graph that already ran: a Comfy template from the gallery, an
official model workflow, or one of ours. Export it in **API format** from
ComfyUI (File → Export (API)) rather than hand-writing nodes. If the
comfy-cli is installed, `comfy --json nodes show <Class>` gives the exact
inputs and enum choices of a node on the target, and
`comfy --json templates fetch <name>` a known-good reference.

Do not edit a graph's widget values with `jq` or `sed` by node id. Change the
value in ComfyUI and export again, or give the value a **slot** (next step)
so the app fills it.

## 3. Register it as a template

One graph becomes one template, beside the others:

1. Save the API JSON as `workflows/<id>.json` and write `workflows/<id>.README.md`:
   where the graph came from (source, commit or template name, date), its
   licence and notices, the nodes and model files it needs, the slots, and
   what was run to prove it.
2. Add a `WorkflowTemplate` in `shared/comfy/<family>.ts` (see
   `shared/comfy/akuspace.ts` and `klein.ts`): `id`, `file`, `graph`,
   `slots` (every value the app fills, including a `model` slot for each
   loader so a local model map can fill it), `requiredNodes`,
   `requiredModels`, `output` when it is not a video, and `hosts:
["deployment"]` only when the graph needs a custom node pack neither Comfy
   Cloud nor a stock ComfyUI holds.
3. Add its `TemplateChoice` to `workflowTemplates` in
   `shared/comfy/workflows.ts` with the capabilities it serves and a `values`
   function. A new capability goes into `CAPABILITIES` and
   `CAPABILITY_LABEL` in the same change.
4. If the person should pick it as a model, add a `workflow` registry entry in
   `shared/registry.ts` (`route: "workflow"`, `model: "workflow/<id>"`,
   `open` set from the weights' licence, `localOnly` when the hosted Worker
   cannot copy its output). A template that only swaps behind an existing
   entry needs no registry row.
5. Tests: `tests/workflow.test.ts` checks every link names a node the graph
   holds and every slot names an input; add a focused test for the values
   function. Run `npm run typecheck`, `npm test -- <file>`, `npm run
check:worker` (the template lives in `shared/`, so it must stay portable),
   and `npm run registry` when a tool or skill changed.

`shared/` imports no Node or DOM API; a graph's bytes are imported as JSON.

## 4. Check it against the run location

- **Local ComfyUI:** `genobi_workflows {"checkLocal": true}` reports missing
  node types and model files from `/object_info`. Install the pack in that
  ComfyUI's `custom_nodes` and name the model files through
  `GENOBI_LOCAL_MODELS` (`docs/run-location.md`); never download a model
  without saying what and how large.
- **Comfy Cloud:** `requiredNodes` and `requiredModels` must be in the
  account's catalogue. Cloud cannot load custom node packs or uploaded audio;
  a graph that needs either goes to a deployment.
- **A Comfy Developer Platform deployment:** the graph must be in
  `comfy-build/workflows/` and its packs and weights pinned in
  `comfy-build/sources.lock` and `comfy-build/models/<set>.txt`
  (`docs/comfy-deployment.md`). `comfy build validate .` and
  `comfy build validate --remote .` are free; `comfy build push --release` and
  `comfy deploy up` create things on the platform and bill GPU time, so they
  need the person's explicit go, and a deployment is left at `--min 0`.

Say plainly which location a template can run on today; do not promise Cloud
parity for a graph with a custom node.

## 5. Add or fix a custom node

Our packs are `custom_nodes/director_world_builder` (World Builder capture,
depth, canny, acoustics, reverb, storyboard; built with
`npm run build:scene-adapter`) and ComfyUI-Koshi-Nodes (AKUSPACE), pinned by
commit in `comfy-build/sources.lock`. A node change is a pack change: edit the
pack, run its tests, restart the local ComfyUI, re-read `/object_info`, then
pin the new commit in the lock before any rebuild. Keep a node's inputs and
outputs stable once a template names them; a renamed output breaks every
graph that wires it.

## 6. Run it, quoted

The example puts the plain LTX graph behind Acoustic Space, the documented
swap for a ComfyUI without the AKUSPACE LoRA; use your own entry and template.

1. `genobi_run_location {"location": "local"}` when the session's location is
   not the one the template needs: `local`, `cloud` or `both` (local open
   workflows plus cloud API models). An external agent can choose `deployment`
   with `deploymentUrl: "https://<name>.run.comfy.app"`; registration and tickets
   belong to that session. Studio-started agents inherit their person's setting
   and do not change run location. A template's pinned `hosts` still apply.
2. `genobi_workflow_select {"entry": "ltx-2-5-akuspace", "template": "ltx-2-5-t2v"}`
   puts the template behind the entry for this session.
3. `genobi_quote {"generator": "video", "model": "ltx-2.5-akuspace", "description": "A test shot of the new template: rain on a tin roof, one figure under it.", "camera": {"shot-sizes": "wide", "movements": "static"}, "cameraEnabled": true, "duration": 4, "resolution": "hd", "aspectRatio": "16:9", "acoustic": {"mode": "room", "preset": "cathedral", "level": "mid"}}`
   for the entry. Show the person the price and the location, and wait for a
   yes to that price. A local run costs nothing and still goes through the
   quote so the take is recorded.
4. `genobi_submit {"quoteId": "<quoteId>", "idempotencyKey": "comfy-test-<template>-<yyyymmddhhmm>", ...the exact arguments of step 3}`
   once. Never resubmit an uncertain run with a new key.
5. `genobi_job` until `Ready`, then `genobi_take` for the outputs and receipt.
   Put what ran, where, how long and what it cost in the template's README.

### Registered deployment inputs

The model catalogue includes `ltx-deploy-layout-to-video` and
`ltx-deploy-akuspace`. Use the row's `inputModel` for quote/submit, and read
the endpoint manifest and [run location](../../../../docs/run-location.md) for
its required files. Both recipes use eight seconds, HD, 16:9 and no draft.

`genobi_deployment_stage` stages exactly one input and returns its ticket:

```json
{
  "token": "REFERENCE_PNG",
  "contentType": "image/png",
  "projectAsset": {
    "copyId": "signal-studies.abcdefghjk",
    "assetId": "image-1"
  }
}
```

External agents may use `filePath` for an absolute local media file instead;
studio-started agents cannot. A paired browser capture may use
`worldFile: {session, file}` with a file returned by the live World session.
Do not combine sources. Staging uploads media but does not run the graph; the
deployment's storage/billing policies still apply. Size limits come from
`genobi_run_location.deploymentInputBytes`.

Use the returned IDs as `deploy.assets` keyed by token, with `deploy.seed` and
`deploy.negativePrompt`. Layout-to-video also needs the matching capture recipe
as the `deploy.recipe` JSON string. Tickets expire after two hours and belong
to this session and endpoint: a new process needs a shared CLI profile to reuse
them, and changing endpoints requires staging again. Never put an external URL
or provider asset ID in place of a ticket. Quote and submit the same complete
input with the usual approval and stable request key. A deployment quote reports
GPU-time billing; a zero estimate is not free execution.

Read `genobi_take.outputs` after completion. Separate wet/IR/audio outputs have
their own asset IDs; `genobi_take_to_project` with `outputId` selects one and
omitting it selects the video. No additional generation is needed.

## 7. Hand back

Return the diff (graph, README, template, registry row, tests), the checks you
ran with their results, the locations the template is proven on, and the
retest steps. Update `workflows/README.md`'s table and the docs the change
touches in the same patch. Commit, push, release and deploy only within the
person's request and the repository's verify-before-write protocol.

## Worked example: an open narration voice

Genobi has no text-to-speech route yet. Comfy's node catalogue (checked
29 October 2026) lists open TTS packs: Qwen3-TTS (voice design, preset and
cloned voices), VibeVoice, Dia, IndexTTS2, Chatterbox and F5-TTS. MiniMax's
speech models are partner API nodes, not open weights. To add narration:
export a Qwen3-TTS graph that takes `text` and a voice description, give it
`text`, `voice` and `seed` slots and an audio output, register it under a new
`text-to-speech` capability as `localOnly`, prove it on a local ComfyUI, record
the model's licence in `LICENCES.md`, then wire the result into the Director as
an audio asset. A new narration route still needs a measured, owned audio-output
contract on each intended adapter; hosted deployment companion audio does not
make a new standalone TTS model available automatically.
