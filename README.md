
# Genobi

A camera-first video studio on the Comfy Developer Platform. One camera panel writes the shot for the model you pick: LTX-2.5 (open weights, native audio) or FLUX 3, both through [Comfy Router](https://docs.comfy.org) with one Comfy key. The FLUX Video Upscale runs through Router on the same key; a BFL key still runs FLUX 3 and upscales direct.

https://github.com/user-attachments/assets/b2665e97-2836-4e02-8b38-4694a5c6b6c7


Forked from [FLUX Studio Lite](https://github.com/koshimazaki/Flux-Studio-Lite) (MIT) at `023477b`: the composer, the editable camera directions, the Three.js guide, the gallery and the job queue carry over. The camera wording follows [BFL's camera guide](https://docs.bfl.ai/guides/prompting_video_camera_terms) for FLUX 3 and the [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide) for LTX; see [docs/camera-wording.md](docs/camera-wording.md) for what the studio does and does not claim.

Open source: read the code, run it yourself, or use a hosted copy. Not affiliated with Comfy, Lightricks or Black Forest Labs.

**Where it is going:** [the vision](docs/vision.md) (an open-source video studio for AI ninjas, every model and the agent runnable locally, premium routes optional).

**Acoustic Space** puts the sound of a room, an open space or an effect into an LTX-2.5 clip with the AKUSPACE LoRA. It runs as a Comfy Cloud workflow with the visitor's Comfy key, so it is registered as its own entry and needs the LoRA imported into that key's Cloud library; see [camera wording](docs/camera-wording.md#acoustic-space-akuspace) for what it does and does not claim.

## Image and Edit

**Workflow features:** Klein bounding-box layouts and full-input Recreate restore
the creative setup alongside the existing camera, reference and editing tools.

Choose FLUX → **FLUX 3 Image Klein** for stills with bounding-box layouts.
**Bounding boxes** beside Camera controls opens the existing canvas: draw,
move or resize a box, then select its label to describe what belongs there.
Shift-drag draws overlapping boxes; arrow keys nudge the selection; Delete
removes it. The controls use the studio's existing colours and compact labels.
Boxes appear only for Klein (Open workflow or API); switching to another model
parks them and omits them from the request. Boxes guide placement, not masks.

Image and Edit accept references where the selected run supports them. In Edit,
drop a PNG, JPEG or WebP onto the hero canvas to set the source. References need
both sides at least 256 pixels, at most 16 megapixels, and are limited here to
5 MB each and approximately 11 MB combined. New runs keep their input images
in this browser so Recreate can restore the source and ordered references after
reload. Inputs are retained for up to 30 days, 50 runs or 64 MiB, whichever limit
is reached first. Browser storage can be cleared or unavailable; older runs whose
inputs were not saved ask for reattachment. Video source/guide files still follow
server media retention. Generation uses the selected BFL, Comfy or local route.
Image outputs appear in the gallery and download in their actual format.

In the studio gallery, **Send to Director** (the plus icon beside each ready
result or example) copies that media into the open project's production
assets and opens Assets, saying whether it was added or already there, with
Undo. It does not place a timeline clip or change the
3D scene. Save the project to keep its imported media with the project bundle.
**Recreate** restores the saved prompt, settings, source and ordered references,
plus editable Klein boxes for new runs. Image results remain in the main preview;
Edit restores its original source. **Arrange layout** on Klein returns to drawing boxes; the preview
does not silently become a reference image. Camera generates directly with the
selected model and settings. Use a result's **Upscale** action when needed;
there is no Fast/Studio mode or automatic finish-resolution step.

All FLUX image entries (Klein, Image and Edit) share the camera panel for shot
size and angle. The colored camera sentences below the prompt match the text
sent to the provider; stills never send movement. Prompts accept up to 12,000
characters, including any layout instructions. A compact reference grid keeps
room for the prompt: click a thumbnail to enlarge it, or use the persistent
Add/drop tile (up to ten references). Klein's API accepts optional references
in Image mode; the current open text-to-image graph still does not. Edit mode
requires a source and a nonempty instruction; it is not an unchanged pass-through.

The minus button on a project asset removes an unused asset from that project,
with Undo until another project edit intervenes. Assets used by a layer, plan,
generation or project prompt must be detached first. The original generation
remains in the gallery.

H3 and FLUX image-to-video keep a wider reference area beside the prompt. The
H3 OmniRef entries put their two image slots and video guide side by side; H3
on Router shows the two slots (character sheet, storyboard) and no guide.
Reference guidance expands on demand. Prompts stay at a readable size, grow automatically, then scroll.
Drag the grip below the prompt to resize it, or focus the grip and use Up/Down.
Double-click or press Home on the grip to restore automatic sizing.

LTX and FLUX have no Fast/Studio mode switch. LTX Router presets show exact
API dimensions (landscape or portrait; Pro up to 1080p). For square, 2:1 and
other shapes, choose **LTX-2.5 · Open workflow** or **Acoustic Space**. Their
pixel presets snap to the graph's required dimensions and show the actual
width × height. Duration is converted to `8n+1` frames at 24 fps: 8 seconds
uses 193 frames (about 8.04 seconds encoded). Router keeps its own supported
seconds and aligns frames internally. See the [workflow settings](workflows/ltx-2-5-akuspace-t2v.README.md)
for geometry and verification limits.

## Music

MiniMax Music 3 sits under the **H3** family switch, as one of its models
(generator `audio`, menu row "MiniMax Music 3 · Text to music"); choosing H3
still lands on its video model. It runs Comfy's
official open graph on Comfy Cloud or a local ComfyUI, on a Comfy key. Write
a caption, optional lyrics with section tags, and a length up to two minutes;
each Generate makes one candidate with its own seed (an agent quotes each). A finished song plays
in the gallery, can be added to a Director project as an audio asset, and
carries the "MiniMax-Music3" credit its licence asks for. A changed lyric is a
different request for replay. Music runs in the local studio only: the hosted
studio does not list it, and its Worker refuses it (`audio_local_only`)
before any quote. No song has been generated yet, so the route is wired but
unproven. See the [workflow notes](workflows/minimax-music-3.README.md).

## Known issues — 26 October 2026

**3D → LTX Layout-to-Render.** The exact supplied graph needs a LoRA absent
from the authenticated Cloud model catalogue and includes an optional
`GemmaAPITextEncode` branch whose node is not advertised there. The other
execution nodes and base model files are present. Three.js capture is available;
the complete driver + look-image → generation → project handoff is not wired
yet. See the [exact workflow audit](docs/layout-to-render-status.md). The plain
LTX Open workflow entry is text-to-video and does not provide this control.

**Klein 3 on Comfy Cloud.** Comfy provides FLUX 3 Klein text-to-image and
image-edit templates; these are still-image workflows, not video models.
During our authenticated Cloud API check, all node types in those templates
were advertised, but their Klein Base diffusion weight and two Qwen encoder
filenames were absent from the model dropdowns. Our existing distilled graph
also names a diffusion file absent from that response. This is an unresolved
API catalogue/availability discrepancy, not a claim that Klein 3 or its Comfy
templates do not exist. Recheck the intended Cloud account before a demo;
template presence alone does not verify API execution. Base and distilled
templates use different sampling settings, so changing a filename alone is
not a verified fix.

For image generation, select **FLUX 3 Image Klein → Run → API** with a connected
BFL key to use the existing direct BFL route. It keeps the selected shot size
and angle, omits camera movement, and charges the BFL account separately from
Comfy credits. Switching is explicit: an uncertain or failed Cloud submission
must not trigger an automatic paid retry on BFL. Klein's supplied image-edit
template is not yet connected to the app's open-workflow upload path; the
app's Edit mode currently runs FLUX 3 Edit.

The direct Klein image API fallback was verified on this date with three
native 2K stills: all returned 2736 × 1536 images, downloaded successfully and
decoded without errors. The submitted prompts retained shot size and angle
and contained no camera movement. This does not verify the Cloud workflow or
Klein image editing.

## Dual Swords

Choose the **Dual Swords** preset to compare two videos and export exact frames
as full-resolution PNGs in a fixed side-by-side pair. Frame position starts open;
Luma distribution folds separately. Open the Assets drawer to reuse Director library,
session and locally opened videos. Frame stepping uses indexed timestamps,
including variable-frame-rate clips. Edit frame opens reversible grading, RGB
curves and optional local background removal. Timeline assembles two-track edits
with trims, split/delete, source audio and native-resolution MP4/WebM export.
Lossless source copy preserves compatible cuts; exact cuts and mixed sizes have
an explicit high-quality re-encode option, with native padding or scale-to-fit. Space plays/pauses;
Backspace/Delete removes the selected timeline section.
[Controls and component contract](docs/dual-editor.md).

## Arena

**Project Tools → Arena** compares two to four workflow results with shared playback.
Prompt, model, guide and observations open from compact chevrons. Save a preferred
take, add references and hand the comparison to the agent with **Ask agent**.
MCP/CLI agents can populate the same comparison through explicit pairing. Local
server only; model labels do not enable new generation routes. [Arena guide](docs/arena.md).

The local **Development** tab links an optional [Hermes supervisor](docs/supervisor.md)
with live Hermes session messages. Its compact header opens Hermes, Claude Code
or Codex in a native macOS Terminal with the supervisor role loaded. Give tasks
and reply there; the live viewer links automatically. It can also be started
separately with `npm run supervisor`.

## Director: local template remixes

Open Director for Character intro, Outfit reveal or Poster in motion. Normal
and advanced mode share one project, edits and Undo history. **Project media**
separates Assets from Inspirations: import files first, then choose a slot or
layer explicitly. The drawer also works as a phone-sized sheet. Local media
placement, text edits and MP4/ZIP export need no API key; model-based character
swapping is a separate generation step. Save the editable ZIP before reload;
automatic recovery and shared state across every studio tool are still planned.
[Director controls and verification](docs/director-working-version.md).

The 3D Subject picker also supports the owner's **Glitch Candies creature**,
with original materials and optional local FBX motion assignments. Load the
VRM under **Creature model & motion**; model and motion files stay in the tab.
See [scene examples](docs/scene-examples.md#glitch-candies-creature).

## Studio settings

The key icon opens a wide settings panel. **Studio setup** chooses Local ComfyUI,
Comfy Cloud or Both; Both combines local open workflows with cloud API models,
without automatic cloud fallback. Running the Genobi client locally is independent
of using cloud models. The hosted client keeps Comfy Cloud for workflows.
The model menu's **Local** tick, beside Open only, sets the same choice (ticked
is Both), and tags under the selected model say where the next run goes
("Open weights · Local ComfyUI", "API · Comfy Router"); see [run location](docs/run-location.md).

**BFL key** is a separate section: a connected BFL key overrides compatible FLUX
API models and upscales; Comfy-only models keep Comfy. Remove the saved BFL key to
return compatible models to Comfy. Hosted visits keep one key in page memory at a
time. Agents/hosted pairing and Activity/display each expand separately. Ninja’s
gear beside its preset controls only the layout.

## Studio presets

Genobi opens on a video-first Gallery, then brings Camera, Director, Editor, 3D, Dual Swords and Ninja into one
workspace. Genobi welcomes you on the first visit; reopen setup from the Genobi activity
bubble. The question mark in the header opens a quick studio guide. The book beside the mic opens Taste, the reference wiki for visual
examples, recipes, creator credits and licences, in a separate tab. All references
start included for agents; uncheck any or add custom links to build your own Taste
layer. The local studio saves this selection privately. Browse interactive examples
directly in each card, with creator credits and a compact link to Teknium’s Uncommon Web.
Camera keeps its generation library below the composer, with project Assets and
Inspirations in the side rail. Preset changes rearrange the existing panels with reduced-motion
support; edits, frame selections and the 3D set survive switching. The 3D preset opens one Builder viewer with scene and
character menus and a compact Camera / Sound / Scene / Capture inspector. Advanced
camera plates remain selectable in Ninja; see [Builder controls](docs/world-builder-interface.md). Ninja lets
you choose panels, drag them into order and set half/full widths. Save layout
remembers the arrangement in this browser; Download JSON and Load JSON make it
portable. Arrow controls also move panels, and phones stack them in saved order.
Director puts a large prompt between the preview and media trays, with Character,
Style and Add reference controls; templates sit below the workspace.
Editor opens the same document’s timeline. Kept Dual Swords frames and 3D first
frames are imported into the current Director project’s Inspirations. These
are local session assets: save the editable bundle before reload. Template
drafts remain separate; cross-template asset pooling and the full
generation-result/revise flow remain planned. A saved Ninja layout contains
only panel preferences; save project media with the editable bundle separately.
The Project tools
panel runs explicit JSON commands. A local project-prompt session reports through
the [Genobi bubble](docs/agent-bubble.md) below the header logo, with expandable
activity and Stop. Tuck it away into the avatar without stopping the session.

Gallery, the first view, uses the shared template catalogue, plays previews on
hover and opens a details panel with template, watch and embed links. See
[gallery and sharing](docs/template-gallery.md). The header mic opens voice
mode, a thin pill with the LED waveform that transcribes on this machine and
fills the prompt; see [voice mode](docs/voice-mode.md).

The npm package name remains `camera-director`. See [docs/credits.md](docs/credits.md) for lineage.

## Live demo

Try the live version at **[genobi.pages.dev](https://genobi.pages.dev)**. Explore four library clips without a key, or connect your own BFL key to generate. Keep the tab open until your clip is saved.

Hide any of your cards with × and restore it later. Hiding a run does not stop it; the studio keeps checking for its result.

On the local server, finished CLI and MCP takes also appear in Camera's gallery,
labelled **From terminal** or **From agent**. **This session** shows only your
own jobs, including when you reopen an older shared take. Shared results have
their own fifty-take history window, so they do not push your jobs out of the
gallery. See [terminal takes](docs/genobi-cli.md#takes-appear-in-the-studio).

Camera's curated Library examples follow the selected model family and mode;
your session results remain visible when you switch. Modes without curated
examples say so. Each media card keeps its model, duration or resolution and
actions on one row, using named icons when narrow. Prices remain in generation
quotes and account activity rather than the media cards.

<div align="center">
  <video src="https://github.com/user-attachments/assets/e50be815-ec5b-441d-959f-c85aac24f37d" width="640" autoplay loop muted></video>
  <em>FLUX 3 Studio Lite Camera Control </em>
</div>

## Run locally

For supervised creative work alongside repairs, install the separate
[Hermes Creative and Hermes Developer profiles](docs/hermes-profiles.md).
Their role instructions and skills live in the repository and can be updated
from Hermes after review.

Requires Node 22+. Optional: `ffmpeg` and `ffprobe` on `PATH` (or `FFMPEG_PATH` / `FFPROBE_PATH`) for the local media tools — trim, frames, join and crossfade; everything else runs without them. Voice mode also needs a local Qwen3-ASR worker; see [voice mode](docs/voice-mode.md).

```sh
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

One Comfy key runs all generation: partner and hosted models through Comfy Router, open workflows through Comfy Cloud. On a Mac, enter it in the connection dialogue and the local server saves it in your login Keychain (service `Genobi`); the page never sees it again, only that it is connected. A BFL key is optional: when connected it takes over the FLUX API models it can run and the upscale (see **BFL key** above), and it is the only way to run FLUX 3 Image Klein's API; LTX and Comfy Cloud workflows stay on the Comfy key. `COMFY_API_KEY` and `BFL_API_KEY` in the server environment still work and take precedence; without a Keychain (Linux, Windows) they are how the server keeps a key. A key from the environment is treated as the studio's demo key and held to the demo budget (three runs a session, $5 a day); a key you save in the Keychain spends your own credits and is not. Your agent signs in through its own setup (Claude Code's `/login`, Hermes's `hermes model`); Genobi stores no agent key and only shows whether one is found. No Cloudflare account is needed locally, and the local server binds to loopback only, including `npm run dev`'s hot-reload socket on the next port (`server/dev-server.ts`). `npm test` and `npm run build` are the other two commands worth knowing.

## What makes it different

**Camera guidance you can explore.** An interactive panel pairs editable camera directions with an educational Three.js diagram of shot size, angle and movement. Its terminology follows [BFL’s camera prompting guide](https://docs.bfl.ai/guides/prompting_video_camera_terms); the studio turns each selection into a colour-coded prompt clause you can refine before generating. The diagram illustrates camera concepts, not a prediction of the result.

**A library that takes itself apart.** Every clip on the first screen is a real run of this studio, shipped with the prompt, camera terms, settings and provider-confirmed cost that produced it. Click a title to reuse its prompt, or Recreate to restore the whole setup and change one thing; either way that clip moves to the main view, so the scene you are editing is the scene you are looking at. Switching to Upscale picks up your newest generation — or whichever clip you choose to improve — and shows it above the composer, so improving what you just made takes one click.

**A visitor's key is never stored.** On the hosted studio, a key lives in page memory and is sent as a header when needed — never to sessionStorage, localStorage, IndexedDB, cookies, caches, job files, media or logs. Reloading disconnects it. Session ownership is a random HttpOnly cookie, not an account.

## Settings and activity

Open **Settings** from the header for provider connections, workflow location,
agent setup guidance, optional tool history and bubble behavior. Both optional
logging/display checkboxes start off. Closing the Genobi bubble never stops a
run. Activity records identify tool outcomes and actual backends where known;
job receipts and replay protection remain independent. See
[settings and activity](docs/activity-settings.md) for coverage and privacy.

Setup ends by starting the configured local agent as one Genobi session, after
voice connects when it was ticked; its brief does not install software or
authorize generation. Hermes authenticates outside Genobi. Hosted Settings can
[pair an existing local runner](docs/runner-pairing.md), start a typed session and
show its progress in the bubble. The [Openjutsu character swap](docs/openjutsu-swap.md)
runs on its own Comfy deployment with the Comfy key, its first frame made by a
FLUX 3 Image Klein box edit.

## Licences

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
(`.local/agent.json`, see [agent sessions](docs/agent-setup.md));
`GENOBI_AGENT_RUNNER` still wins. The summary's **Save & set up** (or **Save &
start Genobi**) saves, installs voice when ticked (using a verified
Qwen3-ASR already on the machine instead of downloading it), then starts that
agent in the Genobi bubble; when it cannot start, the summary says why and offers **Sign
in** instead ([voice setup](docs/voice-setup.md#setup-ends-by-starting-the-agent)).
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

Original Genobi code is MIT ([`LICENSE`](LICENSE)). Third-party code, including the Transitions.dev construction effect, and models retain their own licences; see the component notices in [LICENCES.md](LICENCES.md). Commercial use of a model, or of what it generates, needs a commercial licence from that model's owner wherever its terms say so. FLUX 3 Image Klein limits commercial use of its outputs to people and companies under US$5M annual revenue; LTX-2 and LTX-2.x, including LoRAs trained on them such as AKUSPACE, need a paid Lightricks licence from US$10M. [LICENCES.md](LICENCES.md) lists every model, program and asset with its terms, and [LICENCES-npm.md](LICENCES-npm.md) every npm dependency.

## Documentation

- [Licences](LICENCES.md) — models, software, assets and outputs, with the terms of each
- [Architecture](docs/architecture.md) — the cloud boundary, how paid requests are made safe, and what this deliberately does not do
- [Verification](docs/verification.md) — what is tested, and what is not
- [Credits](docs/credits.md) — lineage, attributions, and the BFL documentation this follows

Working on the code, as a person or an agent? Start with [AGENTS.md](AGENTS.md).

## Director composer

Open **Director composer** at `/director` or from the studio's Editor preset.
Start with Character intro, Outfit reveal or Poster in motion. Assign media in the
prompt, swap prepared media through Assets and export without an API key. Editor
opens the same JSON, timeline, layers and text controls. Template drafts stay in page memory; save an editable ZIP
before closing. Outfit uses prepared before/after looks, not automatic garment transfer.

Use `/director?example=studio` for the mixed-media composer example with audio,
video, images, p5/Anime graphics and Three.js filters. The three house-style
templates open at `/director?example=product-video`, `character-piece` and
`audio-visual`; see [the templates page](docs/templates.md).
The Holo-derived timeline includes a mixed-media example, image sequences,
animated text, CRT/dither treatments and downloadable project ZIPs. Preview and
MP4 rendering run locally in the browser. In the Editor, Resolution offers
540p, 720p, 1080p and Match assets, with Undo; Program and Finished video sit
side by side below the global prompt and stack in narrow panels.
See [composition resolution and monitors](docs/director-resolution.md).

See [the working-version guide](docs/director-working-version.md) for controls,
self-hosting, module registration and current rendering limits.

## Signal and the taste layer

Choose **Signal / Construction** for UI build, teaser and character-reveal video
compositions. **Taste & credits** introduces the creators, explains the curated
libraries and records your intended reuse for agent briefs.
[Motion workflows](docs/construction-motion.md), [creator dossiers](docs/credits/README.md),
and [licence-aware direction](docs/licence-strategy.md).

Explore **[the taste layer](/taste)** for visual examples, creator profiles, original
licences and an agent-readable catalogue: a code-based mood board for Genobi projects.
The page’s visual presentation takes inspiration from [Uncommon Web / Teknium](https://webdev.teknium.io/).
See [credits and provenance](docs/credits/README.md) for the integrated, recommended
and reference libraries. The local route is `/taste`; the live demo gains it only
after a separate deployment.

Project decisions and scoped reusable preferences are available in the local
Director under **Project memory & taste**. See [shared project memory](docs/taste-memory.md)
for agent checkpoints, private exports and the reference-import boundary.
