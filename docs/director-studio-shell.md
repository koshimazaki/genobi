---
tags: [director, studio, plan]
summary: The approved Genobi studio shell, with one project, six workspaces, Project Tools, layouts and build order.
---

# Genobi studio shell: approved next build

Approved 18 October 2026 after the interactive preset mockup; naming and work
ownership confirmed 19 October 2026. This followed
the offline Director store and asset drawer at `100e0d6`. Reuse the working
components and preserve Director's established design more faithfully than the
mockup. The prototype proves an interaction direction, not production integration.

## One project, six workspaces and Project Tools

| Preset        | Main work                                                                  | Media                                                  |
| ------------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| Gallery       | Finished template cards, filters and details                               | Optional right Assets rail                             |
| Camera        | Existing camera/model composer and preview, with generation library below  | Right Assets / Inspirations rail                       |
| Director      | Preview left, large prompt with inline references                          | Right Assets / Inspirations / Library; templates below |
| Editor        | Composition, timeline, layers and inspector; vertically resizable sections | Collapsible right Assets rail                          |
| 3D            | Separate camera viewer and folding controls, plus World Builder            | Right Assets rail                                      |
| Dual Swords   | Existing A/B frame tools, adjustments and capture                          | Right Assets rail; Assets button last                  |
| Project Tools | Optional workflows and JSON / agent commands                               | Right Assets rail                                      |
| Ninja         | User-selected panels, without the old template/headline/shots form         | Independent asset and inspiration panels               |

Gallery is the default: `/` opens it, while a `?job=` link opens Camera (see
[template gallery](template-gallery.md)). Direct template links open Director
in the same shell. Voice is in the header of every preset, not in a preset of
its own ([voice mode](voice-mode.md)).
Existing `/director`, `/dual-editor`, `/world-builder` and `/scene-adapter` entry
links select their matching preset rather than create competing project owners.
Keep internal preset IDs independent of display names and branding.

The first visit shows Genobi’s optional setup welcome. Its dismissal stays in
this browser; blocked storage falls back to showing the welcome next visit.
Reopen setup from the Genobi activity bubble. Closing it preserves the requested
workspace, including direct links. The header’s question mark opens a separate
quick guide on demand, without stored dismissal state. Its Open Camera action
is explicit and never generates.
The book immediately left of the mic opens the standalone `/taste` reference
wiki in a separate tab, preserving the studio. It replaces the floating Taste
link and stays outside the tool dock. Camera's generation library remains in
its main column even when Assets is closed; the rail has Project and
Inspirations. Other workspaces retain their Library tab and Ninja's independent
Gallery panel. Stable gallery hosts move between these destinations without
recreating the gallery's state.

