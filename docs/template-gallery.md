---
tags: [studio, director, cloudflare]
summary: The Gallery-first studio view, its card order, its model badges (named from the registry) and Open only toggle, its "Make your own" drawer (mechanical templates generated in place, agent templates started in a session), its FLUX 3 generation cards, its preview clips, and the public watch and embed pages with their link-preview metadata and security headers.
---

# Template gallery and sharing

Gallery is the first studio tab. Cards read the same `HouseTemplate` catalogue
as Director: names, descriptions, styles, tiers, model entries and input formats
have one owner in `shared/templates/`. Filters use that recipe metadata; the
length filter describes the recipe, while a preview's overlay shows its video
length. Tool labels describe recipe steps, not how demo footage was made.

## Card order

The cards follow `GALLERY_ORDER` (`shared/gallery/catalogue.ts`), the owner's
order since 30 October 2026:

1. [Genobi teaser](genobi-teaser.md) · Product teaser
2. [Dimensions mix](dimensions-mix.md) · Anime teaser
3. [Bloom](bloom-teaser.md) · Sheet to shot (an anime teaser from a character sheet)
4. [Adaptive reverb](adaptive-reverb.md) · 3D · LTX template
5. Forest guardian
6. Toy creatures
7. Sheet to shot · Preview coming soon

Character piece is in `NOT_IN_GALLERY`: its preview is FLUX 3 video,
represented by Forest guardian, rather than footage from its LTX recipe.
Its template, Director links and public preview pages stay. Neon bloom and
Audio-visual also stay hidden, replaced by Bloom and Adaptive reverb.
`shared/templates/catalogue.ts` keeps its own order for agents and MCP.

The four mixes carry a second line saying what each piece is for
(`GALLERY_SUBTITLE`): "Genobi teaser · Product teaser", "Dimensions mix ·
Anime teaser", "Bloom · Sheet to shot" and "Adaptive reverb · 3D · LTX
template", on the card and in the drawer's title. The Dimensions mix
keeps its name and id, so its links, watch page and showcases are unchanged.
The Genobi teaser's poster is its GENOBI title frame (4.7 s into the v3
render, the wordmark fully drawn), 1920 × 1080 like the cut. Adaptive
reverb's poster is its cathedral room scan at 10 seconds, native 1280 × 720;
the watch/embed pages use that same JPG for `og:image` and `twitter:image`.
Regenerate from the bundled render with:

```sh
ffmpeg -ss 10 -i public/media/template-gallery/adaptive-reverb.mp4 -frames:v 1 -q:v 2 -update 1 public/media/template-gallery/adaptive-reverb.jpg
```

The four mix templates open as they are: the drawer plays the finished cut,
describes it, and offers Take it to Director and Take it to the editor, never
Generate, since a mix generates nothing. A mix's preview is a render of the
template, so it is not labelled preview footage, and it has watch and embed
pages at the render's own size.

## Model badges and Open only

Every card's badge names the models it runs and their route, read from the
registry (`galleryBadge`, `shared/gallery/badges.ts`), so no card is labelled
by hand. `modelName` takes an entry's label before any " · " qualifier,
drops a speed tier ("LTX-2.5 Fast" is "LTX-2.5") and a generator word inside
the name ("FLUX 3 Image Klein" is "FLUX 3 Klein"), and adds the generator
where the registry gives one name to entries that make different things
("FLUX 3 video"). A recipe names its video models; its image, edit and music
steps are in the tooltip. The route counts every entry: "open weights", "API",
or "open + API" when both appear.

| Card                                               | Badge                                  | Why                                                                                                         |
| -------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Genobi teaser                                      | MiniMax H3 + FLUX 3 video · open + API | Studio screen recordings; its generated footage is the owner's MiniMax H3 creatures and one FLUX 3 run (v3) |
| Character piece, Audio-visual (hidden)             | LTX-2.5 · open weights                 | Their recipes' video model; Klein is the image step                                                         |
| Dimensions mix                                     | MiniMax H3 · open weights              | Its three clips are the owner's MiniMax H3 outputs                                                          |
| Adaptive reverb                                    | LTX-2.5 · open weights                 | Its one take is the owner's LTX-2.5 + AKUSPACE LoRA run (`ltx-2-5-akuspace`)                                |
| Sheet to shot                                      | MiniMax H3 · open weights              | One H3 shot through Router                                                                                  |
| Forest guardian, Toy creatures (Neon bloom hidden) | FLUX 3 video · API                     | FLUX 3 image to video                                                                                       |

