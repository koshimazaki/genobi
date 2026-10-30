---
tags: [wiki]
summary: The wiki home, listing every page by area, with the tag vocabulary and how agents search it.
---

# Genobi wiki

`docs/` is the project wiki: plain Markdown that renders on GitHub and opens as
an Obsidian vault. Every page is listed here once, under the area it mainly
serves. When a page lands, add it to its area in the same change.

Each page starts with frontmatter: `tags` from [the tag list](tags.md) and a
one-line `summary`. To find a page, search the tags rather than reading
everything. Agents can read [`index.json`](index.json): every page's title,
path, tags, summary and wiki links, and the pages under each tag. Through the
plugin they search and read it with the `genobi_docs` tool, which the
`genobi-studio` skill teaches: by tag (`storyboard`, `camera`), by words, or one
page by its path. After adding
or retagging a page, run `npm run wiki:index`; `npm run check:wiki` (also in CI)
fails on a page without tags or a summary, an unknown tag, a broken relative
link or anchor, a link out of `docs/` or to a missing repository file, a page
this home does not link, or a stale index.

New to the code? Read [the read-through](read-through.md) first; it follows one
user action through every layer.

## Start here

- [Getting started](getting-started.md) — choose hosted or local, connect providers and make your first edit.
- [Studio guide](studio-guide.md) — detailed controls, editors, workspaces and Taste.
- [Troubleshooting](troubleshooting.md) — workflow limitations, dated provider checks and recovery guides.

## Vision

- [Vision](vision.md) — what Genobi is for: an open-source video studio for AI
  ninjas, its mission, philosophy and the story video.

## Templates and evidence

- [Supervised workflow checks](supervised-workflow-checks.md) — complete asset-to-project acceptance and deferred project/Arena review follow-ups.
- [Dimensions mix](dimensions-mix.md) — the first mix template: a finished
  Supernatural Creatures teaser cut to the owner's track at 140 BPM, with
  Signal overlays and nothing to generate.
- [Genobi teaser](genobi-teaser.md) — the second mix template: two minutes of
  the studio in use, cut to the owner's track at 135 BPM, with Transitions.dev
  titles and reveals run unchanged and Genobi's pointer, focus and zoom recipes.
- [Bloom](bloom-teaser.md) — the third mix template, the anime teaser: the
  owner's two MiniMax H3 (open weights) takes of Bloom under a character-scan
  and surveillance look, cut to the owner's track at 140 BPM.
- [Adaptive reverb](adaptive-reverb.md) — the fourth mix template, the 3D +
  LTX template: one LTX-2.5 (open weights) + AKUSPACE LoRA take through three
  rooms, its reverb changing with each, and Acoustic Space end to end.
- [Adaptive reverb proof](adaptive-reverb-proof.md) — the 30 October runs: one
  Three.js scene guiding LTX Layout-to-Render picture and scene-derived reverb.
- [Showcase projects](director-bundle/showcase/README.md) — finished cuts kept
  version by version, with the memory behind each change:
  [Dimensions mix](director-bundle/showcase/dimensions-mix/README.md) v1 to v4,
  [Genobi teaser](director-bundle/showcase/genobi-teaser/README.md) v1 and v2,
  [Bloom](director-bundle/showcase/bloom-teaser/README.md) v1 and
  [Adaptive reverb](director-bundle/showcase/adaptive-reverb/README.md) v1 and v2;
  each version opens in the Editor from its gallery card.
- [Anime teaser template](anime-teaser-template.md) — intake, generated sheet,
  storyboard and track, two H3 shots, the cut to the beat.
- [Scrolls implementation](scrolls.md) — portable bundles, generation approval and explicit handoffs.

## Architecture

- [Architecture and the cloud boundary](architecture.md) — one API served by
  Express locally and a Pages Worker in the cloud; paid-request safety and keys.
- [Read-through](read-through.md) — one user action through `shared/`, the
  screen, the local adapter and the hosted adapter.
