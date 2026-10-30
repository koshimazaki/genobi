---
tags: [agents, director, sound]
summary: The Genobi teaser's decision rules - how a run turns the brief's storyboard, the track analysis and the capture log into every shot length, source time, camera move and overlay value of the version 2 cut, with the helper commands that compute them and no number copied from an earlier cut.
---

# Teaser decision rules

Part of [the teaser run kit](README.md). A run derives every number in its
cut from three inputs and these rules. It never copies a value from another
cut: the verifier fails a cut that matches the v1, v2 or bundled cut
(`copied-reference`). The rules make a cut in the shape of the teaser's
version 2 (1920 × 1080, camera moves on the studio shots, cards in the
middle, callouts).

**Inputs.** `brief.json` (its `storyboard`: the segments, what each shows in
order, the boxes, callouts and approved words), `track-analysis.json` (from
step 2 of the skill), the capture log `docs/genobi-teaser-footage.json` (read
through the helper), the media table in the README, and the example layers
in `examples/`.

**Units.** A beat is 60 / 135 = 0.44444 s. Write that full value into
arithmetic; round only the result. `r1` means rounded to 0.1, `r3` to
0.001. The helper is `node scripts/teaser-run-helper.mjs`.

## 1. Segments

Work through `storyboard.segments` in order. Each has `from` and `to` (cut
beats) and either `cards`, `shots` or `montage`. A segment's shots, or its
cards, must fill exactly `to − from` beats.

## 2. Shot lengths

1. **A studio shot with `shows`**: run
   `slice <asset> "<shows[0]>" "<shows[1]>"`. Take its `sourceSeconds` and
   `beats`.
2. **A studio shot with `source` and `move`** (the owner's ComfyUI
   recording, which has no capture log): `sourceSeconds` = `source`; its
   beats are whatever the segment's other shots leave.
3. **A generation shot** (only an `asset`): 4 beats.
4. **A montage** (`montage` list): 2 beats each.
5. **Fit the segment.** First give a shot with `box` at least 6 beats (its
   label needs room to read). Then add up the beats. While the total is short by one
   or more: add one beat to the **last** shot with `shows` in the segment
   that is under 12 beats and whose `sourceSeconds + (beats + 1) × 0.44444`
   stays under the footage's length minus 0.05 s; if none can grow, add it
   to the last generation shot. While the total is over: take one beat from
   the shot with `shows` that has the **most** beats above 4, or above 6 for a
   shot with `box` (the first one listed, on a tie); if none, from the generation shot with the most beats
   above 2. Repeat one beat at a time until the total equals `to − from`.
6. Shots then start one after another: the first at `from`, each next one at
   the previous `startBeat + beats`.

## 3. Shot fields

| Field           | Studio shot                                                                                                          | Generation shot                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asset`         | from the storyboard                                                                                                  | from the storyboard                                                                                                                                                                           |
| `label`         | `<Name> · <shows[0]>`; the ComfyUI recording `ComfyUI · from <sourceSeconds> s`                                      | `<asset> · <startBeat>`; in a montage `Montage 01` … `Montage 12`                                                                                                                             |
| `sourceSeconds` | rule 2                                                                                                               | The first time an asset is used in the cut: 0. Each later use: r1(previous use's `sourceSeconds` + previous use's `beats` × 0.44444 + 2); if that + `beats` × 0.44444 > length − 0.1, use 0.5 |
| `cropY`         | `null`                                                                                                               | 200 for `mix-01`, `mix-02`, `mix-03`; otherwise `null`                                                                                                                                        |
| `zoom`          | leave out                                                                                                            | `character`, `product` 1.33; `audio-visual` 1.317; `library-01`, `library-03` 1.023; otherwise leave out                                                                                      |
| `move`          | the storyboard's `move` if it has one; otherwise `move <asset> "<box.on, or shows[1] when there is no box>"`, pasted | leave out                                                                                                                                                                                     |

Names: `ui-gallery` Gallery, `ui-camera` and `ui-camera-control` Camera,
`ui-director` Director, `ui-editor` and `ui-directions` Editor, `ui-world`
3D, `ui-swords` Dual Swords, `ui-scrolls` Scrolls, `ui-agent` Genobi,
`ui-licences` Licences, `ui-save` Save.

**Save the shots first.** Write `cut.json` with the header and every shot
(and `"layers": []`) before the overlays: the `view` command reads the shots
from it.

## 4. Overlays on a studio shot

For each studio shot at `startBeat` S with `beats` N:

1. **Pointer** `cursor-S` (lane `cursor`), only for a shot with `shows`:
   `cursor <asset> <sourceSeconds> N`; paste the output as `parameters`, then
   add `"view"` from `view <cut.json> S`. Skip it if `cursor` prints `null`.
2. **Focus box** `focus-S` (lane `focus`), only when the shot has `box`:
   find the time t of the last log event labelled `box.on` (`labels <asset>`).
   Start at S + floor((t − `sourceSeconds`) / 0.44444) (not before S) and end
   one beat before the shot ends, or, when the next shot has a `reveal`, two
   beats before (where the reveal card starts and covers it). If that leaves
   under 4 beats, start 4 beats before that end instead (not before S). Then
   run `focus <asset> "<box.on>" "<box.words>" <its beats>`, paste the output
   and add `"view"` from `view <cut.json> S <the box's startBeat>`. The helper
   draws a box of 5 beats or more in 0.3 s and fades it 0.35 s before its
   end, and a shorter one in 0.1 s held to its end: either way the label,
   typed from draw × 0.5 for 0.4 s, reads at least 1.3 s.
