---
name: genobi-licensing
description: Use before Director planning and after every run to select creative libraries, models and assets for the person's intended reuse, then produce an evidence-linked licence and creator-credit report. Covers commercial video, source/template resale, open-source preference and strict MIT-only selection; unknown rights never become permission.
license: MIT
metadata:
  version: "0.2.0"
  tags: "agents, director, licences"
  docs: "docs/licence-strategy.md, docs/credits/README.md"
---

# Licence-aware creative direction

Use with Director, Scrolls, house templates and standalone creative runs.
Read the user's prompt and studio context `usage` first. Keep an explicit
preference until they change it. At most one initial question when intent is
missing: “Is this a demo, a commercial video, or source/templates you plan to
redistribute?” Ask a second question only if a specific right changes the plan.
Do not repeat a question already answered or infer commercial rights from “free”.
If unanswered, keep intent unresolved and continue reversible planning only.

## Before selecting tools

Read `selection` from studio context at session start. These global browser
defaults live at `/taste#setup`; an explicit current request overrides them for
this session. Reuse known choices. For first setup ask only missing choices that
matter: creative models (any, FLUX, LTX), weights (any, open weights), execution
(any, local, cloud), preferred harness (any, Hermes, Claude Code, Codex), then
intended reuse and component licence preference. "No preference" is valid.

Call `genobi_models` with `status: "ready"` and the selection, for example
`{"status":"ready","selection":{"family":"ltx","weights":"open-weights","execution":"cloud","agent":"hermes"}}`.
Check machine/provider readiness separately. If no model fits, explain the
constraint; never silently relax it. Hermes is a host, not a model licence or
a guarantee of local execution. Open weights and paid/cloud execution can coexist.
Consult actual model/API terms before commercial use.

Read `genobi_project` for a linked project's `preferences`. Resolve choices as
global defaults, then project preferences, then today's explicit request. Only
when asked to remember a project choice, call `genobi_director_command` with the
revision just read and `{"op":"set-preferences","preferences":{"selection":{"family":"ltx"},"usage":{"purpose":"commercial-video","policy":"any-licensed"}}}`
(use the actual requested values). This replaces the preference object: preserve
other explicit choices from the read unless asked to clear them. Null clears all
project preferences; omitted selection fields inherit globals. Read again after
a revision conflict. A new project must not inherit the previous project's
overrides. Keep temporary session intent in its prompt; do not turn it into a
global or project preference without instruction.

For guided setup summarize the choices and direct the person to the global
controls to retain them. The built-in agent browser has isolated storage: edits
there cannot save defaults in the person's browser. There is no writable global
profile MCP tool or automatic installer/harness switch. Do not claim those ran.
A future setup skill must use an owner-scoped settings service rather than a
harness's private memory. "Any" never authorizes spending or acceptance of terms.

1. Call `genobi_licences {}` for the curated taste catalogue. Prefer a fitting,
   compatible choice; these are recommendations the user may replace. The human
   showcase is `/taste`; `/credits/catalog.json` exposes the same catalogue without
   MCP. Credit Uncommon Web / Teknium as collection inspiration, and the actual
   library authors separately. Do not assume the catalogue is built into Hermes.
2. Distinguish `demo`, `commercial-video`, `redistribute-source` and
   `resell-template`. Select policy `any-licensed`, `open-source` or `mit-only`.
   “Open weights” and “commercial permitted” do not mean MIT or open source.
3. Check the planned component IDs with `genobi_licences`. For example:
   `{"purpose":"commercial-video","policy":"any-licensed","components":["three","transitions-ui-generation","ibm-plex-mono"],"stage":"planned"}`.
4. `excluded` means choose a compatible replacement. `review` means find
   evidence or ask the one material question; do not silently treat it as a
   pass. `conditions` still requires the stated obligations to be met. An empty
   inventory is incomplete. The catalogue is not a full dependency audit.
5. Check exact installed version and original LICENSE/NOTICE. For additions,
   record source, version/hash, date, author, obligations and local changes in
   `docs/credits/libraries/<id>/`. Preserve licence text verbatim. Unknown
   libraries, models and uploaded assets must be added to the run inventory,
   even if they are absent from the curated catalogue.

## Models, APIs and assets

Read LICENCES.md and the current primary terms for the exact route. Record
model weights separately from API service terms and output rights. Check revenue
limits, non-compete clauses, derivative-weight restrictions and subscription
conditions. A model's open flag is not a commercial-use flag. Never claim an
API route removes a restriction unless its contract actually says so.