- [Cloudflare deployment](cloudflare.md) — Pages runtime, D1 and R2 limits,
  lifecycle, reproduction and deployment.
- [Verification](verification.md) — what has been tested and what has not.
- [Review checklist](review-checklist.md) — questions to answer from source and
  tests when reviewing a change.

## Workflows

- [LTX Layout-to-Render compatibility](layout-to-render-status.md) — exact supplied workflow, Cloud node/model availability and the remaining Three.js handoff.

- [Studio interface](studio-interface.md) — tool identity, alignment, menus and finishing controls.

- [Arena](arena.md) — compare two to four workflow results with shared playback, references and agent updates.

- [Workflow reference library](workflow-reference-library.md) — future custom nodes
  and workflow candidates, starting with MiniMax H3 loops.

- [Comfy Cloud inventory](comfy-cloud-inventory.md) — what Comfy Cloud runs
  today, what needs importing, and what stays local.
- [MP4 and LTX handoff](director-comfy.md) — clean Director export into the
  pinned LTX workflow, the Comfy Cloud adapter and node notes.
- [Run location and workflow swapping](run-location.md) — Local ComfyUI or
  Comfy Cloud, the local ComfyUI client, the template table and the local model
  map.
- [SeedVR2 open upscaler](seedvr2-upscale.md) — Comfy's core-node SeedVR2
  3B template as the open video upscaler, free on a local ComfyUI, and the
  Dimensions mix's optional upscale step.
- [Openjutsu character swap](openjutsu-swap.md) — Comfy's swap graph with a
  FLUX 3 Image Klein first frame, its Comfy deployment host and the first test run.
- [AKUSPACE ComfyUI in Docker](akuspace-docker.md) — a pinned GPU image with the
  Koshi AKUSPACE nodes and ComfyUI-LTXVideo, and its text-to-video,
  audio-to-audio and image-to-video workflows.
- [Key LTX / World Builder deployment](comfy-deploy.md) — the exact two GPU
  workflows, local CPU reverb, remote model sources and comfy-cli 1.24 commands.
- [Comfy Developer Platform deployment](comfy-deployment.md) — the pins in
  `comfy-build/` as a `comfy build` recipe, how push treats weights, and one build versus several.

## Camera

- [Camera wording and examples](camera-wording.md) — the camera terms the studio
  uses, their BFL and LTX sources, and what it does and does not claim.
- [MiniMax H3 camera wording](minimax-h3-camera.md) — what MiniMax documents
  for H3 camera direction and prompt structure, and a proposed mapping.
- [Upscaling](upscaling.md) — SeedVR2 and FLUX Video Upscale, their limits
  and payers, a long clip upscaled in 19 s parts behind one approval, and the
  commands. Model specifics: [SeedVR2](seedvr2-upscale.md).

## Director

- [Composition resolution and monitors](director-resolution.md) — output sizes,
  asset matching, Undo and the responsive Program/Finished video layout.

- [First working composer](director-working-version.md) — the Director
  composer: offline asset foundation, how to try it, rendering and verification.
- [House-style templates](templates.md) — the product video, character piece
  and audio-visual templates: inputs, tiers, shots, tracks and how to open them.
- [Falling room](falling-room.md) — the owner's generated loop: a brief, the
  World Builder's falling take, one Klein still, the room sound, an edit kept
  through a revision, and the bundle. No longer a gallery card.
- [Gallery and Camera media previews](media-previews.md) — light previews for cards;
  the originals stay for projects, watch pages and downloads.
- [Template gallery and sharing](template-gallery.md) — the first view: preview
  cards with model badges and the Open only toggle, the watch and embed pages, their link previews and headers.
- [Studio shell](director-studio-shell.md) — the approved shell: one project,
  six workspaces, Project Tools, layouts and build order.
- [Outputs into project assets](project-assets.md) — the one path every 3D,
  Dual Swords, render and saved-video output takes into the project's assets.