3. **Status** (lane `status`), only when the shot has `status`: start at
   S + 2 and last 6 beats or to the shot's end, whichever is sooner; if that
   is under 4 beats, start 4 beats before the shot's end and end with it.
   Values in rule 6.
4. **Callout** `callout-<slug of the words>` (lane `callout`), only when the
   shot has `callout`: copy the example callout, start at S, 5 beats (or the
   shot's beats if fewer), `text` the words, `size` and `y` from the
   storyboard, `fadeAt` r3(beats × 0.44444 − 0.3).
5. **Slam on a shot**, when the shot has `slam`: rule 7, starting at S
   (rounded down to an even beat).

## 5. Cards, reveals and the HUD

Every card has `"card": true`: it holds the frame where no shot plays.

- `title`: copy the example `title` layer (lane `cards`), from `from` for the
  segment's length.
- `reveal <still>`: `reveal-1` copied from the example, lane `cards`, the
  segment's beats, `still` `/media/director-templates/genobi-teaser/<still>`,
  `duration` 3.
- A segment listing several cards (`paper-dither`, `space`, `reveal-3`,
  `taste`): copy each from `examples/06-shader-and-taste-cards.json`
  unchanged, one after another from `from`, each for its own beats. They are
  the owner's content (Paper Shaders, space.js, the taste-layer credit).
- `end-card`: copy the example `end-card` layer (lane `end`) for the
  segment's beats.
- A generation shot with `reveal`: `reveal-2` copied from the example, lane
  `reveal`, starting 2 beats before that shot, 2 beats, `duration` 0.8, no
  `card`.
- `hud`: the first `hud-1`, the second `hud-2`, lane `hud`, the whole
  segment; `text` from the storyboard, `credit` `MUSIC / KOSHIMAZAKI`,
  `seconds` r3(beats × 0.44444).

## 6. Statuses

Ids `status-0`, `status-1`, … in the order you create them. A card's status
starts with the card and lasts the card's beats. `label` and `done` are the
storyboard's two strings. With `seconds` = beats × 0.44444: `doneAt`
r1(0.6 × seconds), `fadeAt` r3(seconds − 0.3), `y` 0.86, `variant` `scan`,
`twinkle`, `orbit`, `pulse` in turn.

## 7. Slams

`kinetic`, lane `impact`, id = the text in lower case with every run of
other characters as one hyphen (`build-worlds`). A segment's `slam` ends at
its `endsAt`. Beats: 2 when the text is 6 characters or fewer, otherwise 4;
the same number goes in the `beats` parameter. `size` 225 when 6 characters
or fewer, otherwise 180. A slam always starts on an even beat.

## 8. Glitches

`slice-glitch`, lane `glitch`, kind `filter`, id `glitch-<beat>`, `seed`
3 + 7 × beat. Glitches go only on the track's required cuts
(`requiredCuts` in `track-analysis.json`), the montage and the end card;
segment edges that are the owner's timestamps (60, 81, 86) and the cards
from 172 get none. Each glitch is a layer, and the Director holds 128 (a
shot with a camera move counts twice), so this is where the budget is kept.

| Where                                                                     | `amount` | beats | `duration` |
| ------------------------------------------------------------------------- | -------- | ----- | ---------- |
| A required cut where a segment's first shot is a studio shot, and beat 20 | 0.85     | 0.5   | 0.2        |
| A required cut where a segment's first shot is a generation (not 20)      | 1        | 0.75  | 0.3        |
| Inside the montage, every 8 beats after its first                         | 0.9      | 0.375 | 0.15       |
| The end card's first beat                                                 | 0.85     | 0.5   | 0.2        |

## 9. Writing the layers

Copy each recipe's whole layer from an example (`examples/*.json`), then set
`id`, `name`, `lane`, `startBeat`, `beats`, `kind` (`filter` for
`slice-glitch`, `graphics` for the rest), `opacity` 1, `card` where rule 5
says, and the values above. List the layers grouped by lane, in this order,
and inside a lane by `startBeat`: `end`, `cards`, `cursor`, `focus`,
`reveal`, `status`, `callout`, `impact`, `hud`, `glitch`.

Names: `Pointer · <shot label>`, `Focus · <box words>`, `Status · <label>`,
`Callout · <words>`, `Slam · <text>`, `Glitch · beat <n>`, `Title · GENOBI`,
`Generate · forest guardian` (reveal-1), `Generate · reveal card` (reveal-2),
`HUD · intro`, `HUD · final drop`, `End card · Genobi`, and the example's
name for a copied card.

## Why these rules

Drops land on the owner's generations and the interface plays between them.
Each studio shot shows the actions the storyboard names, moves onto the one
it is about, and holds the last one at least 1.3 s (owner correction); the
4K footage keeps a 2× move sharp at 1080p. Boxes and words stay at least
1.3 s. The rules are simpler than the hand-made cut: a run that follows
them scores about 0.77 against v2 (cuts on the same beats 0.83, the same
footage in every section, identical shots 0.07) and builds 127 Director
layers of the 128, which is what the run-A pass
mark is set from.
