---
tags: [studio, camera, director]
summary: Detailed image and video controls, workspace presets, editors, gallery behavior and Taste references.
---

# Studio guide

Start with [getting started](getting-started.md) for installation, keys and
your first edit. This guide keeps the detailed controls and workflow notes
that would otherwise overwhelm the project README.

- [Image and Edit](#image-and-edit), [Music](#music), [Gallery](#gallery-and-saved-results)
- [Director](#director-local-template-remixes), [composer](#director-composer), [Dual Swords](#dual-swords), [Arena](#arena)
- [Workspace presets](#studio-presets), [Taste and credits](#signal-and-the-taste-layer)

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
seconds and aligns frames internally. See the [workflow settings](https://github.com/koshimazaki/genobi/blob/main/workflows/ltx-2-5-akuspace-t2v.README.md)
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
unproven. See the [workflow notes](https://github.com/koshimazaki/genobi/blob/main/workflows/minimax-music-3.README.md).

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
[Controls and component contract](dual-editor.md).

## Arena

**Project Tools → Arena** compares two to four workflow results with shared playback.
Prompt, model, guide and observations open from compact chevrons. Save a preferred
take, add references and hand the comparison to the agent with **Ask agent**.
MCP/CLI agents can populate the same comparison through explicit pairing. Local
server only; model labels do not enable new generation routes. [Arena guide](arena.md).

The local **Development** tab links an optional [Hermes supervisor](supervisor.md)
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
[Director controls and verification](director-working-version.md).

The 3D Subject picker also supports the owner's **Glitch Candies creature**,
with original materials and optional local FBX motion assignments. Load the
VRM under **Creature model & motion**; model and motion files stay in the tab.
See [scene examples](scene-examples.md#glitch-candies-creature).

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
camera plates remain selectable in Ninja; see [Builder controls](world-builder-interface.md). Ninja lets
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
the [Genobi bubble](agent-bubble.md) below the header logo, with expandable
activity and Stop. Tuck it away into the avatar without stopping the session.

Gallery, the first view, uses the shared template catalogue, plays previews on
hover and opens a details panel with template, watch and embed links. See
[gallery and sharing](template-gallery.md). The header mic opens voice
mode, a thin pill with the LED waveform that transcribes on this machine and
fills the prompt; see [voice mode](voice-mode.md).

The npm package name remains `camera-director`. See [docs/credits.md](credits.md) for lineage.

## Gallery and saved results

Hide any of your cards with × and restore it later. Hiding a run does not stop it; the studio keeps checking for its result.

On the local server, finished CLI and MCP takes also appear in Camera's gallery,
labelled **From terminal** or **From agent**. **This session** shows only your
own jobs, including when you reopen an older shared take. Shared results have
their own fifty-take history window, so they do not push your jobs out of the
gallery. See [terminal takes](genobi-cli.md#takes-appear-in-the-studio).

Camera's curated Library examples follow the selected model family and mode;
your session results remain visible when you switch. Modes without curated
examples say so. Each media card keeps its model, duration or resolution and
actions on one row, using named icons when narrow. Prices remain in generation
quotes and account activity rather than the media cards.

## Director composer

Open **Director composer** at `/director` or from the studio's Editor preset.
Start with Character intro, Outfit reveal or Poster in motion. Assign media in the
prompt, swap prepared media through Assets and export without an API key. Editor
opens the same JSON, timeline, layers and text controls. Template drafts stay in page memory; save an editable ZIP
before closing. Outfit uses prepared before/after looks, not automatic garment transfer.

Use `/director?example=studio` for the mixed-media composer example with audio,
video, images, p5/Anime graphics and Three.js filters. The three house-style
templates open at `/director?example=product-video`, `character-piece` and
`audio-visual`; see [the templates page](templates.md).
The Holo-derived timeline includes a mixed-media example, image sequences,
animated text, CRT/dither treatments and downloadable project ZIPs. Preview and
MP4 rendering run locally in the browser. In the Editor, Resolution offers
540p, 720p, 1080p and Match assets, with Undo; Program and Finished video sit
side by side below the global prompt and stack in narrow panels.
See [composition resolution and monitors](director-resolution.md).

See [the working-version guide](director-working-version.md) for controls,
self-hosting, module registration and current rendering limits.

## Signal and the taste layer

Choose **Signal / Construction** for UI build, teaser and character-reveal video
compositions. **Taste & credits** introduces the creators, explains the curated
libraries and records your intended reuse for agent briefs.
[Motion workflows](construction-motion.md), [creator dossiers](credits/README.md),
and [licence-aware direction](licence-strategy.md).

Explore **[the taste layer](https://genobi.pages.dev/taste)** for visual examples, creator profiles, original
licences and an agent-readable catalogue: a code-based mood board for Genobi projects.
The page’s visual presentation takes inspiration from [Uncommon Web / Teknium](https://webdev.teknium.io/).
See [credits and provenance](credits/README.md) for the integrated, recommended
and reference libraries. Open `/taste` in your local studio or use the hosted Taste link above.
Personal selection persistence and agent context are local-studio features.

Project decisions and scoped reusable preferences are available in the local
Director under **Project memory & taste**. See [shared project memory](taste-memory.md)
for agent checkpoints, private exports and the reference-import boundary.
