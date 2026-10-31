---
tags: [studio]
summary: Shared tool headings, workspace alignment, menus and finishing controls.
---

# Studio interface

Camera and the Assets rail establish one top edge. Gallery, Director, Editor,
3D World Builder, Dual Swords, Scrolls and Project Tools align their first
container to that edge. Gallery and Camera keep their content-led presentation.

Other tools share a heading: the navigation icon, a compact tool name, and
a short inline pair of tasks, without step numbering. Director and Editor show
the current project name as secondary text. Scrolls uses square Character sheet and Storyboard buttons.
Project memory and taste remain behind a compact, collapsed summary.
Header actions share the square mode buttons' type and scale. Scrolls' audio
toggle aligns with its mode buttons. 3D's Scene and Character controls stay
adjacent, even when the Assets rail is closed.

The main navigation keeps its compact scale. At narrower desktop widths it
moves to a second row before the presets would need horizontal scrolling.
On phones, the tool dock uses icons in one row, with accessible tool names.
Tool headings and actions align left; Dual Swords stacks Video A and Video B
vertically so neither source is clipped.

The header's right side keeps the balance and its icons close to the edge, with
one even step between the icons. The balance's provider label (for example
"Comfy balance") hangs under the amount in the same small type as "Run your own
· Open source" under the key, so the header stays one line high. Ninja has no
Assets rail, so it shows no Assets toggle and the icons close up on the edge.

Ninja introduces its custom workspace on first use. Later visits open the saved
arrangement without the introduction. Its gear always opens the Ninja heading
and panel configuration; saving closes configuration.

Dropdowns use the same menu rows, selection mark, theme colours and keyboard
navigation as Camera. Menus open above containers without clipping and stay
inside a modal when opened from one. The native form value and change event
remain available to existing controls, including uncontrolled forms and reset.

The Camera model menu lists the family's entries and nothing under them: the
Workflow picker that sat below a workflow entry's rows was removed on
27 October 2026 ([run location](run-location.md#where-it-is-set)). Beside a
reference tray (FLUX 3 image to video) the camera line under the prompt keeps
one line, with the whole wording in its title, so switching models does not
move the toolbar.

Camera generates directly from the composer's own ratio and resolution
controls. It has no Fast / Studio switch, **Finish at** target or automatic
upscale offer; upscaling stays an explicit choice from a finished result.
Existing chains keep their review and approval history.

`WorkspaceHeading`, `NinjaHeading`, `ThemedSelect` and `SelectMenu` implement the
shared presentation. The browser parity check covers headings, alignment,
keyboard/forms, modal menus, Ninja revisit behavior and Camera's direct
generation controls at 1440, 390 and 320 pixels. It checks the generation intake
before closing it to inspect Director and Editor. Gallery alignment includes its
filter banner. Director upload inputs keep their screen-reader-only dimensions
so the shared intake does not create page-wide horizontal scrolling. Set
`DIRECTOR_BROWSER_PATH` to check with an alternate Chromium executable.
`scripts/check-camera-models.mjs` covers the model menu,
FLUX 3 image to video's camera terms and the toolbar across model switches.

The Editor's timeline, transport, channel column, direction pickers and the
global prompt beside Program are described in [Editor timeline](editor-timeline.md).

## Start here and local setup

The question-mark guide introduces Genobi with “Build the scene. Shape the
sound. Make the cut.” It connects World Builder, scene-derived acoustics,
AKUSPACE experiments, Camera, Director/Editor, Dual Swords and project memory.
It links to the remixable submission video and acoustic demo in new tabs, so
opening an example does not replace the current project. It also links to the
public GitHub repository with clone/install/run instructions for forks.

The guide distinguishes hosted editing from locally running Hermes: start the
local studio, then use Settings → Pair hosted and local Genobi on the hosted
site. It explains generation confirmation, project ZIP saving and third-party
licences. The Genobi logo favicon is linked by the studio, watch and embed
pages with a versioned URL so previously cached icons can refresh.

## Preview resources

Director and Editor share the project’s actual asset bytes. Repeated video
layers reuse one decoder per asset; frames are drawn serially before that
single-frame decoder advances. Only images get renderer blob URLs. Switching
projects or canvases disposes the old renderer immediately, including while
initialization is pending; late decoder or graphics initialization also
releases its resources.

Mix templates load their own real media and the graphics recipes they need,
without fetching unrelated starter-project footage. Concurrent loads of the
same template share an in-flight request, released on either success or
failure. Open projects remain in the existing project store; this change does
not evict unsaved work or add a persistent media cache.

## Generate a version in Director

[Generate my version](director-generate.md) opens with an editable template and
from either workspace's header. It lists declared inputs with current media,
previews, uploads and project-asset choices. Apply swaps is undoable. Generation
always goes through the linked agent, with each paid step approved in the bubble.
Hosted editing offers a project ZIP/local-studio handoff; pairing does not
synchronize media. Existing files remain until approved replacements are ready.
