---
tags: [vision, verification]
summary: The Open Source Higgsfield submission dossier - the prose for the form, how we read the challenge, where the innovation is, what was built per section, how each example video was made, what is verified locally and deployed.
---

# Genobi: submission dossier

The page the submission form links to. Written 29 October 2026 from the
records in this wiki; every status below comes from a dated docs page, run log
or workflow README, and anything without such a record is called implemented,
not working. Feature by feature, the same facts are in
[the capability map](capabilities.md), which `npm run check:capabilities`
holds to the repository.

## For the form

**Genobi — build the scene, shape the sound, make the cut.**

Genobi is an open-source video studio built around ComfyUI, with MIT-licensed
original code, downloadable workflows and an open-weight local path. Direct
shots with model-specific camera controls; build Three.js worlds inside our
custom ComfyUI nodes; turn their captures into LTX video; and shape the sound
from the same scene's geometry and materials. Edit the result with an agent
on a shared, editable timeline, then correct its timing and send your changes
back for the next pass.

The new adaptive-reverb demonstration connects agent-built Three.js scenes,
local FLUX 3 Image Klein look frames, LTX-2.5 Layout-to-Render and our CPU
acoustics/reverb nodes. The camera travels through different spaces while the
music takes on their estimated acoustics. Our separately trained AKUSPACE
LoRA explores another route: room-conditioned generated sound. These are
separate audio options, with comparison results and limitations recorded in
[the 30 October evidence](adaptive-reverb-proof.md).

Director and the frame-accurate Editor, Dual Swords, the Taste reference
library, licence information, project memory and the MCP/CLI agent tools make
this a reusable studio. Hermes can use a local open model; Claude Code and
Codex are optional harnesses. Comfy Cloud, Comfy Router and BFL provide
optional hosted routes, with explicit approval before paid agent operations.
The hosted client and local studio have different capabilities; the local
studio provides the local model, voice and agent integrations.

Original application code is open source. Model weights, third-party
components and example assets retain their own licences. API-generated or
API-upscaled examples are identified separately from open-workflow evidence.

## How we read the competition

The challenge facts below are the ones this wiki recorded when it read the
official pages; nothing here is a rule we inferred.

- **Categories, checked live 30 October.** The official page now lists
  **Best Overall** (every entry is automatically considered), **Most
  Innovative**, **Most Viral**, **Open Weights Only**, and ten runner-up
  awards. Its ecosystem bonuses are **VFX Workflow Built with LTX**,
  **Built with FLUX**, and **Built with MiniMax H3**. Do not assume that one
  submission can win every category or bonus.
- **Open Weights Only.** The current wording is "No partner nodes or
  closed-source APIs, open-weights models only." Present the local ComfyUI
  demonstration and its actual provenance as the evidence. Optional Router,
  BFL and hosted-agent examples are not evidence of an entirely local open
  route. Downloadable weights still retain their own model licences.
- **The LTX bonus.** LTX VFX is a $2,000 cash bonus and requires LTX as the
  core video model. In Genobi,
  LTX-2.5 is the video model of the Product video, Character piece and
  Audio-visual templates, and the model AKUSPACE is trained on.
- **Innovation must be explained.** The recorded rule is that "any other
  tools, models, or techniques you want to combine with it are fair game and
  must be explained in your demo video".
  We add that, because Comfy already has shader and 3D nodes,
  novelty has to rest on the demonstrated integration, not a single node.
  The next section is that explanation.
- **App requirements, checked live 30 October.** The work must be built
  with ComfyUI and may run entirely locally, on Comfy Cloud, the Developer
  Platform, Comfy Router, the Comfy SDK, or a mix. Developer Platform hosting
  is no longer mandatory in the live wording. The public repository must
  include the code, workflow files, an open-source licence and local setup
  instructions. Other tools and techniques must be explained in the demo.
  The entry must be lawful and SFW, with no unlicensed IP or likenesses;
  submission permits the sponsors to feature it with credit. One entry per
  person. A demo of at most two minutes and a social post tagged
  `#OpenSourceHiggsfield` are required; a hosted link is encouraged.