A mix names the model its footage came from (`MIX_FOOTAGE`), or reads
"Finished cut" when its media is mixed. The badge's tooltip and the drawer's
**Models** line name each registry entry the recipe runs, as "FLUX 3 image to
video (API)" or "LTX-2.5 Fast text to video (open weights)". A badge describes
the card's own recipe, never how its preview footage was made; the line above
the cards says so, and a preview clip whose model the owner recorded names it
on its own label ("Preview footage · MiniMax H3").

### Footage lines

Since 30 October 2026 every preview clip's label names the model that made
the file the card plays (`footageLabel`, from `made` in `previews`,
`shared/gallery/catalogue.ts`), while the badge keeps naming what the
template runs. The owner named each clip:

| Card                     | Badge (the template)      | Footage line (the clip it plays)                 |
| ------------------------ | ------------------------- | ------------------------------------------------ |
| Genobi teaser            | Finished cut              | None: a mix plays its own render                 |
| Dimensions mix           | MiniMax H3 · open weights | None: a mix plays its own render (MiniMax H3)    |
| Character piece (hidden) | LTX-2.5 · open weights    | Preview footage · FLUX 3 video                   |
| Audio-visual (hidden)    | LTX-2.5 · open weights    | Preview footage · MiniMax H3 (`audio-visual-h3`) |
| Sheet to shot            | MiniMax H3 · open weights | None yet: Preview coming soon                    |
| Forest guardian          | FLUX 3 video · API        | None: the owner's recorded FLUX 3 run            |
| Toy creatures            | FLUX 3 video · API        | Preview footage · FLUX 3 video                   |
| Neon bloom (hidden)      | FLUX 3 video · API        | Preview footage · FLUX 3 video (the lotus clip)  |

The drawer, the watch and embed pages and an unrecorded generation card's
note say the same in a sentence ("Preview footage, made with FLUX 3 video
(API)"). The footage changes neither the badge nor Open only, which still
read the template. Open weights is not the
same as free: Sheet to shot runs MiniMax H3 through Router, a paid hosted
call. The Filters panel's **Tier** field still filters by tier (Open models,
Semi-open, API model).

**Open only**, the toggle above the cards (off by default), keeps cards whose
tier is Open and which show no borrowed preview footage (`openOnly`): today
the four finished mixes and Sheet to shot. Borrowed preview footage does not
qualify. The Filters
panel's **Tier** field still filters by tier alone.

## Cards that left the gallery

Several house templates are templates but no longer cards (`NOT_IN_GALLERY`,
`shared/gallery/catalogue.ts`). Each keeps its Director link, skill, agent
plan and MCP tools; only the card goes.

- **Anime teaser** (30 October 2026): the Dimensions mix is the anime teaser,
  so its card now says so. The template, its `anime-teaser` skill, its run
  card and its Hermes runs still open it at `/director?example=anime-teaser`.
  It had no preview footage, so no media was removed.
- **Product video** (30 October 2026): the Genobi teaser is the product
  video. The template and its `product-video` skill stay, and so does its
  clip, `product-video.mp4`: it plays on the Toy creatures generation card
  and on `/watch/product-video`.
- **Character piece** (30 October 2026): its FLUX 3 clip already plays on
  Forest guardian. The LTX recipe and `/director?example=character-piece`,
  `/watch/character-piece` and `/embed/character-piece` remain available.
- **Audio-visual** and **Neon bloom** (30 October 2026): replaced by Adaptive
  reverb and Bloom respectively; links still resolve.
- **Falling room** (29 October 2026), below.

### Falling room

Falling room is no longer a gallery card (29 October 2026): a fall was the
wrong example, and a flying one should take its place. Its preview footage
was removed, so it has no watch or embed page. The template itself stays: saved
projects, `/director?example=falling-room`, the `falling-room` skill and the
World Builder's named take still open it ([its page](falling-room.md)). A
flying example cannot ship yet: the creature's fly clip
(`shared/scene/character-catalog.ts`, `src/scene3d/creature-slots.ts`) needs
a model the owner assigns.

A card previews on hover or keyboard focus. Only one card previews at a time;
hovering another pauses and mutes the previous card, even if it still has
keyboard focus. A focused offscreen card starts when it scrolls into view.
The four music pieces (Genobi
teaser, Dimensions mix, Bloom, Adaptive reverb) play with sound only after a
page gesture; before that, their small **Sound** button enables it explicitly.
**Mute** switches it off. If a browser still refuses audio, playback falls back
to muted and offers Sound again. Forest guardian also has an audio stream and
follows the same rule. Leaving the card, hiding the tab or scrolling
it offscreen pauses and mutes it. Reduced-motion visitors keep the poster;
page load never starts playback. A click opens "Make your own".

