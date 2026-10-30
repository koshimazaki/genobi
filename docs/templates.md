---
tags: [director, ltx, sound, models]
summary: The house-style templates (product video, character piece, audio-visual, anime teaser, sheet to shot), their run kinds, inputs, tiers, shots and tracks, the asset intake, and how to open or start them from the gallery and the Director.
---

# House-style templates

Five templates, each a repeatable house style rather than a one-off prompt:
a **product video**, a **character piece** and an **audio-visual** piece
(the taste layer is in [the vision](vision.md#philosophy)), and the
**anime teaser** from [its specification](anime-teaser-template.md), and **Sheet to
shot**, the gallery's first [mechanical](#run-kind-mechanical-or-agent)
template. A template is
data: the house style every shot repeats, the shots with their model, length
and camera terms, the references it expects and the Director tracks it opens
with. The worked example videos and the gallery view are the next boxes of
the same issue; each template has an empty `examples` slot for them.

## Open one

| Link                                            | Opens                                                 |
| ----------------------------------------------- | ----------------------------------------------------- |
| `/director?example=product-video`               | Product video, 16:9 (not a gallery card)              |
| `/director?example=product-video&aspect=9:16`   | Product video, the 9:16 variant                       |
| `/director?example=character-piece`             | Character piece, 9:16                                 |
| `/director?example=character-piece&aspect=16:9` | Character piece, 16:9                                 |
| `/director?example=audio-visual`                | Audio-visual, 16:9 (Acoustic Space is landscape only) |
| `/director?example=anime-teaser`                | Anime teaser, 16:9 (not a gallery card)               |
| `/director?example=anime-teaser&aspect=9:16`    | Anime teaser, the 9:16 variant                        |
| `/director?example=falling-room`                | Falling room, 16:9 (not a gallery card)               |
| `/director?example=sheet-to-shot`               | Sheet to shot, 16:9                                   |
| `/director?example=dimensions-mix`              | Dimensions mix, the finished cut (a mix, below)       |

Add `&workspace=editor` to open the timeline. A ratio the template does not
offer is refused with a message rather than guessed. The simple Director shows
the template's shots (length, model, camera, prompt), its tracks and the inputs
it takes; the Editor shows the same project as lanes.

## The five

| Id                | House style   | Tier      | Run        | Entries                                               | Shots                            | Format     |
| ----------------- | ------------- | --------- | ---------- | ----------------------------------------------------- | -------------------------------- | ---------- |
| `product-video`   | Plinth        | Open      | agent      | `ltx-2-5-fast`                                        | Hero 4 s, Detail 3 s, Reveal 4 s | 16:9, 9:16 |
| `character-piece` | North light   | Open      | agent      | `ltx-2-5-fast`, `flux-3-klein`                        | Arrive 4 s, Turn 4 s, Hold 3 s   | 9:16, 16:9 |
| `audio-visual`    | Slab light    | Open      | agent      | `ltx-2-5-akuspace`                                    | Slice, Rise, Sweep: one bar each | 16:9       |
| `anime-teaser`    | Ink and ember | Semi-open | agent      | `minimax-h3-router`, `minimax-music-3`, `flux-3-edit` | Open 10 s, Drop 10 s             | 16:9, 9:16 |
| `sheet-to-shot`   | Sheet line    | Open      | mechanical | `minimax-h3-router`                                   | Shot 6 s (4–15 s in the drawer)  | 16:9, 9:16 |
| `falling-room`    | Nave light    | Open      | agent      | `flux-3-klein-api`                                    | Still 2 s, then the Fall take    | 16:9       |

**Product video (Plinth).** A product on a plaster plinth in a seamless
warm-grey studio, a soft key and a thin rim light, a palette of plaster, warm
grey and graphite so the product is the only saturated colour, and the upper
third kept empty for the name. Hero is a full shot at eye level with a dolly in;
Detail an extreme close-up panning across one edge; Reveal a low angle pulling
back so the product sits small under its name. The type track sets the product
name from the Reveal to the end.

**Character piece (North light).** One character across a short arc in a bare
lime-washed room with one tall window: Arrive (full shot, pan across), Turn
(close-up, circle around) and Hold (medium shot, static, looking into the
lens). Soft north light, a palette of chalk, oat, faded olive and ink that the
wardrobe repeats, and the character kept off-centre against open wall. The
name enters on the Hold.

**Audio-visual (Slab light).** A music-led piece for the kick-triggered clip
and AKUSPACE: board-marked concrete, hard slices of white light, concrete,
bone and black with one sodium-orange accent, no people. Each shot is one bar
of the track, so the cuts land on the downbeat; each runs on LTX-2.5 · Acoustic
Space with the chosen room appended as its AKUSPACE caption. It opens with the
track lane, the shots, p5 rings in the accent colour and the title on the last
bar.

**Anime teaser (Ink and ember).** Two 10-second shots on MiniMax H3 through
Comfy Router (`minimax-h3-router`, 768P), each made from the character sheet
and the storyboard (`reference_image` items, the sheet first), cut to the
track's beat with a title card and a caption. H3 takes the camera panel in
H3's wording, but the teaser picks no term, since each storyboard panel sets
the viewpoint; each shot's action is the specification's prompt pattern with
the camera in words: "Use the first image as the character sheet and the second as the
storyboard. The same character throughout; follow the storyboard panel 1; one
smooth continuous shot with no cuts or transitions; …". The planner sets
`cameraEnabled` from the entry's controls and refuses a camera term on such a
shot; `set-camera` refuses one too. All three references are optional,
because each can be made: the sheet and the storyboard with FLUX 3 Edit
(closed, the one closed step, so the template is Semi-open), the track as
four MiniMax Music 3 candidates (`candidates: 4`). The look is hand-drawn
painterly anime in the sheet's own line and colour; the type is paper over
ink, dusk teal and ember. The `anime-teaser` skill is the procedure (sheet,
storyboard, track, beat grid, two shots, hand-in, the cut, hand-back); see
[the specification](anime-teaser-template.md).

**Sheet to shot (Sheet line).** One MiniMax H3 shot through Comfy Router
(`minimax-h3-router`, 768P) from a character sheet and a storyboard or sprite
sheet, the sheet first, in the anime teaser's prompt pattern (`panel` in
`anime-teaser.ts`, panel 1): "Use the first image as the character sheet and
the second as the storyboard. The same character throughout; follow the
storyboard panel 1; one smooth continuous shot with no cuts or transitions;
{action}; the camera cranes up slowly as the character lands." The house
style asks for the sheet's own line, colour and palette and no words in the
frame. Both references are required, open at the Scrolls sheet and
storyboard (`public/scrolls/character.png`, `storyboard.png`) and are made
by nothing, so the run never waits for a step. It has no example output yet.

**Falling room (Nave light).** The owner's generated loop
([its page](falling-room.md)): one FLUX 3 Image Klein still (`flux-3-klein-api`,
1K, 16:9) from the brief, with the take's first frame as its reference when
the project holds one (`firstFrameOf`), then the World Builder's Falling room
take (`takes`: the Cathedral, orbit60, idle then hit then fall, 145 frames at
24 fps, 6.04 s), and the take's WAV through Apply room (`take-sound` track,
no lane until that file exists). A take is not a run: the planner places it on
the shots lane after the shots and prices nothing for it, so the still is the
template's one paid step. The character sheet is optional and Klein can make
it, so it opens missing. The `falling-room` skill is the procedure. It is no
longer a gallery card (`NOT_IN_GALLERY`, 29 October 2026): a fall was the
wrong example, and a flying one replaces it once the creature's fly clip has
an owner-assigned model ([gallery](template-gallery.md#falling-room)).
It still opens from its link, from saved projects and from the skill. Anime
teaser and Product video left the gallery the same way on 30 October 2026
(the Dimensions mix is the anime teaser, the Genobi teaser the product
video); both still open from their links, skills and agents
([gallery](template-gallery.md#cards-that-left-the-gallery)).

## Run kind: mechanical or agent

The owner's decision of 27 October 2026: the gallery is the fast mode and
the Director the advanced one, and each template declares how the gallery's
Generate runs it (`run` in `shared/templates/types.ts`, read by `runKind` in
`run-kind.ts`). Nothing is inferred from the shots: an undeclared template is
`agent`, because a session quotes each step and asks, and where it is unclear
which a template is, it stays an agent template until it is proven
mechanical.

| Run          | When                                                                                                                                    | Generate in the gallery                                                                                                                                                                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mechanical` | One generation its recipe fully describes: the prompt, the references, the model and its controls                                       | Swaps the person's files into the recipe and runs it in place through the Camera's paid path: a quote, the person confirms the price, one submission ([gallery](template-gallery.md#generate-in-place-mechanical)) |
| `agent`      | Editing steps: several shots, references made first, ffmpeg trims or slices, stitching to a track, a cut. The default, and the teaser's | **Generate now**: the project with the references, the copy saved, then one agent session ([below](#asset-intake-and-starting-from-the-gallery))                                                                   |
| `mix`        | A finished edit of bundled media: nothing to generate                                                                                   | No Generate: **Take it to Director** and **Take it to the editor** open the cut as it is ([mix templates](#mix-templates))                                                                                         |

`checkTemplate` calls `checkRunKind`, which refuses a `run` other than these
two and a mechanical template that is not one self-contained run: exactly
one shot; every reference carried by that shot, exactly one file, opening at
its own `example` (except a gallery generation card's start image, which
waits for the owner's or the person's file), with no `madeWith`; no audio
lane; and a shot entry that
takes that many references (H3 on Router: exactly two). `mechanicalInput`
(`shared/templates/mechanical.ts`) is the run's request: the planner's shot
with the person's prompt (control characters become spaces, 1 to 1,200
characters, the server's limit), length and ratio, refused unless
`fitControls` leaves it unchanged, and one data URL per reference in the
shot's order. It is the Camera's own `GenerateInput`: the tests send it and
the Camera's composer request for the same choices through the shared
validator and get the same run, body and price. Agent templates keep a skill
each (`plugins/genobi/skills/<id>/`); a mechanical template needs none, and
`genobi_template_plan` reports each template's `run`.

The gallery's generation cards (`shared/gallery/generations.ts`) are
mechanical one-shot templates too, built from the owner's start image and
prompt for each preview clip and run on FLUX 3 image to video. They carry a
`generation` field, send their prompt as written (no house style), and live
in the gallery catalogue only: they are not house templates, so the
Director, the agent tools and `findHouseTemplate` do not see them
([gallery](template-gallery.md#generation-cards)).

### Mix templates

Added 29 October 2026 for the [Dimensions mix](dimensions-mix.md): `run: "mix"`
means the template is a finished cut of bundled media with nothing to
generate, the smallest honest declaration for it. A mix carries `mix` (its cut,
`shared/templates/mix.ts`, and the media it plays) and no shots, references or
tracks; `checkMixTemplate` refuses one that has any, and `checkRunKind`
refuses a mix in the planner, since it plans no runs. Mixes are listed apart
(`mixTemplates`, `findMixTemplate`), so the planner, the agent tools and
`findHouseTemplate` do not see them; the gallery lists them first, the
Director's template list puts them first (`TemplateCards.tsx`) and
`/director?example=<id>` builds the cut (`src/director/mix-template.ts`).

## Inputs

The templates share one input shape, and each says what an input means for
it; only the audio-visual piece reads a tempo and a room. Media inputs are
references, assigned as project assets in the Director.

| Input      | Product video                 | Character piece                 | Audio-visual                                      | Anime teaser                                      |
| ---------- | ----------------------------- | ------------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| `subject`  | The product and its material  | Who they are and what they wear | An architectural or abstract space                | The brief: who the character is and what they do  |
| `title`    | The product name              | The character's name            | The piece's title                                 | The title card and the closing caption            |
| `aspect`   | `16:9` (default) or `9:16`    | `9:16` (default) or `16:9`      | `16:9`                                            | `16:9` (default) or `9:16`                        |
| `bpm`      | —                             | —                               | 60 to 180, default 120                            | — (the grid comes from the track's analysis)      |
| `acoustic` | —                             | —                               | An AKUSPACE setting, default Cathedral · Moderate | —                                                 |
| References | 0–3 product photos (optional) | 1–3 character stills            | 1 track (audio)                                   | 0–1 track (WAV or MP3), 0–1 sheet, 0–1 storyboard |

Sheet to shot reads `subject` as the action ("Action"), `title` as the
project's name in the Director, `16:9` (default) or `9:16`, and takes exactly
one character sheet and one storyboard.

`readInputs` (`shared/templates/plan.ts`) validates them: unknown keys, wrong
types, empty text, a subject over 240 or a title over 40 characters, a ratio
the template does not offer, a tempo outside its range and a room AKUSPACE
does not offer are refused; control characters become spaces. Anything absent
takes the template's default. The Director's link takes `aspect` only; agents
and tests pass the others to `buildTemplateBundle`, and in the Director the
headline field edits the title.

## Why the same template gives the same style

`planTemplate(template, inputs)` is a pure function. For each shot it writes
the run the shot would make, as a `GenerateInput`, and its prompt through the
same `composePrompt` the composer uses:

1. The shot's action with the subject, present tense.
2. The house style, word for word in every shot: look, lighting, palette and
   negative space.
3. The camera terms in the entry's own wording from `shared/camera.ts` (the LTX
   sentences, as [camera wording](camera-wording.md#ltx-25) describes).
4. On Acoustic Space, the AKUSPACE caption for the room.

Only the subject, title, ratio, tempo and room change between two runs of one
template; the tests check that swapping the subject changes nothing else in
any prompt. The character is held by repeating the same description in every
shot. Each planned run is passed through `fitControls` and must come back
unchanged, so every length, ratio and room is one the entry offers; a
beat-locked shot is generated at the shortest offered length that covers its
bar and trimmed to the bar on the timeline. Planning submits nothing: each run
still needs a quote and approval like any other.

The tier is derived, not just declared: `tierOf` reads the registry. A closed
shot entry makes a template Premium; with open shots, one closed reference step
makes it Semi-open and none makes it Open. The agent half of the label belongs
to a run's provenance card ([Hermes runs](hermes-runs.md#provenance-card)), which
uses the same rule (`tierFrom`), not to the template.

## What the Director opens

`src/director/house-template.ts` builds a `director.bundle.v1` project from the
plan, with the same bytes for the same inputs and media:

- A **Shots** lane: one image clip per shot, a small palette-gradient plate
  (`src/director/plate.ts`) standing in until the clip exists. Replace a plate
  with its generated MP4 from the Editor's inspector (Replace source): the
  image clip becomes a video clip and keeps the shot's start and length, and a
  clip shorter than the shot is refused.
- The **type** lane (the studio's caption recipe), and on the audio-visual
  piece the **track** and the **p5 rings** lanes. The recipe sets its words on
  a dark scrim, so each title uses the house's lightest swatch (Plaster, Chalk,
  Bone); the builder refuses a type swatch under 4.5:1 against the scrim.
- The inputs it was built with, as the project's `template` record (subject,
  title, ratio, and the tempo and room on the audio-visual piece). It travels
  in the ZIP and JSON, and the simple Director reads it back, checked again,
  rather than showing the template's defaults. The current frame, tempo and
  headline override the record, since those are edited in the project. Each
  value is checked on its own: a headline over the 40-character title limit
  (the Headline field allows 80) falls back to the saved title alone, and the
  edited tempo, room and frame are kept.
- One `not-run` generation plan per shot, holding the planned prompt and the
  references it carries.
- The house style as the project prompt, with character stills bound as
  `[Image 1]` and so on.

The sample media are a reference's own `example` when it names one (the anime
teaser's and Sheet to shot's sheet and storyboard, `public/scrolls/character.png` and
`storyboard.png`), else the remix character still and the studio example's
six-second 120 BPM pulse, so a template opens without uploads. An optional
reference Genobi can make (`min: 0` with `madeWith`) takes only its own
example (`hasExample`): the anime teaser's track opens missing, so the
intake asks about it rather than cutting a 20-second teaser to the 6-second
pulse. At another tempo
the track lane stops where the sample does. A track is WAV or MP3: the
house-template rule was WAV only until Box 2.2, and both are now taken by the
gallery's drop zone, the bundle builder (`media/track-1.mp3`) and the
Director's own asset import, which already took both. An optional track that
is not supplied opens no track lane; the agent adds one when it hands a track
in.

### Make it yours: the Track slot

The simple Director's **1. Add your media** lists a remix template's picture
slots and, whenever the project has an audio layer, a **Track** slot
(`src/director/remix-slots.ts`): a house template's `track` layer, else the
project's lowest audio layer (a remix template's soundtrack). It takes WAV,
MP3 or FLAC, the audio `checkAssetMedia` accepts. A dropped or chosen file is
imported as a production audio asset and the layer points at it through the
studio's `replace` command; **Choose from project** opens the asset drawer on
that layer with the Project tab, and its `use-asset` follows the same rule
(`placeTrack` in `shared/director/assets.ts`): the layer keeps its start,
plays the new file from its first frame for the file's length, and stops at
the composition's end or the next clip on its lane. A reference is used
through a production alias. A locked track (the remix templates lock their
soundtrack) shows the slot disabled until it is unlocked in the advanced
editor. A house template that declares an audio track but opened without
one (the anime teaser opened with no song dropped) still offers the
slot, "adds the soundtrack": the file creates the `track` lane where the
template stacks it, as the builder would have (`addTrack`, with
`missingTrack` in `shared/director/track-slot.ts`), and the drawer lists it as
"Add track". Agents' `replace-plate` still takes pictures only.

## For the gallery

Each template carries what a card needs without a second schema: `id`, `name`,
a one-line `description`, `tier`, `style.name` and `style.swatches`,
`inputs.aspects`, the shots' lengths, `templateEntries(template)` for the model
filter and `examples` (video, poster, aspect and the inputs that made it). The
card's link is `/director?example=<id>`.

### Asset intake and starting from the gallery

The details drawer shows one drop zone per reference
(`src/template-gallery/TemplateIntake.tsx`), each at a fixed size so nothing
below it moves. A zone starts at the template's example where it has one,
takes the person's own file (**Drop yours**, or a drop on the zone), or is
left for Genobi to make (**Generate**, offered when the reference is optional
and has a `madeWith` entry); **Example** goes back. A dropped file is proved by
its bytes (`readTemplateMedia`, `shared/templates/intake.ts`): a PNG, JPEG or
WebP still under 5 MB, a WAV or MP3 track whose length the shared audio
reader states; FLAC and anything else are refused in the reference's own
words. File names are shown with control characters removed and never
trusted.

An agent template's drawer also holds its brief (the `subject` input,
editable, at most 240 characters) and each shot's prompt as the planner
writes it from that brief, read-only; a mechanical template's holds its one
prompt, editable, with its ratio and length
([gallery](template-gallery.md#make-your-own)). For an agent template:

- **Generate now** builds the template with those references and the brief,
  when the person changed it, as project
  assets (`loadTemplateWith`), commits it as an undoable edit, waits up to
  five seconds for the local server's copy (`saveCopies`, the wordmark's
  flush), then starts the agent through the one spawn action
  (`spawnFromStudio`, Box 1.6), which links that project. When the copy
  does not confirm, nothing starts: "The project copy did not save; try
  again." When a session already works on the template's project, or the
  open project or its kept draft has edits, the drawer asks first, because
  the rebuild replaces that version (an agent's cut included) in the studio
  and in the server's copy. The first turn
  (`intakePrompt`) names the template's skill, the edited brief (fenced
  as the person's words: quoted on one line, its own double quotes
  replaced, so it cannot close the quotation), which
  references are the person's, which are examples and which are missing, and the one question
  for whatever missing reference Genobi can make, for example "Do you have a
  track, or shall I generate one?". Nothing is quoted or paid here. When the
  person closes the spawn dialog, the drawer says "Nothing started; the
  template is open in Director (undo to go back)."
- **Take it to Director** is the `/director?example=<id>` path, with the
  person's references (and brief) when they changed any.
- **Take it to the editor** appears once a session works on the template's
  project (always, for a mechanical template) and opens it in the Editor.

The drawer leaves the header usable while the spawn dialog asks and once a
session works on the template, since its status line sends the person to the
bubble to approve each paid step. The anime teaser and Sheet to shot have no
preview footage yet, so their cards and drawers say "Preview coming soon" and
they have no watch or embed page.

## Limits

- No run has been made from these templates. The prompts follow the
  [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide) conventions
  the studio already uses; how well a model holds them is unmeasured.
- LTX runs here are text to video. References travel in each shot's plan for
  LTX image to video, which is not yet a registry entry (issue #13); until then
  text carries the subject.
- The character stills name FLUX 3 Image Klein (`flux-3-klein`, open weights),
  so the character piece is Open. Klein makes stills from text and boxes here;
  a Klein edit of a reference is later work.
- Cuts land on each bar's downbeat, which is where the kick falls in
  four-on-the-floor music. Detecting kicks in the waveform is later work.
- AKUSPACE is landscape only, so the audio-visual piece has no 9:16 variant.
- Sheet to shot has not run: no paid Generate has been made from the
  gallery, so its prompt, the 6-second default and the result are unproven,
  and it has no example output. An edited prompt stays in the drawer; Take
  it to Director carries the references, and the Director's shot plan keeps
  the template's prompt.
- The anime teaser's H3 shots, FLUX 3 Edit sheets and Music 3 candidates have
  not run. H3 on Router has not run at all; whether it is enabled for the
  owner's key is unknown, and the skill falls back to LTX-2.5 Fast with the
  character in words.
- No tool names a project asset or a take as an image reference, and a
  multi-megabyte data URL cannot go inline in a tool call. The skill sends
  the requests that carry images (the sheet, the storyboard, the H3 shots)
  through the Genobi CLI from a file it builds with a short script; the
  server holds each image to 5 MiB and all of them to about 11 MB before
  anything is spent. In a session the studio started, those CLI quotes reach
  the person's approvals only when the CLI carries the session's grant.
- The single question about a missing reference is the agent's own message,
  shown in the bubble as its latest update. The bubble has no yes and no
  buttons for it, and a Terminal session asks in its window.

## Checks

- `tests/house-templates.test.ts`: every entry exists and is ready, every shot
  in every variant fits its entry's controls and is accepted by the request
  validator both adapters share (`server/validation.ts`) with the same prompt,
  even at the longest subject, camera terms exist for the entry,
  tiers agree with the registry, inputs are validated, prompts repeat the house
  style, bundles are deterministic and survive a ZIP, the cuts sit on the bar,
  plates are valid PNGs and every template file stays within 500 lines.
- `tests/house-template-project.test.ts`: the chosen room, title and tempo
  survive a ZIP and are what the plan reads back; a stale or foreign record
  falls back to the defaults and a malformed one is refused by the schema; each
  title swatch reads at 4.5:1 or better on the caption scrim, both alone and
  over the plates under it.
- `tests/anime-teaser-template.test.ts`: the anime teaser's references (kinds,
  counts, makers, examples), its two 10-second H3 shots at 768P with the
  prompt pattern and no camera term (an H3 term is written in H3's order, one
  H3 does not name is refused), the Router body (sheet then
  storyboard), the bundle with and without its references, a track proved WAV
  or MP3 by its bytes and an MP3 placed as a production asset, the picks, and
  the single question.
- `tests/template-mechanical.test.ts`: the run kind is declared (agent by
  default), an unknown kind and a mechanical template that is not one
  self-contained run are refused; Sheet to shot's request equals the
  Camera's for the same choices (validator, Router body, price); a Generate
  quotes once with the person's storyboard after the example sheet, through
  the Camera's quote route with the key in a header only; Confirm records
  the key, then submits the quoted run once with that key and quote; an
  uncertain answer is reported against its key and not retried; an expired
  quote submits nothing; a finished clip is added to project assets.
- `tests/template-gallery-modes.test.tsx`: the drawer for each run kind, the
  header left usable once a session works on the template, Generate now
  with an edited brief starting one session, and the cancelled-spawn words.
- `tests/template-gallery-actions.test.tsx`: Generate now opens the template
  with the references, waits for the copy and starts one session through the
  spawn action with the project linked and the intake as its prompt; Take it
  to Director and to the editor navigate; the drawer renders the zones for
  every template.
- `scripts/check-template-intake.mjs` and `scripts/check-template-generate.mjs`
  (Playwright, against a frontend-only preview with the API stubbed, at
  1440 and 390 px): the Character piece card's zone, picks, edited
  character and Generate now with one session and the bubble usable after it
  (the intake check drove the Anime teaser card until that card left the
  gallery on 30 October 2026; its drawer is covered by the two tests above); Sheet to shot's swap,
  one quote, one submission with the quote's id and key, progress, result
  and Add to project assets, with zones, prompt and actions unmoved.
- `scripts/check-director-templates.mjs` (Chrome, against a Vite server): each
  template opens with its shots and tracks, shows its lanes and shot clips in the
  Editor, keeps the preset toolbar and stage where the plain Director has them,
  replaces the Reveal plate with an MP4 through Replace source and keeps its
  timing, opens the 9:16 variant, refuses a ratio it does not offer and fits a
  390 px phone without runtime errors.

Code: `shared/templates/` (schema, catalogue, the anime teaser, Sheet to
shot, planner, run kind, the mechanical request and intake; portable,
checked by `npm run check:worker`),
`src/director/house-template.ts`, `src/director/plate.ts`,
`src/director/TemplatePlan.tsx` and `src/template-gallery/` (drawer, intake,
actions, the mechanical run). See also the
[first working composer](director-working-version.md).
