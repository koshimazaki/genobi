---
tags: [vision, 3d, sound, agents]
summary: What Genobi is for, an open-source video studio for AI ninjas, with its mission, philosophy and the story video.
---

# Genobi: vision, philosophy and pitch

Written 20 October 2026. This is the source for the app description and the
story video.

## In one line

Genobi is an open-source video studio for AI ninjas: every model, the agent and
the 3D guidance can run on your own machine, all in one interface, with paid
cloud routes as an option, not a requirement.

## The mission

Make studio-quality video with tools you can own. Higgsfield sells this as a
closed product; Genobi offers the same kind of workflow in the open, where you
can download each model, run it locally and change how it works.

## What open source means here

Every model can sit on your own machine, and the core pipeline can run
without the internet:

| Stage           | Open model or tool                                                        | Runs locally |
| --------------- | ------------------------------------------------------------------------- | ------------ |
| Images and edit | FLUX 3 Image Klein, with box-guided edits on the image you drop           | Yes          |
| Video           | LTX-2.5, with LTX camera control                                          | Yes          |
| Sound           | AKUSPACE: reverb-conditioned LTX                                          | Yes          |
| 3D guidance     | The Three.js set and camera, captured as the first frame or path          | Yes          |
| Agent           | Hermes, running an open model such as Qwen                                | Yes          |
| Editing         | Director timeline, the Editor, Dual Swords frame editor, local MP4 export | Yes          |

**Comfy at the heart.** Open models run through Comfy in both places: a local
ComfyUI on your own GPU, or Comfy Cloud when you have no graphics card, plus
Comfy Router. The same workflow files run on either.

**Premium** is a thin layer on top for people who want it: FLUX 3 video and the
FLUX upscaler from BFL, and Claude Code as the agent. Everything else, and every
example on the open path, is made with open models and Hermes. When a model is
too big for your machine, the same open model runs on Comfy Cloud instead; a
machine check decides which.

## What you can do

- **Direct a shot in 3D.** Block the set and the camera move in the 3D builder;
  the model follows that guidance. Higgsfield has no 3D guidance that we know of.
- **Guide an image in 2D.** Drop an image, draw boxes where things should
  change, keep or move, and give each box a reference.
- **Swap a character** ([Gen-Mod](genmod.md), our Genjutsu): the person or
  face in a shot becomes the one in your reference image.
- **Remix a template in the Director** (our Katana): characters, titles,
  effects, typography and music on an editable timeline.
- **Edit on a real timeline**: move clips across tracks, trim with a live frame
  preview, align to the beat. An edit mode for agents lets you correct an
  agent's timing by hand and hand it back.
- **Edit what came back, in layers.** A take from the agent lands in the
  Editor as layers on tracks: move, trim, restack, set placement, pin a note
  to a frame. **Regenerate** sends your instruction together with every edit
  since the agent's revision, so the agent builds the next pass on your changes
  instead of over them ([Director agent tools](director-agent-tools.md)). The
  project is the shared layer: person and agent edit the same object.
- **Hear the room**: AKUSPACE gives the sound the space the camera is in.
- **Speak the model's language.** The camera panel uses BFL's own camera terms
  for FLUX and switches to LTX's wording, order and guide links when an LTX
  model is chosen; every term carries its source, and no reliability claim
  follows from a term appearing in a guide ([camera wording](camera-wording.md)).
  MiniMax H3 arrives by reference (two images on Router, or the RGB, Canny and
  Depth workflows) and takes no camera panel yet; the mapping is
  [a proposal](minimax-h3-camera.md).
- **Test models where you work.** [Arena](arena.md) compares two to four
  models or workflows on one prompt and one reference set, plays them together
  and records which you preferred and why. One confirmation covers all loads.
- **Start from a taste layer, not a blank page.** Agents reach curated
  creative libraries first, with creator, licence and conditions recorded, and
  you can browse the whole catalogue at `/taste` ([taste memory](taste-memory.md)).
  Add personal reference links and notes on the Taste page, or edit the curated
  catalogue source to contribute a library with reviewed licence metadata.
- **Pick the rights before the render.** Choose the intended reuse and a
  component policy, and each result records the sources, versions and
  conditions behind it ([licence strategy](licence-strategy.md)). A licence
  report is not legal clearance.
- **Watch the work in the deck.** The footer terminal opens as a braille
  visualiser and live log of what the studio and its agent are doing, with a
  small game while a render runs ([the Genobi deck](genobi-deck.md)). It never
  reports a number the provider did not.