For artwork, characters, fonts, music and video inputs, record provenance and
permission. A user's declaration is evidence labelled “user-declared”, not a
verified licence. No licence on a social post means no copying permission has
been established. Inspirations can be credited as inspirations without copying
assets or claiming endorsement. Do not publish private asset paths or accounts.

For strict MIT-only work, inspect transitive code dependencies. An MIT wrapper
around LGPL p5.js does not satisfy that constraint. Fonts and models retain
separate terms; clarify whether the user means code only or every component if
that distinction affects the result. Do not claim the whole Genobi app is MIT-only.

## Finish every run

1. Rebuild the inventory from what actually ran, not everything recommended.
2. Call `genobi_licences` with `stage: "used"`, those IDs and `versions`, an
   object of actual exact versions/commits for each component and dependency.
   For example `"versions":{"three":"0.180.0"}` only when that version was
   actually used. Missing versions or catalogue mismatches remain `review`;
   never copy a catalogue pin to fabricate runtime evidence. Include unknown
   IDs and leave unresolved rights visible. Mixed-content entries also need
   evidence of the selected pieces and their separate terms.
3. Save its report as `licences.json` and its Markdown as `CREDITS.md` beside
   the output. Add a README link and the intended-use preference. Include
   versions, authors, licence/source links, required notices, modifications,
   model/API routes, asset provenance and unresolved conditions. If only
   planning occurred, keep `stage: "planned"`; never invent a finished run.
4. Keep a separate artistic-inspiration section. Add visible creator credits
   in a teaser when requested; check exact handles before tagging anyone.
5. Report compatibility and remaining conditions, not legal certification.

The tool is advisory and read-only. The skill governs the agent's choices;
there is no app-wide legal enforcement at the generation endpoint. Existing
paid-call quotes and approvals still apply. Do not contact creators, publish,
buy a licence or accept terms without the user's authorization for that action.

## Choose from the taste layer first

Use the examples as references for a choice, not assets to copy blindly. Open
an entry's `example`, inspect the pinned `source`, then apply its intended-use
check. Prefer the following when they fit the brief and constraints:

| Need                                   | Start with                     | Scope                                                           |
| -------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| UI becoming real, build annotations    | Transitions.dev UI generation  | Custom terms; use inside a product, not a competing effects kit |
| Character turntable, ASCII geometry    | Three.js / AsciiEffect         | MIT renderer; model and texture rights separate                 |
| Dithered, liquid or textured surfaces  | Paper Shaders                  | Apache-2.0; recommendation, inspect chosen shader               |
| CRT, pixelation or controlled glitches | PixiJS Filters                 | MIT; inspect PixiJS dependencies and performance                |
| 3D lettering, braille and ASCII meshes | GlyphCSS                       | MIT packages; exclude restricted demo datasets                  |
| Watercolor and natural strokes         | p5.brush                       | p5 build includes LGPL p5; review standalone separately         |
| Pencil-like 3D / plotted lines         | Krbn or Three Plotter Renderer | MIT; verify chosen integration                                  |
| Materials and compact controls         | Alien.js / Space.js            | MIT; inspect chosen modules                                     |
| Seekable typography choreography       | Anime.js                       | MIT; fonts retain their own licences                            |
| Portable technical typography          | IBM Plex Mono or Geist         | OFL; not compatible with literal all-component MIT-only         |

ASCII/textmode is opt-in, never the default aesthetic for a general brief. The
specialist catalogue IDs are `crt-terminal`, `svgbob-wasm`, `cli-spinners`,
`ascii-magic-art`, `play-core`, `textmode-js` and `matrix-rain`. Use svgbob for
text diagrams to SVG; spinners for loaders or small video layers; play.core and
textmode.js for glyph sketches; Matrix for a requested code-rain treatment.
Check ASCII Magic's photo exceptions and textmode.js's distribution/source boundary.
These recommendations also fit websites or game experiments; none is a bundled
engine or a verified video-export module. Use an explicit frame clock and test
capture, fonts, performance and loop seams before promising a video integration.

If a featured option fails the brief, platform, performance or licence needs,
search primary sources for an alternative and document why it was selected.
Do not install every featured library. Pin only the parts actually used.
Read `/motion/presets.json` for Signal's palette, typography, composition and
motion tokens. Treat those as editable defaults; propose new theme manifests
rather than mixing incompatible styles into one run. Backend storage and
execution of arbitrary new themes is a separate future capability.