- [Director project copy](director-bundle/project-copy.md) — local synchronization and commands.
- [Director bundle v1](director-bundle/README.md) — the interchange format: JSON
  manifest, media files, graphics modules and their schemas.
- [Prompts and directions](director-prompts.md) — the global prompt, each
  clip's own prompt and typed shot, lens, camera and action directions.
- [Motion effects](director-bundle/motion-effects.md) — shake, transitions, a
  grade, speed lines and a styled title as registered recipes, with parameters.
- [Remix verification](director-remix-verification.md) — evidence for the
  remix proof, from automated checks to the hosted smoke.
- [Katana and Genjutsu research](director-remix-research.md) — public evidence
  and the proposed Director reconstruction.
- [Gen-Mod](genmod.md) — edit frame 0 of a take and carry it through: LTX-2.5
  workflow candidates, the recipe agents edit, and the iteration loop.
- [Dual Editor](dual-editor.md) — the browser-local two-frame workspace, its
  controls, decoding boundary and verification.
- [Dual Editor editing scope](dual-editor-editing.md) — requirements, the
  timeline contract, frame grading and next steps.

- [Editor timeline](editor-timeline.md) — the production Editor after the port: Program beside the global prompt, the transport, channel column, storyboard and direction views, pickers and what is not ported yet.

## 3D

- [Live World sessions](world-live.md) — creature motions, walking, camera control and agent recording.

- [3D camera](3d-tab.md) — ten camera plates from Holodeck's moves, curves,
  combo layers, gestures, the radar and the playblast into the Director.
- [Scene builder](scene-builder.md) — agent-built scenes as data, Load and
  Save in the 3D tab, and room acoustics from the scene's geometry.
- [Scene examples](scene-examples.md) — starter sets, characters, hybrids and LTX + AKUSPACE kits.
- [World Builder and Scene Adapter](world-builder.md) — the set-preparation tool
  beside Director, its agent contract and Comfy integration.
- [World Builder sound](world-builder-sound.md) — the Sound panel, the example
  track, the audio mod matrix and the reactive room presets.
- [World Builder acoustics](world-builder-acoustics.md) — the room's Sabine
  RT60 estimate, AKUSPACE presets and the Reverb node.
- [World Builder controls](world-builder-controls.md) — edits during Play,
  character orientation, shortcuts and the panel dock.
- [World Builder Capture panel](world-builder-capture.md) — the record button,
  format, rate and time, passes and outputs, docked or popped out
- [World Builder interface pass](world-builder-interface.md) — panels,
  controls, CAD follow-ups and verification.
- [World Builder verification](world-builder-verification.md) — working paths,
  automated checks and what is still to verify.

## Sound

- [Audio analysis](audio-analysis.md) — tempo and a fitted beat grid, a
  downbeat estimate, onsets per band, intensity and key moments on the local
  server; the optional librosa worker; `genobi_audio_upload` and
  `genobi_audio_analysis` for agents.