Source: [official challenge page](https://comfy.org/open-source-higgsfield).
The [submission form](https://form.typeform.com/to/V1dSQrkS) asks for a demo
under two minutes and says to expect 5–10 runs if supplying a judging link.

## Where the innovation is

What we read as new is not one model but the links between the parts, each of
which an agent can drive. The case for innovation is the combination and the interfaces that make it
usable; we do not claim that no other tool has any individual component:

- **The Editor and the loop.** A frame-accurate timeline where an agent and
  the person edit the same project, and the agent reads back the person's
  changes before its next pass ([Editor](capabilities.md#editor-timeline)).
- **Agent, open source, licences and taste.** An agent held to open models, an
  MIT studio, a licence layer that checks what a piece may use, and a Taste
  layer that keeps the person's decisions as reusable memory
  ([Taste and licences](capabilities.md#taste-layer-project-memory-and-licences)).
- **3D, acoustics and our own LoRA.** The World Builder's set and camera move,
  room acoustics computed from its materials, and the AKUSPACE LoRA we trained
  on LTX-2.5, with custom ComfyUI nodes built for them.
- **The camera in each model's words**, as an interface and as part of every
  workflow (below).
- **The whole Comfy platform.** Comfy Cloud and Comfy Router inside the studio, plus
  a Developer Platform deployment target, alongside BFL's API, chosen per
  workflow ([run location](capabilities.md#run-location-and-workflow-swap)).

The five links below are where those parts meet.

1. **3D guidance with its acoustics.** The [World Builder](capabilities.md#world-builder-sets-and-capture)
   captures a set and camera move as colour and depth frames and the take's
   sound (verified 17 October). Its [Comfy nodes](capabilities.md#world-builder-nodes-in-comfyui)
   read the room's geometry, compute RT60 from its materials and name the
   AKUSPACE preset LTX should use, and convolve a voice with the same room
   (run once on a local ComfyUI on 29 October, no GPU model involved). The
   [scene builder](capabilities.md#scenes-as-data-and-room-acoustics) maps
   agent-built rooms to those presets (verified 24 October). The 30 October GPU runs now demonstrate capture → Klein look frame →
   LTX Layout-to-Render, with scene-derived CPU reverb in the graph
   ([evidence](adaptive-reverb-proof.md)). This verifies the external ComfyUI
   workflow, not the one-click studio route or a Cloud deployment.
2. **AKUSPACE sound.** Our LoRA on LTX-2.5 explores room-conditioned sound. Separate
   i2v/audio experiments ran on 30 October ([evidence](adaptive-reverb-proof.md));
   combining that LoRA with Layout-to-Render remains untested. [Space](capabilities.md#space-an-akuspace-room-on-existing-sound)
   puts the same rooms on sound that already exists, in timed segments,
   measured within 2% of each preset's RT60 (verified 24 October).
3. **The agent-driven studio.** One plugin serves Hermes, Claude Code and
   Codex over MCP, with a CLI for terminals and skills that load on demand
   ([sessions](capabilities.md#agent-sessions-in-the-bubble-and-deck),
   [CLI](capabilities.md#genobi-cli-commands), [discovery](capabilities.md#skills-and-wiki-search-for-agents)).
   An agent reads [the capability map](capabilities.md#registry-search-and-this-capability-map)
   to tell what is free, local, on Comfy Cloud or paid.
   An agent links the person's open project, edits it with revision-checked
   commands the person sees live, and reads back what the person changed
   ([Director](capabilities.md#director-projects-edited-by-agents), verified
   28 October with Hermes on DeepSeek V4.1 Flash through Nous). Every paid step is a quote the
   person approves once ([approvals](capabilities.md#quote-approve-then-spend)).
   Hermes is held to open models with no fallback
   ([open route](capabilities.md#hermes-on-an-open-model-through-nous)).
4. **The Editor timeline.** Program beside the global prompt, frame-accurate
   transport, channel lanes and a storyboard lane whose camera and action
   views edit each shot's directions, with Regenerate sending the person's
   edits to the agent ([Editor](capabilities.md#editor-timeline), implemented).
5. **Openjutsu with a box edit.** Comfy's Openjutsu character swap asks a
   closed image model for its first frame; Genobi makes that frame with a FLUX
   3 Image Klein box edit instead, so a box can swap a whole person or one
   item, each with its own reference
   ([swap](capabilities.md#openjutsu-character-swap-with-a-klein-first-frame),
   implemented, not yet run from Genobi).

## Each model has one job

The intention is a studio where each model does what it is best at, and the
person or agent never has to learn each one's prompt dialect:

- **FLUX 3 Image Klein is the key image model.** It makes the stills, first
  frames, references and box edits that the generation workflows start from
  ([Klein](capabilities.md#flux-3-image-klein-stills-and-box-edits)).
- **LTX-2.5 is the 3D and motion model.** The World Builder's set and camera
  move, and the AKUSPACE room sound, are built around it
  ([LTX](capabilities.md#ltx-25-open-workflow-and-acoustic-space)).
- **MiniMax H3 (open weights) is the character model.** The creature morphs in
  the Dimensions mix and the Genobi teaser are H3
  ([H3](capabilities.md#minimax-h3-reference-to-video-and-music-3)).

### The camera, in each model's own words

The camera panel makes the model-specific guidance accessible in one interface. A camera choice is written
into the prompt in the wording each model's own documentation asks for, and
the same wording goes into the studio's requests and into the ComfyUI
workflows (`composePrompt` writes it for both adapters). Each guide was read
and is cited, with the date checked, in [camera wording](camera-wording.md):

- **FLUX 3 image and FLUX 3 video** follow BFL's camera prompting guide. The
  Three.js diagram beside the panel illustrates each shot size, angle and move.
- **LTX-2.5** follows the LTX-2.5 prompt guide. The World Builder's 3D scene
  adds guidance for composition and camera beyond words; a capture
  through Layout-to-Render ran in the external ComfyUI workflow on 30 October
  ([evidence](adaptive-reverb-proof.md)); the studio handoff remains separate.
- **MiniMax H3** follows MiniMax's base prompt guide (section 4.3, camera
  motion), pinned to a commit. H3 gets no 3D guidance of its own, only the
  camera panel.

### Why some examples used BFL

We had more BFL credit than Comfy credit to spend during the challenge, so
some recordings, the presentation footage and the upscales of the example
videos ran on BFL's API (FLUX 3 video and FLUX Video Upscale). The open path
is still in the studio for every one of those steps: the open upscaler is
SeedVR2 as a Comfy workflow
([SeedVR2](capabilities.md#seedvr2-open-video-upscale)), and the example
cards name the model that made each clip. Those API runs do not count towards
Open Weights Only.

## What was implemented, per section

Each line names the capability rows; their status is in
[the capability map](capabilities.md).

- **Built on the Comfy Developer Platform.** Comfy Router runs LTX-2.5 Fast
  and Pro and FLUX 3 text to video, image and edit
  ([LTX on Router](capabilities.md#ltx-25-on-comfy-router-in-ltxs-camera-words),
  [FLUX on Router](capabilities.md#flux-3-text-to-video-image-and-edit-on-router),
  verified 26 October), and MiniMax H3
  ([H3](capabilities.md#minimax-h3-reference-to-video-and-music-3),
  implemented, not yet run); the official Comfy SDK runs the open workflows on Comfy
  Cloud or a Developer Platform deployment, and a local ComfyUI client runs
  them on your own GPU ([run location](capabilities.md#run-location-and-workflow-swap)).
- **Open source and local setup.** MIT licence, a from-clone README, and the
  workflows in `workflows/` with a README each
  ([run location](run-location.md#the-template-table)). Model licences are in
  `LICENCES.md`.
- **Open Weights Only.** The open routes are Comfy workflows of LTX-2.5 with
  and without AKUSPACE, FLUX 3 Image Klein, MiniMax H3 and Music 3, plus
  Hermes on an open model served on this machine
  ([local Hermes](capabilities.md#hermes-on-a-local-model-server)). Router, BFL
  and Nous examples are kept separate from this local-route evidence; the
  capability map marks those routes `api`. The 30 October adaptive-reverb run provides local-weight Klein and LTX
  evidence outside the studio; a complete Hermes pass with a local model and
  only open generation remains unverified (see [what works](#what-works)).
- **LTX bonus.** LTX-2.5 is the core video model of three house templates
  ([templates](capabilities.md#product-video-character-piece-and-audio-visual))
  and of [Acoustic Space](capabilities.md#ltx-25-open-workflow-and-acoustic-space);
  the camera panel speaks the LTX prompt guide's wording.
- **Best Overall.** The complete creative loop: generation, scene guidance,
  sound, editing, agent feedback and reusable projects.
- **Most Innovative.** The five points above.
- **Most Viral.** The [gallery](capabilities.md#template-gallery) with watch and
  embed pages, the [Dimensions mix](capabilities.md#dimensions-mix), remixable
  [bundles](capabilities.md#editable-project-bundle) and
  [voice mode](capabilities.md#voice-mode) for a spoken brief.

## The example videos

For each example: whether every model in it has open weights, and how it was
made, only as far as the repository records it.

| Example                                                                                                              | Models and weights                                                                                            | How it was made                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dimensions mix (second gallery card)                                                                                 | The three clips are the owner's MiniMax H3 (open weights) outputs; prompts and settings are not recorded      | Clips conformed with ffmpeg, cut as data to a 140 BPM excerpt of the owner's own track, overlays from our own recipes, rendered by the Director's Render MP4 ([page](dimensions-mix.md#how-it-was-made))                                                                                                                                                                                                                                                                                                                                                                                                  |
| Falling room preview (removed from the gallery 29 October)                                                           | No generative model                                                                                           | The World Builder's Falling room take captured headless and muxed with its dry synthesised sound ([page](falling-room.md#what-was-run-29-october-2026)); the Klein still has not run; the card and clip were removed because a fall was the wrong example                                                                                                                                                                                                                                                                                                                                                 |
| Character piece preview clip (Forest guardian)                                                                       | FLUX 3 image to video (closed weights); start image made with OpenAI gpt-image (closed)                       | The owner's own run, supplied with its start image, prompt and controls (20 s, 21:9, hd), recorded in `shared/gallery/generations.ts`; its Generate opens on that run ([gallery](template-gallery.md#generation-cards))                                                                                                                                                                                                                                                                                                                                                                                   |
| Product video preview clip                                                                                           | FLUX 3 image to video (closed weights), the owner said on 30 October; prompt and start image are not recorded | A supplied demo clip of the two creatures, labelled "Preview footage · FLUX 3 video", not made by the house recipe (LTX-2.5); its start image and prompt record in `shared/gallery/generations.ts` is empty ([gallery](template-gallery.md#preview-footage)). The clip plays on the Toy creatures generation card, badged "FLUX 3 video · API" because that card runs FLUX 3 image to video; the badge names what a card runs, not how its clip was made ([badges](template-gallery.md#model-badges-and-open-only)). Product video left the gallery on 30 October: the Genobi teaser is the product video |
| Audio-visual preview clip `audio-visual-h3.mp4` (since 30 October)                                                   | MiniMax H3 (open weights); prompts and settings are not recorded                                              | The three Dimensions mix clips, the owner's own outputs, side by side; labelled "Preview footage · MiniMax H3", since the card's recipe (LTX-2.5) did not make it ([gallery](template-gallery.md#preview-footage)). The earlier supplied clip `audio-visual.mp4` (the lotus figure, FLUX 3 image to video, the owner said on 30 October) still plays on the Neon bloom generation card and in the Genobi teaser                                                                                                                                                                                           |
| Sheet to shot (the anime teaser left the gallery 30 October)                                                         | None yet                                                                                                      | No preview clip exists; the Dimensions mix is the anime teaser ([gallery](template-gallery.md#preview-footage))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Camera first-run library, four clips                                                                                 | FLUX 3 video (closed weights)                                                                                 | Hosted runs of the studio; each clip's prompt, camera terms, settings and confirmed cost ($4.55 for the four) are in `public/media/gallery.json` ([verification](verification.md#library-clips-as-evidence))                                                                                                                                                                                                                                                                                                                                                                                              |
| Retired Director placeholders (Character intro, Outfit reveal, Poster in motion; removed from the picker 30 October) | No model                                                                                                      | Original deterministic illustrations composed in the Director ([remix verification](director-remix-verification.md#three-offline-templates-18-october))                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Scrolls example sheets                                                                                               | Closed services                                                                                               | AI-generated design sheets, six under OpenAI's terms and one under BFL's; each keeps C2PA credentials naming its generator (`LICENCES.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

Plainly: **no example video shipped in the repository is recorded as made end
to end with open-weights models.** Two recorded runs left their outputs
outside the repository; only the first ran open weights:

- **17 October, Comfy Cloud, by hand.** Comfy's LTX-2.5 two-stage inpainting
  graph changed a synthetic robot's torso, and native FLUX 3 Klein put a
  reference character into a scene that then became LTX's first frame; both
  results were imported into the Director, edited and exported
  ([remix proof](director-remix-verification.md#comfy-cloud-proof)).
- **26 October, Comfy Router.** Four LTX-2.5 Fast camera studies, imported
  into one Director project, placed by an agent and rendered to a 20-second
  MP4. Router calls Lightricks' hosted API under the LTX Model API licence, so
  this is not an open-weights run
  ([campaign](supervised-workflow-checks.md#local-campaign-evidence--26-october-2026)).

## What works

### Verified locally, dated

- 16 October: the [Dual Swords editor](dual-editor.md#verification--16-october-2026).
- 17 October: [World Builder interface and capture](world-builder-verification.md#interface-and-primitive-authoring-17-october-2026).
- 21 October: [voice mode](voice-mode.md#verification) on a local
  Qwen3-ASR-0.6B, [audio analysis](audio-analysis.md#verification), and a
  [studio-started agent session](agent-sessions.md#verification).
- 22 October: [quote and approve](agent-approvals.md#verification) against
  fakes, and the [machine check](machine-check.md#evidence).
- 24 October: [Space](media-space.md#verification--24-october-2026),
  [scene acoustics](scene-builder.md#what-was-run) and the
  [AKUSPACE Docker image](akuspace-docker.md#checked), built and checked on CPU
  with no render.
- 26 October: LTX-2.5 Fast camera studies from the Camera, and LTX-2.5 Pro and
  FLUX 3 text to video, image and edit, all through Router's API ([campaign](supervised-workflow-checks.md#local-campaign-evidence--26-october-2026)).
- 27 October: a real studio session in which the agent quoted the anime
  teaser's four shots under their ceilings; nothing was approved
  ([log](hermes-runs/2026-10-27-claude-anime-teaser.md)).
- 28 October: Hermes on DeepSeek V4.1 Flash through Nous, started from the
  gallery, probed and trimmed library clips into the audio-visual project, then
  read a
  frame note back and acted on it ([run logs](hermes-runs.md#run-cards-and-logs)).
- 29 October: the [Falling room](falling-room.md#what-was-run-29-october-2026)
  free half end to end (bundle out and back in), with a stand-in runner and the
  Genobi CLI linking the project and sending the take, and the
  [World Builder nodes](capabilities.md#world-builder-nodes-in-comfyui) on a
  local ComfyUI.

- 30 October: external ComfyUI GPU runs of Three.js capture → local Klein
  → LTX-2.5 Layout-to-Render, CPU room reverb in the graphs, and separate
  AKUSPACE i2v/audio experiments ([evidence](adaptive-reverb-proof.md)).

The 26 October campaign recorded two failures, not resubmitted in that
campaign: Comfy Cloud rejected the open Klein workflow's model filename, and
Acoustic Space returned success with no output. The later external GPU
success does not establish that those Cloud routes have been repaired.

### Deployed behaviour

- The earlier hosted studio on Cloudflare Pages made the four library clips
  with real FLUX runs, recorded on the [verification page](verification.md#paid-provider-calls)
  (current as of 22 September 2026) without a dated section, so the capability
  map calls it implemented.
- A hosted browser smoke of the Director on 17 and 18 October imported a
  generated clip, edited the title and rendered an MP4 in the browser; not a
  fresh hosted generation
  ([remix verification](director-remix-verification.md#hosted-browser-smoke-and-deferred-api-acceptance)).
- This snapshot has no verified deployment. Production deploys from a push
  to `main` of this repository, after an approval on the `production` environment
  ([Cloudflare](cloudflare.md#deployment)).

### Implemented, not yet shown working

The capability map records studio-route status; external ComfyUI proof does
not automatically verify those adapters. The 30 October evidence above
supersedes older GPU-run statements for the external workflow only.
The capability map lists every feature marked implemented. The ones that
carry the entry: the house templates and the anime teaser, the Falling room's
Klein still, the open LTX-2.5 and Acoustic Space workflows, Klein, MiniMax H3
and Music 3, FLUX 3 image to video and the video upscaler, the run location,
the Editor timeline, motion effects and MP4 export, Scrolls, Arena, live World
sessions, the Openjutsu swap, Hermes on a local model server, and setup's
Connect step.

## Intention and vision

Make studio-quality video with tools you can own: every model downloadable and
runnable locally through Comfy, Comfy Cloud standing in for a GPU you do not
have, premium models and agents as a choice, and an agent that works the same
project you do and never spends without asking. The whole of it is in
[the vision](vision.md).
