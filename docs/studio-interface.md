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
generation controls; `scripts/check-camera-models.mjs` covers the model menu,
FLUX 3 image to video's camera terms and the toolbar across model switches.

The Editor's timeline, transport, channel column, direction pickers and the
global prompt beside Program are described in [Editor timeline](editor-timeline.md).