- [Acoustic Space](camera-wording.md#acoustic-space-akuspace) — the AKUSPACE
  LoRA on LTX-2.5 and its presets.
- [Space](media-space.md) — an AKUSPACE room on a clip's existing sound in
  timed segments, by local ffmpeg convolution; `genobi_media_space`.
- [3D, motion and sound](vision.md#3d-motion-and-sound) in the vision.

## Agents

- [Local agent supervisor](supervisor.md) — watch external agents in Development,
  with linked names and short updates in the studio terminal.

- [Hermes Creative and Developer](hermes-profiles.md) — separate, versioned
  terminal profiles for creative runs and verified repairs, with native updates.

- [Reuse a BFL Dashboard key](bfl-key-reuse.md) — explicitly connect an existing Keychain entry without exposing it.
- [Settings and activity](activity-settings.md) — optional tool history, setup review and bubble controls.
- [Hosted runner pairing](runner-pairing.md) — connect a Cloudflare studio to a local agent runner.

- [Genobi CLI](genobi-cli.md) — terminal commands over the MCP definitions, named
  connection/model profiles, shared Taste and local Dual Swords operations.

- [Agent workspace](agent-workspace.md) — one shared workspace driven by the
  built-in voice agent or the person's own harness, Genobi speech bubbles
  instead of a chat panel, and portable project memory.
- [Genobi bubble](agent-bubble.md) — compact session updates below the header
  logo, with expandable activity, Stop and a persistent avatar.
- [Genobi deck](genobi-deck.md) — the footer terminal: what is running, the
  agent log and ASCII visualisers; the MVP and the plan to grow it.
- [Teachings](teachings.md) — short fixed hints, each saying what a part of
  the studio is for, shown while nothing is running.
- [Director agent tools](director-agent-tools.md) — the agent commands over a
  Director project, tracks and timing, and the project drawer.
- [Hermes runs](hermes-runs.md) — the first agent model, the free first run
  against the read-only tools, the provenance card and the plan for the paid
  runs.
- [Teaser run kit](genobi-teaser-run/README.md) — how an agent on a weaker
  open model (Hermes on DeepSeek) recreates the Genobi teaser and repeats it
  from its own memory: the [decision table](genobi-teaser-run/decision-table.md),
  the [claim rules](genobi-teaser-run/claims.md), the verifier and the
  [run log template](genobi-teaser-run/run-log-template.md).
- [Anime teaser run card](runs/anime-teaser.md) — the first template Claude
  Code and Hermes both run: four quoted shots, the cut, price, checks and the
  replication protocol.
- Run logs, written by the session watcher:
  [watcher example](hermes-runs/2026-10-24-claude-watcher-example.md) (a fake
  studio; nothing ran) and the
  [anime teaser session of 27 October](hermes-runs/2026-10-27-claude-anime-teaser.md)
  (a real studio session: four quotes under their ceilings, nothing spent),
  and the Hermes chain test of 28 October from the gallery's Generate now:
  the [library dry run](hermes-runs/2026-10-28-hermes-audio-visual-library-dry-run.md)
  and its [review pass](hermes-runs/2026-10-28-hermes-audio-visual-library-review.md)
  (three library clips cut to one bar, a frame note read back as feedback,
  no quotes, nothing spent).
- [Voice mode](voice-mode.md) — speak a prompt from the header: local Qwen3-ASR
  transcription, the dictionary, the LED waveform and setup.
- [Voice setup](voice-setup.md) — setup's Save & set up installs voice, a
  verified model already on the machine is found and used instead of
  downloaded, and the manual path.
- [Picks and context](agent-context.md) — the recent picks and composer
  settings a session starts with, and "my last two picks" resolved to ids.
- [Agent sessions](agent-sessions.md) — the project prompt runs the person's
  own agent locally with the Genobi tools and its own browser; it never spends.
- [Agent setup](agent-setup.md) — setup's Connect step and sign-in checks,
  Hermes' open models as a list, Set up Hermes with no script or restart, and
  the environment variables.
- [Confirm before spending](agent-approvals.md) — an agent's quote appears in
  the studio with its plan and price; Approve runs it once, Decline voids it.
- [The Hermes open route](hermes-open-route.md) — Hermes runs open models only:
  the refused models and providers, every pinned route, local servers, no
  fallback.
- [Machine check](machine-check.md) — which models run on this machine and
  which on Comfy Cloud, from a local probe and each model's documented
  requirements; `genobi_machine` and the `genobi-machine` skill.
- [Capability map](capabilities.md) — every feature by where it is in the
  studio, whether it runs free and local, on a local open model, on Comfy
  Cloud or through a paid API, its models, tools, CLI verbs, skills, docs and
  status; generated from `plugins/genobi/capabilities.json`.
- [Submission dossier](submission.md) — the Open Source Higgsfield entry: how
  we read the challenge, where the innovation is, what was implemented per
  section, how the example videos were made and what is verified.
- [Tool and skill registry](registry.md) — every MCP tool and plugin skill by
  tag, with the skills that teach each tool and its docs; generated from
  `plugins/genobi/registry.json`, with a page for [the tools](registry-tools.md)
  and one for [the skills](registry-skills.md).
- [Director reference review](director-references.md) — external agent
  studios, prompts and articles, mapped to the Director pipeline.

## Credits

- [Credits and lineage](credits.md) — design lineage, licence, attributions and
  the BFL documentation the studio follows.

## Outside the wiki

[The project README](https://github.com/koshimazaki/Genobi/blob/main/README.md),
[agent instructions](https://github.com/koshimazaki/Genobi/blob/main/AGENTS.md),
[the licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md)
and [the Genobi agent plugin](https://github.com/koshimazaki/Genobi/blob/main/plugins/genobi/README.md)
live beside the code. Links to files outside `docs/` are GitHub URLs on `main`,
so they open the same way from GitHub and from Obsidian.

## Reading the wiki in Obsidian

Open `docs/` as a vault. Pages, tags and links between pages resolve there,
and the tag pane lists every tag in [the tag list](tags.md). Two differences
from GitHub:

- Links to code and other files outside `docs/` open on GitHub (`main`), not
  in the vault. `npm run check:wiki` refuses a relative link that leaves
  `docs/`, and a GitHub link to a file the repository does not have.
- Section links use GitHub's heading anchors (`page.md#some-heading`). Obsidian
  opens the page but does not jump to the section; the community GFM Heading
  Links plugin is one way to make it jump.

## Taste layer and credits

- [The taste layer: people, tools and lineage](credits/README.md)
- [VFX recipes](vfx-recipes/README.md)
- [Dark neon glitch](vfx-recipes/neon-glitch.md)
- [Surveillance subject scan](vfx-recipes/surveillance-scan.md)
- [Anime opening: generate, then edit](vfx-recipes/anime-opening.md)
- [Hologram turntable](vfx-recipes/hologram-turntable.md)
- [Licence-aware direction](licence-strategy.md)
- [Signal: construction video workflows](construction-motion.md)
- [Signal typography](motion-fonts.md)
- [crt-terminal](credits/libraries/crt-terminal/README.md)
- [svgbob (WASM)](credits/libraries/svgbob-wasm/README.md)
- [cli-spinners](credits/libraries/cli-spinners/README.md)
- [ascii-magic-art](credits/libraries/ascii-magic-art/README.md)
- [play.core](credits/libraries/play-core/README.md)
- [textmode.js](credits/libraries/textmode-js/README.md)
- [Matrix digital rain](credits/libraries/matrix-rain/README.md)
- [Alien.js](credits/libraries/alien-js/README.md)
- [Anime.js](credits/libraries/animejs/README.md)
- [Claude Animation Base](credits/libraries/claude-animation-base/README.md)
- [Geist](credits/libraries/geist/README.md)
- [GlyphCSS](credits/libraries/glyphcss/README.md)
- [Hermes Agent](credits/libraries/hermes/README.md)
- [IBM Plex Mono](credits/libraries/ibm-plex-mono/README.md)
- [Krbn](credits/libraries/krbn/README.md)
- [p5.js](credits/libraries/p5/README.md)
- [p5.brush](credits/libraries/p5-brush/README.md)
- [Paper Shaders](credits/libraries/paper-shaders/README.md)
- [PixiJS Filters](credits/libraries/pixi-filters/README.md)
- [Space.js](credits/libraries/space-js/README.md)
- [Three.js](credits/libraries/three/README.md)
- [Three Plotter Renderer](credits/libraries/three-plotter-renderer/README.md)
- [Transitions.dev / UI generation](credits/libraries/transitions-ui-generation/README.md)

- [Shared project memory and taste](taste-memory.md) — local evidence, agent checkpoints, preferences and privacy.
