---
tags: [director, sound, templates]
summary: Bloom, the anime teaser mix template - 19 seconds of the owner's two MiniMax H3 (open weights) takes of the Bloom character sheet, cut to the owner's track at 140 BPM under a character-scan and surveillance look, with an editable end card and nothing to generate.
---

# Bloom: the anime teaser

The third **mix** template (`run: "mix"`, [run kinds](templates.md#run-kind-mechanical-or-agent)),
added on 30 October 2026: a finished 19-second anime teaser for the owner's
character Bloom, a flora-cybernetic ninja. It is the proof of the open path:
the footage is two MiniMax H3 (open weights) takes and the music is the
owner's own. Nothing is generated, quoted or paid. In the Gallery it is the
third card, **Bloom · Anime teaser**, after the Genobi teaser and the
Dimensions mix (now subtitled _Music video_); it replaced the Neon bloom
generation card, which keeps its template and links
(`NOT_IN_GALLERY` in `shared/gallery/catalogue.ts`).

| Piece    | Where                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Template | `shared/templates/bloom-teaser.ts`                                       |
| Cut      | `shared/templates/bloom-teaser.cut.json`                                 |
| Media    | `public/media/director-templates/bloom-teaser/`                          |
| Showcase | [v1 and its memory](director-bundle/showcase/bloom-teaser/README.md)     |
| Tests    | `tests/bloom-teaser.test.ts`, `tests/gallery-badges-order.test.ts`       |
| Render   | `TEASER_EXAMPLE=bloom-teaser node scripts/render-genobi-teaser.mjs out/` |

## The footage

Two takes the owner made with MiniMax H3 (open weights) from one character
sheet (reference image; `bloom-sheet.jpg`, `img1` in the prompt) and one
prompt, recorded verbatim
as `BLOOM_PROMPT` in the template:

> animate each pose of this character sheet of <<<img1>>> , sequentially but
> as one smooth take, make it a starting point of cinematic advert. blosoming
> flowers are subtle. Wide angle lens, camera facing character. Starting from
> extereme close-up to full body shot. Fast pased, jumping and making ninja
> moves, with glowing and growing flowers mixed with cynernetic elements of
> the body of the characters. Include details featured on the <<<img1>>>

Each take is 15.08 s at 24 fps, delivered at 2560 × 1440 and encoded once
for the bundle at 1920 × 1080 (libx264, CRF 18, no sound): `bloom-h3-a.mp4`
(18 MiB, a forest: eye close-up, hand reach, lotus field, full body, leap,
lunge) and `bloom-h3-b.mp4` (16 MiB, a dark studio: helm close-up as a
lotus opens, crouch, jump kick, ninja stance, reach as roots bloom). The
project's media is about 40 MiB, every file under the 25 MiB Pages limit.

Provenance, as the gallery says it: the video is MiniMax H3 (open weights);
the character sheet is a reference image whose own model is not recorded,
so nothing here names one for it or calls it open; the music is by
Koshimazaki (owner-made).

## The cut

44.5 beats at 140 BPM and 24 fps: 458 frames, 19.08 s, ending 30 ms before
the track does, so there is no silence after it and no loop. Shots sit on
whole beats from the first downbeat (beat 3); slice glitches mark five of
the cuts.

| Beats   | What plays                                                        |
| ------- | ----------------------------------------------------------------- |
| 0–3     | Space.js scan of the character sheet, the pickup into the bar     |
| 3–11    | Eye ignites, lotus opens on the helm, head and petals (helm scan) |
| 11–18   | Crouch, jump kick (STRIKE), hand reaches for the lens             |
| 18–21   | Ninja stance                                                      |
| 21–29   | The drop: full body under the wireframe scan, leap, lunge (BLOOM) |
| 29–33   | Reach as the roots bloom, pushed in: the title                    |
| 33–44.5 | End card, while the track plays out                               |

## The look: scan and surveillance

Every overlay is an existing trusted recipe except the end card's copy:

- **Character-sheet scan** (`space-hud`, Space.js by Patrick Schroen): the
  sheet with Space.js trackers locking onto the sheet's callouts.
- **Surveillance**: `crt` scanlines with a little curvature and RGB split
  over the footage; the `hud` reading `● REC CAM 01 // SUBJECT BLOOM`, the
  bar and the credit; `ui-focus` target boxes labelled with the sheet's
  callouts (LOTUS, FLORA) and target locks (KICK, LEAP).
- **Readouts**: `build-panel` callout panels, `scan` on the helm,
  `wire-scan` over the full body, `kinetic` slams and title.
- **End card** (`end-card-still`): the construction end card with the
  piece's own still beside the words. It is a copy of `mix-end-card.mjs`
  with one more parameter, `still` (same-origin `/media/` only), so the
  Dimensions mix's recipe and every project pinned to its hash are
  unchanged. Its words are parameters: BLOOM, ANIME TEASER,
  MUSIC · KOSHIMAZAKI, VIDEO · MINIMAX H3 OPEN WEIGHTS.

## The track

The owner's own track, "Anime-Genobi" (music by Koshimazaki, owner-made), supplied on
30 October 2026 as an MP3 (320 kb/s, 48 kHz stereo, 19.152 s) and bundled
as `bloom-track.mp3` (copied and renamed, never moved). Analysed with
`shared/audio-analysis.ts`: 139.86 BPM (42 beats fitted, 6 ms residual),
first beat at 46 ms, first downbeat at 1.333 s (beat 3), a drop near 9.2 s.
The bundle trims the first 40 ms, so beat 0 is frame 0 (the cut's
`inPointSeconds`), and raises it 3.7 dB to -14 LUFS (peak -1.6 dBFS); its
own ending is kept. The cut runs at 140 BPM, which drifts under 20 ms from
the analysed tempo by its last beat.

Swapping it is one slot: replace the file, set `durationSeconds` in the
template and `bpm`, `inPointSeconds`, `track.seconds` and `beats` in the
cut (the cut may not outlast the track), then the `bpm` / `seconds` of the
HUD, panels, scan and slams. The shots are in beats, so they stay on the
grid, but each one's source window changes with the beat length; `checkMix`
refuses a slice that runs past its take. Re-render and update the card.

## How to repeat it

1. **Memory first.** Read [the showcase record](director-bundle/showcase/bloom-teaser/memory.json):
   the owner's brief, quoted, and each decision.
2. **Inputs.** Copy, never move, and rename on copy: the takes to
   `bloom-h3-a.mp4` / `bloom-h3-b.mp4`, the sheet to `bloom-sheet.jpg`.
   No file or text names the tool the takes were downloaded from.
3. **Look before cutting.** `ffprobe` both takes, then contact-sheet them at
   2 frames a second and pick the strongest poses and ninja moves.
4. **Encode once.** 1920 × 1080, CRF 18 to 20, no sound, `+faststart`; each
   file under 25 MiB and the project under 150 MiB.
5. **Write the cut as data** on the beat grid: whole-beat shots, skip a beat
   cut to let a strong shot flow, cards where no shot plays. Target boxes
   take their top-left corner (`x`, `y`) and size.
6. **Render** with the in-page renderer at 1080p:
   `TEASER_URL=http://127.0.0.1:4317 TEASER_EXAMPLE=bloom-teaser TEASER_MBPS=24 node scripts/render-genobi-teaser.mjs out/`
   (the master, kept out of the repository), then a two-pass gallery copy
   under 25 MiB and a poster from a strong frame.
7. **Showcase.** Add a version to the record and run
   `node --import tsx scripts/showcase-versions.mjs bloom-teaser`.

## Limits

- Nobody listened to the cut here: the cut points are beat arithmetic on the
  analysed grid, checked against frames. The drop's analysed moment (9.2 s)
  falls a third of a beat after the cut on beat 21 (9.0 s).
- The callout boxes are placed by eye from contact sheets, not tracked.