Ninja means the custom workspace in this shell. Earlier “3D Ninja” planning refers
to the 3D capability; it does not add a seventh tab or rename World Builder's
internal APIs. The first Ninja slice selects panels and keeps that selection
through mode changes. Fine sizing, the browser's working layout and named
[saved layouts](#saved-personal-layouts-22-october-2026) are described below;
per-project layout profiles remain a later increment.

## Reuse and ownership

| Existing code                                                                                            | Integration responsibility                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/App.tsx`, existing composer, camera/model controls and gallery                                      | Preserve Camera behavior; extract bounded embeddable sections only where necessary                                 |
| `src/studio/store.ts`, `commands.ts`, `useStudio.ts`                                                     | Extend the current owner with preset/layout state and shared asset references; retain revisions and command checks |
| `src/director/Director.tsx`, `RemixPanel.tsx`, `DirectorStage.tsx`, `Timeline.tsx`, `LayerInspector.tsx` | Supply Director simple/result views and the Editor preset over the same document                                   |
| `src/director/ProjectAssetDrawer.tsx`                                                                    | Reuse production/reference roles, import and explicit placement; adapt presentation to the shell                   |
| `src/dual-editor/DualEditor.tsx`                                                                         | Embed the existing editor; connect its capture callback to shared assets; retain A/B state when hidden             |
| `src/world-builder/WorldBuilder.tsx`                                                                     | Preserve scene/camera state and bridge captures into shared assets; suspend hidden rendering                       |
| `src/main.tsx`                                                                                           | One shell with a small preset map and compatible entry links                                                       |

Do not copy the mockup's simulated generation, comparison or capture handlers
into the app. Keep real job state and resource lifetimes outside disposable
layout panels. Lazy-load heavy tools, then preserve their state across switches;
pause inactive playback/rendering without cancelling jobs or discarding edits.
The existing store owns Director, but Camera, Dual Editor and Builder still need
explicit integration. Existing components do not make those seams complete.

## Director starts simple

Keep the current typography, theme tokens and shared project. Director shows the
preview on the left, the prompt in the centre and the shared Assets rail on the
right. The old headline/input form is hidden, including in Ninja. Templates stay
below. Gallery's Make your own opens the existing template media so the user can
swap it through the asset drawer.

Character, Style and Add open the project reference picker. Typing `add`, `add
car`, `add style`, or `@` opens suggestions beside the caret without taking typing
focus. Down enters suggestions, arrows navigate, Enter inserts and Escape closes.
References are inline thumbnail chips; clicking one swaps its binding while
preserving the surrounding words. They serialize to the existing brief-v1 labels
and files, with no project-format change.

Character and Style accept project image drags and local image files; the prompt
also accepts videos. Imports and binding changes commit together, and a changed
project refuses a late import. Style uploads remain references. Editor and Dual
fields resolve only known project/library identities or actual files, never a
dragged URL. A reference placed on an Editor track gets a production alias that
reuses its bytes.

The final header control toggles the right rail. Project, Inspirations and Library
are tabs in one collection; Camera's former studies gallery supplies Library.
Dual embeds its existing media library there. The rail owns its scrolling;
embedded lists do not nest another scrollbar. With the rail open on desktop,
the main workspace scrolls separately and there is no document scrollbar beside
Assets. Smaller widths use a nonmodal right drawer with Hide and Escape.
The rail starts open only where it docks (wider than 1100 px). Until the
person opens or hides it, it follows the window, so narrowing a window
closes it instead of leaving a drawer over the work. Ninja has no rail;
the Assets button keeps its place there, unseen and disabled, so the mic
and theme controls stay put between sections.

Editor has vertical resize handles on Composition and Timeline, with arrow-key
steps, Home to restore natural height and Escape to cancel a drag. A resized
panel scrolls, so the console clips its closed notes and feedback drawers
sideways; otherwise focus moving into a drawer scrolls the panel and the
shell moves. With the inspector open, the timeline leaves room for it after
the last frame, so every clip can be scrolled clear of it. The 3D viewer
and transport are separate from camera controls. Scene and camera movement starts
open (including top path / side altitude); Curves and Gestures start folded.
Length and size live under Settings. World Builder retains its existing surface.

## Director after generation

The operator leaves the final result composition open for visual refinement.
Implement the following state contract; review its actual layout against Director
before locking the visual design. Panels stay on the same page and document.

| State                        | What the person sees                                                                      | Continuity                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Inputs                       | Template example, declared slots, prompt, references and Generate                         | Defaults seed a draft once; edits belong to that draft                   |
| Working                      | Visible prior result or labelled example, progress and the submitted input summary        | Bind the job to its input revision; switching presets does not resubmit  |
| Result                       | Actual compiled composition/player becomes primary; inputs collapse to a readable summary | Keep the submitted recipe and media; show pending newer edits separately |
| Revise                       | Expand the inputs beside the last successful result                                       | Preserve that result until a deliberate new run succeeds                 |
| Error / uncertain submission | Prior result and inputs remain available with a recovery action                           | Never automatically repeat an uncertain paid submission                  |

Result actions are **Edit**, **Export**, and **Revise**. Edit selects the Editor
preset with the same composition, selection/history and assets. Export uses the
existing playable-video and editable-bundle paths. Revise opens the inputs;
regeneration is a separate explicit action with the applicable cost/connection
state. Do not label a still-image animation or an offline fixture as a new AI run.

A result arriving while the user edits must not overwrite those edits. A result
arriving while another preset is active must not move the interface or steal
focus; expose it as ready and let the user open it. Compare/branch/take-tree UI
is not required to finish this shell.

## Fluid layout and animation

Use content-driven grid/flex layouts and aspect-ratio previews. Prompt length,
character slots, asset lists and result actions can extend a panel naturally.
Do not ship the mockup's fixed pixel heights, clipped text or nested scrolling
as the production layout. Only tools that intrinsically need an internal viewport,
such as a timeline or scene, should own one.

Keep the existing stable Camera hero/composer footprint across generation/model
changes. Explicit workspace changes may rearrange it; growing content may expand
vertically. Preserve image/video aspect ratios and keep actions reachable at
320, 390, 768 and desktop widths, with actual touch/file-selection checks.

Camera's composer generates directly, with no Fast / Studio switch or Finish at
target, so its top row holds only the mode badge and composer actions. Existing
chains appear as gallery cards, and a review step lays over the bottom of the
preview rather than adding a row. See
[Chains in the studio](architecture.md#chains-in-the-studio);
`scripts/check-review-step.mjs` checks it at 1440, 390 and 320 px.

Animate shared panels between measured positions, then settle. The user's mockup
preference is 700 ms, a starting point for tuning rather than a fixed requirement.
Handle interruption from rapid clicks, skip movement for reduced motion, retain
focus where possible and return it to the triggering control when its panel hides.
Do not move controls automatically during typing or when a job completes.

## Build order and exit gate

1. Extract/embed the existing surfaces and introduce the six-preset map over the
   shared owner; prove Camera and Director continuity before adding animation.
2. Wire Editor, Dual Editor and Builder outputs into the project; preserve tool
   state and existing deep links, then add the bounded Ninja panel picker.
3. Add Director's contextual shelf, schema-driven inputs, validated template
   settings and result/revise presentation using current offline recipes first.
4. Add the fluid responsive layout and interrupted/reduced-motion transitions;
   match the original Director details and visually review empty/populated states.
5. Test one complete journey: template → inputs → existing offline result →
   Editor → Dual Editor capture → 3D guidance asset → Director → MP4 and editable
   ZIP → reopen. Then connect the separately authorized generation workflow.

Exit requires no loss of assets, prompt drafts, jobs, playback, revisions or undo
on mode changes; validated input bindings; working touch/keyboard controls;
result arrival without overwritten edits; and real component screenshots at the
stated widths. Run the relevant repo checks. The shell does not authorize paid
calls, publication or deployment. Brand selection must not block this work.

## Confirmed names, 19 October

- **Genobi** is the app name; use “open-source video studio” as the descriptor.
- **Director** remains the template-workspace name.
- **Ninja** is the custom workspace.
- **Dual Swords** is the frame editor, with a functional “Frame editor” description.

Update visible product naming, document title and accessible labels together.
Retain repository/package names, URLs, saved IDs and existing `/dual-editor`
links for compatibility. Playful icons supplement readable labels and follow
Flux's restrained weight, size and contrast.

The prior search comparison favored Genobi over Shinobi's direct camera/video
collisions with [Atomos](https://www.atomos.com/explore/shinobi-series/?new-nav=true)
and [Shinobi camera software](https://shinobi.video/why). Existing unrelated
[GenoBi uses](https://www.joeltrotter.com/project-3) remain; the chosen branding
is not a search-ranking or name-availability guarantee.

## Interaction quality

Smoothness is an acceptance criterion, not decorative work at the end:

- Preset movement is interruptible and settles; no queued animation backlog.
- Press, selection, hover and focus respond immediately, with restrained
  short transitions and clear selected states. Touch gets equivalent feedback.
- Revealing controls and opening/collapsing panels preserve focus and reading
  position; drag/drop has clear target and completion feedback.
- Use the longer layout transition only for workspace movement, not every click.
  Reduced motion keeps state feedback while removing travel and scaling.
- Keep inputs usable during transitions; avoid unexpected page jumps, stale
  tooltips, moving action targets and layout shifts from loading media.
- Check real content, long prompts, empty/error/loading/result states, rapid
  switching, keyboard, touch and 320–desktop widths before calling a slice done.

## First implementation slice, 19 October 2026

The shell now mounts the existing Camera, Director, World Builder and Dual
Swords components into stable panel hosts. The workspace sections rearrange those hosts;
Director and Editor share the same canvas, document, history and transport.
Ninja selects panels for the current tab. The shell uses the Flux tokens,
700 ms layout transitions, shorter control feedback and reduced-motion support.
The existing legacy entry URLs select the matching preset; the embedded scene
adapter retains its standalone bridge.

Director's shelf contains the three existing templates. The project shelf opens
the existing asset drawer. Every tool's output reaches the project's assets
through one path ([outputs into project assets](project-assets.md)): Dual
Swords kept frames and World Builder first frames as Inspirations, Dual Swords
exported frames and World Builder takes under Project, and the rail switches to
the tab the output landed in.
Gallery Recreate reveals the Camera composer when it is hidden.
Hidden preview playback and shortcuts pause; an explicit local export continues
without selecting a different workspace when it completes.

This is the shell foundation, not completion of every contract above. Still to
build: the conversational agent and backend handoff, shared asset pooling across
template drafts, template maker, the full Inputs/Working/Result/Revise treatment,
and the broader cross-tool lifecycle. Saved Ninja arrangements are described
below. The current template inputs and local export UI
remain in use. The tools panel exposes the existing explicit JSON commands.

Verification: `npm test` (372 tests), lint (no errors; three existing warnings),
type checking, formatting and `npm run build:pages` passed locally. The repeatable
browser check is `scripts/check-studio-shell.mjs`, run against a local server;
it blocks paid job submissions. It verifies edit/canvas retention, frame import,
Ninja selection, background local export and reduced motion. Screenshots cover
all six presets at 1440, 768, 390 and 320 px. No deployment or model generation
was performed by this verification.

See [Studio interface](studio-interface.md) for the shared tool headings, menus
and top alignment. Studio chooses its finishing target during review.

## Saved Ninja layouts, 20 October 2026

Ninja chooses panels, reorders them by grip drag or keyboard arrows, and supports
fine desktop sizing (described below). Phone layouts stack in the same order. DOM order follows the explicit panel sequence; dense packing can visually fill
earlier gaps.
Existing component owners and portal hosts remain mounted, including a hidden
3D scene or frame editor, so rearrangement does not replace the project.

**Save layout** stores only versioned panel IDs, order and widths in this
browser. Opening Ninja restores that arrangement in its clean view; the existing workspace URL
selects the initial preset. Changes remain unsaved until Save. Revert restores
the last saved arrangement; Reset selects the defaults without overwriting it.
Download JSON and Load JSON transfer a layout between browsers. Import validates
version, fields, IDs, duplicates, width and an 8 KB size bound before changing
anything. Blocked or corrupt storage falls back safely; JSON remains available.

Layout saving does not save project media, credentials or prompts. Use the
existing project ZIP separately. Including an optional layout in that ZIP is a
future convenience, not a change to the current bundle format.

Pointer dragging supports mouse and touch, with edge scrolling, a destination
outline and Escape/cancel handling. Buttons and grip arrow keys provide a
non-drag alternative. Reduced motion disables the layout transition.

Verification: 376 tests across 50 files pass; type checking, lint (three existing
warnings), Pages build and Worker boundary pass. Changed files pass formatting;
the whole-tree formatting check flags three existing logo-exploration JSON files.
`scripts/check-ninja-layout.mjs` verifies mouse/touch/keyboard movement, JSON
round trips and rejection, reload, reset/revert, blocked storage, mounted scene
retention, all panels at 1440/768/390/320 and reduced motion. The existing
`scripts/check-studio-shell.mjs` also passes across all six presets, frame import,
retained edits and background local MP4 export. Both browser runs used local API
fixtures; no provider generation or deployment was performed.

## Adjustable Ninja and asset-linked prompts, 20 October 2026

First use opens configuration. A gear next to Ninja opens it again. Save layout
persists the arrangement and closes configuration, hiding the panel chooser,
arrows, grips and resize handles. Reloading a saved layout starts clean. The
configuration includes a read-only JSON view, download and load controls.

Ninja uses twelve columns (minimum four per panel) and eight-pixel size steps.
Corner dragging and keyboard arrows resize panels; Shift changes four steps.
Fit content clears the explicit height. Fill gaps enables dense packing so
short panels can stack beside taller neighbours; turn it off for sequential
placement. Dense packing may differ from DOM/tab order; keyboard moves retain
the explicit panel sequence. Tablet widths enforce at least half width and
phones stack panels. Composition and Camera preview offer Fit/Fill display;
this affects the viewport only, not exported composition dimensions. Explicitly
sized panels scroll their content, and the prompt expands with available space.
All optional size, fit and packing fields travel with the existing layout JSON;
older half/full layouts remain readable. Layout version 3 retains the earlier Prompt migration and splits the combined
project library into independent Assets and Inspirations panels when reading
versions 1 or 2. Existing sizes stay with Assets; Inspirations starts at the same
width with automatic height. Version 3 preserves intentionally hidden panels.
Saved layouts contain no project data.

A separate Prompt panel contains the animation brief with Image, Video and Font
pickers. It can move and resize independently in Ninja. Assets and Inspirations can be searched separately. A selection inserts
a named reference and thumbnail; clicking the thumbnail swaps its binding while
retaining the words. The prompt and font attachments live in the editable project
ZIP under `brief/`, separate from the validated composition manifest. This is an
agent brief, not an additional provider generation request. Download brief + files
exports the text, resolved references and selected bytes together. Existing JSON
agent tools expose the same mapping through `{"op":"brief"}`. Paths are relative
to the exported package, never guessed host filesystem paths. Fonts support TTF,
OTF, WOFF and WOFF2 up to 5 MB each; imports validate signatures and bundle hashes.

Since Box 2.8 (27 October 2026) the editor draws the brief as fields without
changing its text. Each line that starts with a short label ("Look:",
"Palette:") is a field with a coloured label and rule, in the LTX prompt-part
tokens; a template's first line is its header; palette hexes carry a swatch;
a line of only references (the template's "References:") shows them as
96 × 72 px tiles (88 × 66 on a phone). It stays one contenteditable: each line
is a block, `promptDomText` reads the same string back, and a new line, label,
swatch or tile row redraws the fields with the caret kept (`prompt-fields.ts`,
`PromptLines.tsx`). A reference still swaps on click; a double-click opens it
in the gallery's lightbox, and an image or video dropped on it replaces its
file in place. The fields are no taller than the same lines drawn plain, so
they move nothing below the prompt; `scripts/check-director-brief.mjs` checks
that at 1440 and 390 px, empty and populated.

Project Tools is a separate navigation section between Dual Swords and Ninja,
with a wrench icon. Camera, Director, Editor and 3D no longer embed its optional
swap and JSON utilities. Ninja can still select the panel. Character/clothing
swap stays here for this slice; a standalone Genji cloning/virtual-try-on app is
parked as a later product idea, not a new provider capability or app promise.

Assets and Inspirations are separate boxes, each with its own media browser
launcher and thumbnails. Ninja can select, move and resize them independently.
Assets are production media for the animation; Inspirations are visual/style
references. The shared media dialog stays available even when Assets is hidden. Director continues to select simple
mode by default. Ninja exposes configurable panels, but does not silently enable
advanced timeline/editor behavior; treating Ninja as a broader advanced mode is
still an open product decision.

Current verification: 381 tests across 51 files pass, along with scoped lint and
formatting, TypeScript, Pages build and the Worker boundary. The three local
browser checks cover all seven sections at 1440/768/390/320, layout save/load and
clean/config mode, independent Prompt resizing, media tabs, image/video/font
references and both brief/project exports. Project Tools aligns with the left
navigation edge. No paid generation or deployment was performed.

## Saved personal layouts, 22 October 2026

Ninja's configuration (the gear beside Ninja) has a **Saved layouts** row:
choose a layout and **Open** it, **Save as** a new name, **Update** the chosen
one with the current arrangement, **Rename**, **Delete**, or open **Default
arrangement**. **Export** writes every saved layout to one JSON file and
**Import** reads one back. The row lives inside configuration, so it never moves
the toolbar, the gallery or the panels; at phone width its controls wrap at
44 px.

A saved layout holds a name, the Ninja arrangement (panels, order, columns,
heights, fit and Fill gaps, the same version 3 shape as the layout JSON) and the
Assets rail choices the person made in the other workspaces. Opening one
restores the arrangement and reopens or closes each workspace's rail as it
was, and keeps both as the browser's working layout (`genobi.ninja-layout.v1`
and `genobi.ninja-rails.v1`), so a reload keeps them. Someone who never opened
a saved layout keeps each workspace's default rail. Editor's
vertical resize heights are not kept; they last for the visit. No project data,
prompts, media or keys are saved.

**Where they are kept.** The local server keeps them for the machine in
`.local/layouts.json` (mode 600, beside `jobs.json` and `voice.json`), through
`GET /api/layouts`, `PUT /api/layouts/:id` and `DELETE /api/layouts/:id`. They
are not tied to the session cookie, so every browser on the machine sees one
list and a restart keeps it. The hosted Worker has no accounts and no layouts
route: a D1 row per visitor would be keyed by the same browser cookie as
`localStorage`, so it would reach no further device. Hosted visitors keep layouts
in this browser's storage and move them between devices with Export and Import.
The studio uses browser storage only when `/api/layouts` answers 404 or no
server answers; blocked storage reads as no layouts and a save says to export.
If storage refuses the working layout or its rails when one is opened, the arrangement still
opens but stays marked as unsaved changes, and the message says a reload will
not keep it. The server applies saves and deletes one at a time (read, change,
write), so overlapping requests never drop each other's layouts.

**Rules** (`shared/saved-layouts.ts`, used by the server, the studio and an
import): at most 20 layouts; names of 1 to 48 characters with control
characters removed, unique regardless of case; ids of lowercase letters, digits
and hyphens; only `name`, `layout` and `rails` accepted; about 9 KB per layout
and 180 KB per file. Reading the server's file, browser storage or an import
keeps what is valid and drops the rest: a corrupt file reads as no layouts, a
bad or repeated entry is skipped, and an older Ninja version is migrated. An
import replaces a layout with the same id and renames one whose name is taken.

Verification: `tests/saved-layouts.test.ts` (validation, caps, corrupt and old
data, browser fallback) and `tests/layout-routes.test.ts` (save, restart,
another session, rename, delete, refusals, a corrupt file) on the local server.
`scripts/check-saved-layouts.mjs` runs against the local server: save, reset,
open, rename, a second browser context, export to a hosted-style page that
imports and reloads, a closed Editor rail across a reload, storage that
refuses writes, delete, and the phone width. It removes the layouts it
saves.

## Compact laptop layout, 20 October 2026

Compared against https://fluxstudio.pages.dev/ at 1366 × 768. Navigation now
shares the original 56px top bar with Genobi and Connect; redundant workspace
introductions and repeated headings are removed. Camera matches the original
preview footprint (846px wide, starting at y=56), moving it 206px higher than
the prior shell. Its composer starts within 2px of the original.

Director keeps Assets and Inspirations in separate boxes beside its inputs,
composition and Prompt. Editor and 3D bound their display viewports without
changing export dimensions. Explicitly sized Ninja panels retain their saved
size. Dual Swords uses the single-line heading “Dual Swords · 01 / 02 · Extract
frames / Slice videos.” Frame position opens by default and Luma distribution
starts collapsed, in both the shared shell and standalone frame editor.

Current local verification: 382 tests across 51 files, TypeScript, scoped lint,
Pages build and Worker boundary pass. Native browser checks cover all seven
sections at laptop widths (1366 × 768 and 1280 × 720), with no horizontal
overflow. Core Director controls fit at 1280 × 720; libraries continue below.
Separate media browsers and migration of an existing Ninja layout were checked
in the local preview. This pass does not add new phone or full accessibility
audit evidence. No paid generation or deployment was performed.

## Phone and accessibility pass, 20 October 2026

`scripts/check-phone-a11y.mjs` visits every section at 390 × 844 and
1440 × 1000 against a local Vite server, with fixture API routes and paid
submissions blocked: Camera's Text to video, Upscale, Image and Edit, the key,
camera-controls, preview and add-track dialogs, the model and duration
popovers, Director, Editor, 3D, Dual Swords, Project Tools and Ninja. It checks
document overflow, Chrome's computed accessible names, a visible change on
every Tab stop, 24 px phone targets (WCAG 2.2 target size, with its spacing
exception), dialog focus entry, Escape and return, page and console errors,
and reduced motion (no running animations, autoplaying video or repainting
canvas). Composer modes must keep the hero, toolbar and gallery in place with
an empty and a populated gallery. Screenshots and `report.json` go to
`.local/phone-a11y/`.

```sh
DIRECTOR_URL=http://127.0.0.1:4317 node scripts/check-phone-a11y.mjs
```

The first run found, and this pass fixed: the key dialogue left focus on the
page body when it closed (camera controls and add-track did the same under
React's development double mount), so all four modal dialogues, including the
acoustic one with the same pattern, now share `useModalDialog`;
Upscale, Image and Edit moved the toolbar and gallery by 1 px on desktop and
5 px on phones, now reserved in `studio-frame.css` down to 320 px; the
selected template card and selected timeline clip hid keyboard focus behind
their selection outline; and phone timeline track names and clips were 20–23 px
tall, now 24 px below 520 px. The check covers the stated two widths; earlier
shell checks cover 768 and 320.

On 22 October 2026 the phone Editor's Hide and Mute toggles beside each track
name measured 23.x px when the web fonts failed to load (a worktree whose
symlinked `node_modules` sits outside Vite's allowed paths answers them 403).
Their height came from the line box, so they now have a 24 px minimum of
their own below 520 px. The Director simple view opens on the project prompt
since #67, so the check waits for that field and opens Project media through
the prompt's reference picker.
