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

Genobi is an open-source video studio for AI ninjas: the kind of workflow
Higgsfield sells as a closed product, rebuilt so that the models, the agent
and the 3D guidance can run on your own machine through Comfy, with paid cloud
routes as an option rather than a requirement. One interface links a World
Builder that turns a Three.js set and camera move into colour, depth and sound
guidance, a camera panel that writes each model's own prompt language, FLUX 3
Image Klein box edits, LTX-2.5 with our AKUSPACE acoustic-space LoRA so the
soundtrack carries the room, a frame-accurate Editor timeline and the Dual
Swords frame editor, all over one editable project that exports as a bundle.

It is built for agents as much as for people. The studio's operations are 44
MCP tools, a terminal CLI and 17 skills, with a capability map that tells an
agent what runs free on the machine, what needs a local open model, what runs
on Comfy Cloud and what costs money. Hermes, held to open models, or the
person's own Claude Code, works the same project the person edits, reads their changes
back before its next pass, and spends nothing until the person approves a
quote. The repository says what was verified and on which date, what is only
built, and how each example was made: https://github.com/koshimazaki/Genobi

## How we read the competition

The challenge facts below are the ones this wiki recorded when it read the
official pages; nothing here is a rule we inferred.

- **Categories.** Comfy's revised brief of 15 October (page checked 16
  October) has two main categories, **Most Innovative** and **Most Viral**,
  alongside **Open Weights Only**, plus model-provider bonus categories; its
  FAQ says an entry can be considered for a main category and a provider
  bonus. Winning several main prizes or several bonuses is not established.
  The Most Viral rule text is "delightfully shareable".
- **Open Weights Only.** It excludes partner nodes and APIs. A Comfy
  team member confirmed on 19 October that non-commercial weights such as
  LTX-2.5 qualify, and so do regionally restricted ones such as H3: "the only
  thing that matters is that you can download the models and run them
  locally". So for this category
  the open path is a Comfy workflow of an open model, on a local ComfyUI or on
  Comfy Cloud; an open model called through Comfy Router is still an API call.
  The capability map marks every route and every model's weights for this
  reason.
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
- **App requirements**, as the official page listed them on 19 October:
  built with the Comfy Developer Platform (Router and/or SDK); an open-source
  licence and enough setup detail to run it locally; other tools explained in
  the demo video; lawful, SFW, no unlicensed IP or likenesses; permission for
  the sponsors to feature the work; one submission per person. The full page,
  checked 16 October, also asks for a demo of at most two minutes, workflows
  and local setup instructions in the repository and a social post tagged
  `#OpenSourceHiggsfield`, and encourages a hosted link.

## Where the innovation is

What we read as new is not one model but the links between the parts, each of
which an agent can drive. The edge is volume and combination: each part below
is new on its own, with its own interface, and together they make a studio
that is both practical and new:

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
- **The whole Comfy platform.** Comfy Cloud, a Developer Platform deployment
  and Comfy Router inside the studio, alongside BFL's API, chosen per
  workflow ([run location](capabilities.md#run-location-and-workflow-swap)).

The five links below are where those parts meet.

1. **3D guidance with its acoustics.** The [World Builder](capabilities.md#world-builder-sets-and-capture)
   captures a set and camera move as colour and depth frames and the take's
   sound (verified 17 October). Its [Comfy nodes](capabilities.md#world-builder-nodes-in-comfyui)
   read the room's geometry, compute RT60 from its materials and name the
   AKUSPACE preset LTX should use, and convolve a voice with the same room
   (run once on a local ComfyUI on 29 October, no GPU model involved). The
   [scene builder](capabilities.md#scenes-as-data-and-room-acoustics) maps
   agent-built rooms to those presets (verified 24 October). Feeding a capture
   into LTX through Layout-to-Render is [planned](capabilities.md#layout-to-render-from-a-world-builder-take);
   the adapter is not in the Comfy Cloud catalogue yet
   ([status](layout-to-render-status.md)).
2. **AKUSPACE sound.** Our LoRA on LTX-2.5 generates the shot's sound in the
   room it is set in ([Acoustic Space](capabilities.md#ltx-25-open-workflow-and-acoustic-space),
   implemented). [Space](capabilities.md#space-an-akuspace-room-on-existing-sound)
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

The camera panel is the part no other tool has. A camera choice is written
into the prompt in the wording each model's own documentation asks for, and
the same wording goes into the studio's requests and into the ComfyUI
workflows (`composePrompt` writes it for both adapters). Each guide was read
and is cited, with the date checked, in [camera wording](camera-wording.md):

- **FLUX 3 image and FLUX 3 video** follow BFL's camera prompting guide. The
  Three.js diagram beside the panel illustrates each shot size, angle and move.
- **LTX-2.5** follows the LTX-2.5 prompt guide. The World Builder's 3D scene
  adds guidance for composition and camera beyond words; feeding a capture
  through Layout-to-Render is
  [planned](capabilities.md#layout-to-render-from-a-world-builder-take).
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
  and Nous routes call hosted APIs and do not count, whatever the model's
  licence; the capability map marks them `api`. These workflow routes are implemented; none has a dated successful
  run inside the studio yet (see [what works](#what-works)).
- **LTX bonus.** LTX-2.5 is the core video model of three house templates
  ([templates](capabilities.md#product-video-character-piece-and-audio-visual))
  and of [Acoustic Space](capabilities.md#ltx-25-open-workflow-and-acoustic-space);
  the camera panel speaks the LTX prompt guide's wording.
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

The same 26 October campaign recorded two failures, not resubmitted: Comfy
Cloud rejected the open Klein workflow's model filename, and Acoustic Space
returned success with no output.

### Deployed behaviour

- The earlier hosted studio on Cloudflare Pages made the four library clips
  with real FLUX runs, recorded on the [verification page](verification.md#paid-provider-calls)
  (current as of 22 September 2026) without a dated section, so the capability
  map calls it implemented.
- A hosted browser smoke of the Director on 17 and 18 October imported a
  generated clip, edited the title and rendered an MP4 in the browser; not a
  fresh hosted generation
  ([remix verification](director-remix-verification.md#hosted-browser-smoke-and-deferred-api-acceptance)).
- This snapshot has no verified deployment. Releases are run by hand after
  checking D1 migrations ([Cloudflare](cloudflare.md#deployment)); nothing in CI deploys.

### Implemented, not yet shown working

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