## Make your own

The gallery is the fast mode; the Director stays the advanced one. The
drawer is the same for every template, top to bottom, each block at a fixed
size so a pick, a quote, a run or a refusal moves nothing below it:

1. **The output**: the example's video when one exists, else "Preview coming
   soon"; stand-in footage is never presented as a template's result. For a
   mechanical run the same box shows its progress, then plays the result.
2. **The assets it uses**, one zone per reference, at the template's
   example, and **3. the swap slots** in the same zones: **Drop yours** (or a
   drop) swaps in a file from disk, **Example** goes back, and **Generate**
   leaves a reference for Genobi to make where it can
   ([intake](templates.md#asset-intake-and-starting-from-the-gallery)).
3. **The prompt**: editable for a mechanical template, with the model (MiniMax
   H3 · 768P) and its key controls, ratio and length; for an agent template
   the brief is editable and each shot's prompt is shown read-only, as the
   planner writes it from that brief, with the recipe's models.
4. **Generate**, then **Take it to Director** and **Take it to the editor**.

What Generate does depends on the template's declared run kind
([templates](templates.md#run-kind-mechanical-or-agent)): mechanical when
the template is one generation its recipe fully describes, agent when it
needs editing steps. Where it is unclear, a template is agent.

### Generate in place (mechanical)

Sheet to shot is the first mechanical template: a character sheet and a
storyboard or sprite sheet become one MiniMax H3 Router shot (768P, 16:9 or
9:16, 4 to 15 s). **Generate** reads each reference as the Camera's tray
does (`readReference`: PNG, JPEG or WebP, 5 MB, 256 px a side), the example
or the person's file, builds the Camera's own request with them
(`mechanicalInput`) and asks for one quote through the Camera's quote route
(`POST /api/quotes`, the page key in a header only). Nothing is spent yet:
the button becomes **Confirm · $price · credits**, and changing the prompt,
a control or a reference drops the quote. **Confirm** records the run's
idempotency key (made when it was quoted), then submits exactly the quoted
request once through the Camera's own `generate` (`useJobs`, through the
generation bridge) with that quote's id and key; the server reserves the
run under the key before it calls the provider and spends the quote in the
same step. A failed submission is reported, "The run may have started. No
automatic retry was made. Check Camera's generation history before
generating again.", and never retried; an expired quote submits nothing.
The record (key, quote id, state and job, never the page key) is also kept
per template in this tab's sessionStorage (`pending-runs.ts`, every access
guarded). After a reload whose Camera history does not yet show the run,
the drawer says "A run may be in progress; see Camera history." and
Generate asks before quoting a new run.
Code: `src/template-gallery/mechanical-run.ts`, `pending-runs.ts` and
`useMechanicalRun.ts`; tests in `tests/template-mechanical.test.ts` and
`tests/template-pending-runs.test.ts`, browser check
`scripts/check-template-generate.mjs`.

The run is a Camera job, so it is polled by the Camera's own loop and
appears in Camera history. The drawer's output box shows its progress line
(`jobProgressLine`: the stage, real progress when the provider reports it,
else elapsed seconds and Router's estimate in words), then plays the result.
**Add to project assets** copies the finished clip into the open project
through the one path every output takes (`addServedMediaToProjectAssets`,
[project assets](project-assets.md)); with no project open it opens the
template's project first. **Take it to Director** and **Take it to the
editor** open the template's project with the person's references. A
finished run is not added to a project automatically.

### Start with your agent (agent)

**Generate now** opens the template with those references (and the brief,
when edited) and starts the agent on it through the one spawn action;
**Take it to Director** loads `/director?example=<id>` in the existing
studio, preserving per-template drafts when nothing changed; **Take it to
the editor**, once a session works on the template, opens its project in
the Editor at `/director?example=<id>&workspace=editor`. The shared runtime
reads subsequent `popstate` URLs too, including showcase links
(`?showcase=<project>&version=<n>&workspace=editor`), so a mounted Editor
opens the requested template/version and restores kept drafts. Both Director
and Editor default to Dimensions mix through the same loader. The template
picker offers only Dimensions mix, Genobi teaser, Bloom and Adaptive reverb.
Character intro, Outfit reveal and Poster in motion are retired placeholders;
only their slot metadata and fixtures remain for saved-project replacements.
None of them pays: the agent quotes each paid step and the
person approves it in the bubble, which stays usable behind the drawer once
the session starts: Tab moves from the drawer's last control to the header
and back (`focus-ring.ts`), where it otherwise cycles inside the drawer. Closing the spawn dialog says "Nothing started; the
template is open in Director (undo to go back)." Save an editable bundle
before reload; these drafts remain in memory. The anime teaser is an agent
template.

### Generation cards

The gallery keeps Forest guardian and Toy creatures as **Generation** cards
from the three preview clips below (`shared/gallery/generations.ts`). Each is a
single FLUX 3 image-to-video run (`flux-3-i2v`) of one start image and one
prompt: a mechanical one-shot template built from the owner's record for
that clip, `{ image, prompt, settings? }`, keyed by the clip's id, with
`image` a PNG, JPEG or WebP under `/media/template-gallery/`. The record is
the only source: no prompt is written for a clip and no frame of it is
shipped as its start image. `settings` holds the FLUX 3 controls the owner
ran: `duration` (whole seconds, 5 to 20), `aspect` (16:9, 21:9 or 9:16) and
`resolution` (one of the entry's `hd`, `fhd`, `qhd`, `uhd`). Each is checked
against `fluxVideoControls` and the card's ratios, and a value outside them
refuses the record.

**Character piece (Forest guardian) is recorded** (29 October 2026). The
owner supplied the start image, the prompt (kept word for word, typos
included) and the controls they wrote after it (duration 20, 21:9, hd), and
the result, a FLUX 3 image-to-video run with its own sound. Its drawer opens
with all of it: the start image as the example, the prompt, 21:9, 20 s and
HD. Generate then quotes that run and waits for the person to confirm the
price, as for any card; opening the card spends nothing. Toy creatures (the
`product-video` clip) and Neon bloom (the `audio-visual` clip) are still
empty until the owner fills them in.

- **Until a card has both**, its clip is labelled preview footage, the drawer
  says the start image and prompt that made it are not recorded, the prompt
  field opens empty and the Start image zone opens empty. Generate refuses to
  quote until the person drops a start image and writes a prompt.
- **Once both are recorded**, the clip is no longer marked preview footage,
  the drawer says "Made from this start image and prompt with FLUX 3 image to
  video." (the owner's statement), and the drawer opens with that prompt and
  image, both editable.

Generate is the mechanical path above, unchanged: one quote through the
Camera's quote route, shown as the price on **Confirm**, the person's
confirmation, then one submission under the idempotency key, never retried.
FLUX 3 image to video runs on BFL direct, so every generation card says it
needs a BFL key; without one the quote route refuses ("Connect a BFL key
first.") and nothing is spent. The page cannot tell which provider a server
key belongs to, so the line is always shown rather than only when one is
missing. Length is FLUX 3's 5 to 20 seconds (5 by default) and the ratio
16:9, 21:9 or 9:16. A generation opens no Director project, so it has no
Take it to Director, editor, link or embed; **Add to project assets** adds
the result to a project that is already open and otherwise says to open one
first. The gallery's **Kind** filter separates Template and Generation
cards. Tests: `tests/gallery-generations.test.ts`.

### Preview footage

Sheet to shot has no preview yet: its card and drawer say "Preview coming
soon" and it has no watch or embed page. The anime teaser template has none
either, and is no longer a card. The
house cards' preview clips are optimized previews under
`public/media/template-gallery/`. They are explicitly labelled preview footage,
not examples generated by the house recipes, and the label shows on every
card without a hover. The canonical `examples` slots
remain empty. When a genuine example is added there, the gallery uses it in
place of the fallback preview. No model or camera provenance is inferred from
the appearance of a demo clip: each clip's model is the one the owner named
(30 October 2026: `character-piece.mp4`, `product-video.mp4` and the lotus
`audio-visual.mp4` are FLUX 3 image to video, API; see
[Footage lines](#footage-lines)). The three supplied clips also play on the
generation cards above, under the same rule until the owner records their
start image and prompt. Each runs 20 to 29 seconds; FLUX 3 makes at most 20
seconds a run, so a clip is not claimed as one generation by its length
alone. The `product-video` clip is silent. Character piece now
carries the owner's run with its sound.

Since 30 October 2026 the Audio-visual card plays `audio-visual-h3.mp4`: the
three [Dimensions mix](dimensions-mix.md) clips, the owner's own MiniMax H3
(open weights) outputs, side by side as three 320 × 406 centre crops of the
720 px squares, 13.5 seconds, silent, 2.7 MB. Its recipe (LTX-2.5 Acoustic
Space) did not make it, so it stays preview footage and keeps Audio-visual out
of Open only; its label reads "Preview footage · MiniMax H3" from the clip's
recorded registry entry (`previews` in `shared/gallery/catalogue.ts`), and the
watch page says "made with MiniMax H3 (open weights)". The earlier supplied
clip, `audio-visual.mp4` (the lotus figure, FLUX 3 video), stays: the Neon
bloom generation card, labelled "Preview footage · FLUX 3 video", and the
[Genobi teaser](genobi-teaser.md) play it.

The encode follows the other previews: 960 × 406, 24 fps, H.264 High at
x264 preset `fast`, CRF 27, `yuv420p`, `+faststart`. Character piece adds
its sound as mono AAC at 128 kbps, 44.1 kHz, and is 3.5 MB. Every container
and stream tag is dropped (`-map_metadata -1 -map_chapters -1`, bitexact
flags), including the content credentials the provider wrote. The start
image `character-piece-start.webp` is the owner's 1918 × 820 PNG at full
size as lossy WebP (`cwebp -q 95 -m 6 -metadata none`), 476 KB, with its
content credentials removed. The poster `character-piece.jpg` was already a
frame of the same take and is unchanged.

The drawer's clip has player controls and starts only when the person presses
play. Gallery audio follows the gesture and hover/focus rules above.

`/` opens Gallery; `?workspace=<section>` and `?job=<id>` still open the section
they name, so links to a run land in Camera. Browser checks that measure Camera
open `/?workspace=camera`.

## Sharing

Every card's link icon copies its absolute `/watch/<id>` URL and shows
**Link copied** beside it. Clipboard denial or absence falls back to a selected
text copy; if that also fails, a selectable URL and **Open video page** remain.
The drawer's Link/Embed tabs copy the watch URL or an iframe for `/embed/<id>`.
All seven gallery IDs resolve on both routes, including Bloom, Adaptive reverb,
Forest guardian and Toy creatures. Sheet to shot shows **Preview coming soon**
until footage exists. Video pages have a Genobi footer and download; a template
links to its editable Director project and a generation links back to Gallery.

Only known catalogue IDs resolve. These routes never read a visitor session,
job, key or private R2 object. Sharing a person's own generated outputs,
publication consent, hosted retention and a shared storage quota are separate
work and are not enabled by this gallery.

### Link previews

`shared/gallery/page.ts` renders the metadata on the server, from the request's
origin, so every URL is absolute:

| Tags                                                        | Value                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| `og:title`, `og:description`, `og:url`, canonical           | Template name, the preview-footage note, the watch page          |
| `og:image` (+ type, width, height, alt), `twitter:image`    | The poster, a frame the size of the clip                         |
| `og:video` (+ `secure_url` on HTTPS), type, width, height   | The MP4, `video/mp4`, its measured frame size                    |
| `twitter:card` `player`, `twitter:player` (+ width, height) | The embed page, the clip's size plus the 44 px footer and border |
| `twitter:player:stream` (+ content type)                    | The MP4                                                          |

The preview clips' sizes are measured from the files (960 × 406, and 960 × 410
for the Neon bloom clip); a worked example's size follows its aspect at 1280 px.
Discord, X and other messengers control their own rendering; the Genobi footer
belongs to the opened or embedded player, and is not burned into the video or
guaranteed in a messenger's native player. A real unfurl needs a public HTTPS
deployment: X only plays `twitter:player` from HTTPS, and neither service can
reach a local server. That has not been tried.

### Headers

The pages set their own headers in Express and the Worker: a
`default-src 'none'` policy with only same-origin images and media,
`nosniff`, `no-referrer`, and camera, microphone and location turned off.
Only `/embed/*` sends `frame-ancestors *`; `/watch/*` sends
`frame-ancestors 'none'`. The studio's `public/_headers` keeps
`frame-ancestors 'none'` and `microphone=()` for every static file; Cloudflare
does not apply `_headers` to responses the Worker generates
([Pages headers](https://developers.cloudflare.com/pages/configuration/headers/),
checked 21 October 2026), so it cannot add a second, stricter policy to the
embed.

Voice is in the header too: see [voice mode](voice-mode.md).