- **Develop the studio itself.** Development launches a Hermes Developer,
  Claude Code or Codex session in a real terminal, watched by a read-only
  supervisor viewer, so new tools and panels can be built and tested for the
  project in front of you ([supervisor](supervisor.md)). Ask Genobi for a
  change to the studio and it starts a Developer itself, in a worktree from
  main, that leaves a diff or opens a pull request
  ([Genobi starts a Developer](agent-sessions.md#genobi-starts-a-developer)).
- **Say what you want today.** One spoken prompt in voice mode ("Signal"),
  transcribed by a local model: make the video of this, swap this, use these
  settings, use my last two picks. The agent picks the tools; you approve what
  costs money. It works from a phone too.
- **Ask your agent.** Hermes, Claude or Codex works the same tools you do,
  through the Genobi plugin, and you approve anything that costs money.

It is all one interface, and everything links together: the 3D capture becomes
the first frame, the box edit becomes the shot, the shot lands on the timeline,
and the agent can work at any step.

**Proof, not a claim.** Every example carries a card that says how it was
made: the agent and its model, every generation model, the workflow, where it
ran and on what hardware, how long it took and what it cost. The headline
examples are made with Hermes and only open models. That route is slower and
wants a big GPU (an RTX 6000 Pro or a 5090), or the same open models on Comfy
Cloud, but it is complete. Other mixes, such as a premium agent or a cheaper
Hermes model, are labelled the same way, and the gallery can show only the
all-open ones. Templates and workflow presets wear their tier in their name: **Open**
(for example Open Katana or Open Ninja: open models, and Hermes on an open
model), **Semi-open** (open generation with a premium agent or one paid step)
and **Premium**.

## Two ways to work

- **Fast.** Describe it, generate, get the output. Or let the agent do the
  whole thing in one go: first pass, then a second pass with the upscaler, at
  the size you pick (phone, social, 1080p, big screen).
- **Studio.** The interface becomes the review and curation room. You get the
  output, fine-tune it, move things on the timeline, and leave notes: "I want
  this here". Fix and generate sends all of it, with the project and its
  template, as a fix report to your agent, which compiles the fixes and makes
  the next version.

## Your agent, your choice

One global setting picks who does the work: **Open Source Local** (Hermes with
a local model such as Qwen) or **your subscription** (link Claude Code, Codex
or another service you already pay for). Later, each step can have its own
choice, for example Hermes for the whole job and Opus for the final review. The
whole app is one plugin: skills, tools over MCP and a command line, with links
to the LTX and FLUX prompt guides, so an agent can do anything the interface
can.

## 3D, motion and sound

- **Camera moves you can play.** Recorded gestures and morphing between camera
  moves in a panel like the Holodeck world builder's (each move with its live
  wave, trigger and radar), saved as presets or recorded live, and used as the
  generation's camera move.
- **Scenes the agent builds.** Primitives (and later text to CAD) for assets;
  the agent places the trees, the house and the rest, and the 3D scene guides
  the video.
- **A library of short animations.** Five-second Three.js moments (something
  falling, a reveal) that reinforce the prompt; recorded, pre-made, or made by
  the agent.
- **Clips cut to the music.** Take five seconds of the edit, add an animation,
  the prompt and the audio, trigger it on the kick with the 3D camera at that
  moment, and the generated five-second clip drops back into the main video.
- **Rooms in the soundtrack.** When the scene walks into a church at 1:15, only
  that part of the track goes through the AKUSPACE reverb LoRA and crossfades
  back in; the rest stays dry. A modulation matrix lets audio drive everything.

## Philosophy

- **Local first, cloud optional.** Every model can be yours, even offline;
  Comfy Cloud stands in for a GPU you don't have; premium is a choice.
- **Simple and complex in one workflow.** Fast for a quick result, Studio for
  craft, and the same project underneath both.
- **One project, many hands.** The person and the agent edit the same project
  with the same commands, and each can correct the other.
- **Paid actions are explicit.** A price is shown before anything is spent, and
  an uncertain submission is never retried.
- **Taste is part of the toolkit.** Agents get a curated taste layer before
  they search the web: graphics libraries (Three.js, Anime.js and p5.js today;
  Alien.js and Paper Shaders next), a few high-quality reference repos and
  examples, and house styles that look like design-studio work: stylish, not
  cheesy or viral for its own sake.
- **Repeatable.** Every good result is a template: inputs, prompts, recipe and
  reviewed output, ready to remix.

## Who it is for

AI ninjas: people who make video with AI every day, on the desktop and on the
phone, and who want their tools to be theirs.

## Why it matters to us

With the full workflow Genobi can produce video after video: promoting the app
itself, SIDKIT, digital products and other work, in many formats. It brings
together tools built over a long time: the camera director, AKUSPACE, the 3D
builder, the Dual Swords editor and the agent toolkit.

## The story video, in order

1. The problem: great AI video tools are closed and pay-per-use.
2. Genobi: one studio, open models, runs on your machine.
3. 3D guidance → box edit → character swap → Director timeline → AKUSPACE sound.
4. The agent: ask Hermes (or Claude) to do it; approve the paid step.
5. Premium when you want it; open source always.
6. "Genobi: the studio for AI ninjas."
