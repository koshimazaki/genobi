---
tags: [templates, director, agents, ltx, sound]
summary: The anime teaser as a template - what it asks for, what it generates when something is missing, the exact models and prompts for the sheet, the storyboard, the audio and the two shots, and the cut to the beat.
---

# Anime teaser template

Dictated by the owner on 27 October 2026 and checked against the Router
schemas the same day. This page is the specification the catalogue entry and
the `anime-teaser` skill are built from.
The template, its intake and the skill are built (Box 2.2, see
[What is built](#what-is-built)); nothing on this page has run end to end
yet. The version-1 run card is [runs/anime-teaser.md](runs/anime-teaser.md).

## In one line

Drop a track, a character sheet and a storyboard, or let Genobi make them;
press Generate; Genobi makes two 10-second shots from the sheet and the
storyboard, cuts them to the beat and adds two titles; you tweak the JSON and
send it again.

## Defaults

- 16:9 unless the person or the agent says otherwise; 9:16 stays a variant.
- Two shots of 10 seconds; a 20-second teaser.
- One invented character. Never a real or famous person; lawful and safe for
  work, as every template.

## Inputs and intake

| Reference    | Kind  | Count | If missing, Genobi offers to generate it with                        |
| ------------ | ----- | ----- | -------------------------------------------------------------------- |
| `track`      | audio | 0–1   | MiniMax Music 3 on Comfy Cloud, four candidates to listen and choose |
| `character`  | image | 0–1   | FLUX 3 Edit on Router, our example sheet as the style reference      |
| `storyboard` | image | 0–1   | FLUX 3 Edit on Router, our example storyboard as the reference       |

The template shows one drop zone per reference. Generate starts the agent.
When a reference is missing the agent asks once, in the bubble: "Do you have
a track, or shall I generate one?" with yes and no; a yes quotes the
generation like any paid step. MP3 and WAV are both accepted for the track
(the house-template rule was WAV only and is widened).

## The steps the skill writes down

1. **Brief.** Subject (who the character is and what they do), title, aspect.
   The test brief: a ninja training in a forest, shooting a fireball and
   doing kicks.
2. **Character sheet** (when not supplied). `flux-3-edit` on Router with two
   references: the person's description and `public/scrolls/character.png`
   as the sheet's layout and style. Views chosen from the brief: front, back
   and side, plus one move the brief names (the kick or the fireball). One
   image, 16:9, 1k. Shown for approval; a rejection regenerates with notes.
   The Scrolls document (`genobi_scrolls`) keeps the sheet's structure.
3. **Storyboard** (when not supplied). The same route with
   `public/scrolls/storyboard.png` as the reference: two panels for the two
   shots, each one sentence under it. Approval as above.
4. **Track** (when not supplied). `minimax-music-3` on Comfy Cloud
   ([inventory](comfy-cloud-inventory.md)), caption from the brief, no
   lyrics (instrumental), four candidates of about 20 seconds, for example
   "synthwave anime teaser, driving bass, dubstep drops, no vocals, 128 BPM".
   The person picks one; the others are kept as takes.
5. **Beat grid.** `genobi_audio_analysis` on the chosen track in the project,
   then `set-beat-grid` from its composition.
6. **Two shots.** MiniMax H3 on Router (`minimax/minimax-h3`): `content` is
   one text item and two `image_url` items with role `reference_image`, the
   sheet first and the storyboard second; `duration: 10`, `resolution:
768P`, `ratio: 16:9`. The prompt: "Use the first image as the character
   sheet and the second as the storyboard. The same character throughout;
   follow the storyboard panel <n>; one smooth continuous shot with no cuts or
   transitions; <the panel's sentence>; <camera wording>." Shot two names
   panel two. Each shot is a quote the person approves. Fallback when H3 is
   not enabled for the key: `ltx-2-5-fast` with the character described in
   words, as the version-1 card does.
7. **Hand-in.** `genobi_take_to_project` for both shots; audio stays the
   project's production asset.
8. **The cut.** `add-clip` with `sourceStartFrame` on beat frames so each
   clip starts on a downbeat, a cut at the drop, the second shot on the next
   downbeat; `add-graphic` `title` at the opening beat and `caption` on the
   held last second; kinetic modules only where the grid marks a drop.
9. **Hand back.** The Director JSON at its new revision and a provenance
   card. The person moves clips, sends again; `genobi_project_feedback`
   returns their changes as commands.

## Entries this needs

- `minimax-h3-router` on the `router` route (built, plan box 2.5; not yet
  run): references as `reference_image` items, duration 4–15, ratio from the
  aspect, output `task.content.url` downloaded within its 12-hour window. Comfy
  now publishes the rate (27.16 credits a second at 768P, 39.22 at 2K), so the
  quote uses it; the first approved run's `X-Comfy-Credits-Used` shows whether
  Router bills the same. Separate from the four Cloud OmniRef entries, which
  need a guide video.
- `minimax-music-3` audio entry (plan box 2.1).
- The `anime-teaser` catalogue template with the three references (box 2.2,
  built), and the agent's ability to attach audio and cuts (box 2.3).

## What is built

Box 2.2, 27 October 2026, tests only; no paid call and no agent session.

- **The template**, `shared/templates/anime-teaser.ts` in the catalogue:
  the three references above (`track` audio, `character` and `storyboard`
  images, each 0–1, made with `minimax-music-3` ×4 or `flux-3-edit`, the
  sheet and storyboard examples from `public/scrolls/`), 16:9 with a 9:16
  variant, two 10-second shots (Open, Drop) on `minimax-h3-router` at 768P
  with the step 6 prompt pattern and both references in order, the track,
  shots and title lanes. Semi-open: FLUX 3 Edit is the one closed step. The
  planner takes the camera flag from the entry's controls; H3 takes the
  camera panel, but the teaser picks no term, so its prompt carries the
  camera in words.
- **The intake**, `shared/templates/intake.ts`: a dropped still or track is
  proved by its bytes, WAV and MP3 for the track everywhere a template reads
  one; the first turn names the skill, what is the person's, what is an
  example and what is missing, with the one question.
- **The skill**, `plugins/genobi/skills/anime-teaser/SKILL.md` version 0.2:
  steps 1 to 9 above as tool calls, the whole recipe budgeted once before
  any quote (8 runs when all three references are made), each paid step
  quoted and waiting for a yes (or the person's approval in a studio
  session), the requests with images sent through the CLI from a file, the
  LTX fallback with its own budget check and the model change named in its
  question, the cut with `add-clip` `sourceStartFrame` on beat frames and two
  `add-graphic` titles, provenance.
- **The gallery** started it until 30 October 2026, when its card left: the
  Dimensions mix is the anime teaser
  ([gallery](template-gallery.md#cards-that-left-the-gallery)). It now opens
  from `/director?example=anime-teaser`, the `anime-teaser` skill and an
  agent's plan; the drawer it had (drop zones, **Generate now**, **Take it
  to Director**, **Take it to the editor**) is the one every agent card shares
  ([templates](templates.md#asset-intake-and-starting-from-the-gallery)).
  The teaser is declared an agent template (`run: "agent"`); its track zone
  starts missing, never at the studio's 6-second pulse, so the question is
  asked. Its single-shot cousin, Sheet to shot, runs in place
  ([gallery](template-gallery.md#generate-in-place-mechanical)).

Not built or not proven: any run; whether H3 is enabled for the key; a
by-reference image input (the image requests go through the CLI from a
file); yes and no buttons
for the question in the bubble (it is the agent's message); placing the
second shot's in-point automatically (the agent chooses it).

## Open

- The owner's second example brief, to use as the test case.
- Whether H3 on Router takes a `reference_audio` item that it honours; the
  schema admits it but documents text and image only, so the cut is done in
  the Director, not by the model.
- MiniMax H3 and Music 3 terms before the examples are published.
