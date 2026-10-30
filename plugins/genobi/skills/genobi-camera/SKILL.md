---
name: genobi-camera
description: Generate a Genobi shot with the right model - one workflow card per model the studio can run (LTX-2.5 Fast, LTX-2.5 Acoustic Space, LTX-2.5 Pro, FLUX 3 video, FLUX Video Upscale, FLUX 3 Image Klein, FLUX 3 Image and Edit, H3 and MiniMax Music 3), each with its route, lengths, sizes, cost, prompt guidance and the camera wording it accepts, always behind a quote the person accepts.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director), the genobi MCP server and Node 22 or later.
metadata:
  version: "0.1.0"
  phase: "1 - quoted generation"
  tags: "agents, camera, models, ltx, bfl, workflows"
  docs: "docs/camera-wording.md, docs/run-location.md, workflows/README.md"
---

# Genobi camera

One card per model the studio can run. The cards follow the model registry
(`shared/registry.ts`, which `genobi_models` reads), so `genobi_models` is the
truth when the two disagree: never quote a model it does not list as `ready`.
For linking a project and placing takes on the timeline, use the
`genobi-director` skill; for the tool table and the paying rules, `genobi-studio`.

## Every card, the same loop

1. `genobi_models {"status": "ready"}`: confirm the card's model is there.
2. Write the description for that model (its card says how), pick camera
   terms by id, and choose length and size from the card.
3. `genobi_budget` with the runs and dollars the whole job needs; stop if it
   does not fit.
4. `genobi_quote` with the card's request fields. Show the person
   `estimateUsd` and the recipe and wait for their yes to that price.
5. `genobi_submit` with that `quoteId`, exactly the quoted arguments and a new
   `idempotencyKey`. Never retry an uncertain submission with a new key.
6. Poll `genobi_job` until `Ready`, then `genobi_take` for the record.

The request field `model` is not the registry id: each card names both.
The studio checks every request against the entry's controls, and a quote is
refused before any spend if the key the studio holds cannot run that route.

## Where a workflow card runs

The `workflow` cards (Acoustic Space and the open Klein) follow the session's
run location; `router` and `bfl` cards do not. Before quoting one:

1. `genobi_run_location {}` reads it: `local` (the ComfyUI on this machine,
   its own models, nothing charged) or `cloud` (Comfy Cloud, charged to the
   Comfy key), and whether a local ComfyUI answers.
2. `genobi_workflows {"checkLocal": true}` lists the template behind each
   workflow model and, for the local ComfyUI, the node types and model files
   each template lacks there. Nothing is submitted.
3. Change either only when the person asks: `genobi_run_location {"location": "local"}`,
   or `genobi_workflow_select {"entry": "ltx-2-5-akuspace", "template": "ltx-2-5-t2v"}`
   to run Acoustic Space without the AKUSPACE LoRA (the treatment still
   reaches the prompt). Selecting the entry's default template switches back.
4. Quote after the change. A quote taken before a change of location or
   template is refused (`quote_mismatch`).

Local runs are free and `genobi_budget` leaves them out (`localRuns`). A
session the studio started cannot call these three tools; ask the person to
change the run location in the studio. See
[run location](https://github.com/koshimazaki/Genobi/blob/main/docs/run-location.md).

## Camera wording

You choose terms by id and set `"cameraEnabled": true`; the studio writes the
wording for the chosen model (`shared/camera.ts`). `camera` takes one id per
section (`shot-sizes`, `angles`, `movements`) or `null`. `cameraEdits`
rewrites the phrase of a selected term (600 characters at most); an edit wins
over either model's wording, so write it in that model's style.

- **LTX** joins the description and the camera sentences into one paragraph.
- **FLUX 3** keeps the description and each clause as separate lines.
- **H3** opens with the shot size and angle sentences, then the description,
  then the move, as one paragraph ([H3 camera wording](references/reference-video.md)).
- **Stills** (Klein) keep shot size and angle as lines after the caption and
  drop the movement: a still cannot move.

The server accepts any term id for any model, but each model's guide names
only some terms, and the studio panel offers only those. A term the chosen
model's panel does not show is left out of the prompt. Use only the terms in
the chosen model's tables below.

Shot sizes and angles are generic cinematography terms. LTX takes a shorter
list: overlapping or contradicting terms stay with FLUX 3 and Klein.

| Id                 | Name                            | LTX-2.5 sentence                                                            | FLUX 3 clause                                             |
| ------------------ | ------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| `macro`            | Macro                           | Not for LTX (overlaps Extreme close-up)                                     | Macro detail of the subject's surface.                    |
| `extreme-close-up` | Extreme close-up                | An extreme close-up fills the frame with one detail of the subject.         | Extreme close-up on a single detail of the subject.       |
| `close-up`         | Close-up                        | A close-up frames the upper part of the subject.                            | Close-up of the subject.                                  |
| `medium`           | Medium shot                     | A medium shot frames the subject from the waist upward.                     | Medium shot of the subject.                               |
| `cowboy`           | Cowboy shot                     | Not for LTX (between Medium and Full)                                       | Cowboy shot of the subject.                               |
| `full`             | Full shot                       | A full shot keeps the whole subject in the frame.                           | Full shot of the subject.                                 |
| `wide`             | Wide shot                       | A wide shot gives the subject room in its surroundings.                     | Wide shot with space around the subject.                  |
| `establishing`     | Establishing shot               | A wide establishing shot shows the subject and the whole setting around it. | Establishing shot of the subject within its surroundings. |
| `eye-level`        | Eye level                       | The camera sits at eye level with the subject.                              | Eye-level view of the subject.                            |
| `low-angle`        | Low angle                       | The camera looks up at the subject from a low angle.                        | Low angle looking up at the subject.                      |
| `high-angle`       | High angle                      | The camera looks down at the subject from a high angle.                     | High angle looking down at the subject.                   |
| `birds-eye`        | Bird's eye (LTX: Overhead view) | An overhead view looks straight down at the subject from directly above.    | Bird's eye view directly above the subject.               |
| `worms-eye`        | Worm's eye                      | Not for LTX (overlaps Low angle)                                            | Worm's eye view from ground level.                        |
| `aerial`           | Aerial                          | Not for LTX (between High angle and Overhead)                               | Aerial view above the subject and its surroundings.       |
| `dutch`            | Dutch angle                     | Not for LTX (a rolled frame reads as a move)                                | Dutch angle with a tilted horizon.                        |
| `profile`          | Profile shot                    | The camera views the subject in profile, from the side.                     | Profile shot from the side of the subject.                |

### The eleven LTX moves

From the [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide) and
Lightricks' seven LTX-2 camera-control presets (Dolly in, Dolly out, Dolly
left, Dolly right, Jib up, Jib down, Static), under LTX's names:

| Id            | LTX name      | LTX-2.5 sentence                                                                                                |
| ------------- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| `orbit`       | Circle around | The camera circles slowly around the subject. At the end the subject faces the camera from the other side.      |
| `dolly-in`    | Dolly in      | The camera pushes in toward the subject. At the end the subject fills the frame.                                |
| `pan`         | Pan across    | The camera pans across the subject from a fixed position, the subject passing through the frame.                |
| `tilt`        | Tilt up       | The camera tilts upward along the subject from a fixed position, ending on its top.                             |
| `crane`       | Jib up        | The camera rises above the subject, keeping it in view as the ground falls away.                                |
| `pull-back`   | Dolly out     | The camera pulls back from the subject. At the end the subject sits small in a wider frame.                     |
| `dolly-left`  | Dolly left    | The camera tracks left past the subject, revealing the space to its left as the background slides by.           |
| `dolly-right` | Dolly right   | The camera tracks right past the subject, revealing the space to its right as the background slides by.         |
| `jib-down`    | Jib down      | The camera descends toward the subject, the ground around it coming into view as the shot settles at its level. |
| `handheld`    | Handheld      | Handheld movement sways the frame slightly as the camera stays on the subject.                                  |
| `static`      | Static        | The camera holds a static frame on the subject for the whole shot.                                              |

Not for LTX: `arc`, `trucking` and `lazy-susan` (BFL's names; Trucking's two
directions are Dolly left and Dolly right here), and `follow`, which needs a
moving subject that a scene cannot promise. The LTX-2 camera LoRAs are
not loaded by any card: Router runs no LoRA, and none is published for
LTX-2.5.

### The ten FLUX 3 moves

From BFL's [camera prompting guide](https://docs.bfl.ai/guides/prompting_video_camera_terms):

| Id           | Name         | FLUX 3 clause                                      |
| ------------ | ------------ | -------------------------------------------------- |
| `orbit`      | Orbit        | Slow orbit around the subject.                     |
| `arc`        | Arc shot     | Arc shot around the subject.                       |
| `dolly-in`   | Dolly in     | Dolly in toward the subject.                       |
| `pan`        | Pan          | Pan slowly across the subject.                     |
| `tilt`       | Tilt         | Tilt slowly upward along the subject.              |
| `crane`      | Crane / boom | Crane / boom shot rising above the subject.        |
| `trucking`   | Trucking     | Trucking shot moving sideways past the subject.    |
| `lazy-susan` | Lazy Susan   | Lazy Susan rotation of the subject on a turntable. |
| `follow`     | Follow       | Steadicam follow shot tracking the subject.        |
| `handheld`   | Handheld     | Handheld camera with loose, organic movement.      |

Not for FLUX: `pull-back`, `dolly-left`, `dolly-right`, `jib-down` and
`static`. No reliability claim follows from a term appearing in either guide;
the studio has not yet recorded camera-test verdicts.

## LTX prompt guidance

For every LTX card, from the LTX-2.5 prompt guide as
[camera wording](https://github.com/koshimazaki/Genobi/blob/main/docs/camera-wording.md)
records it:

- Write **one flowing present-tense paragraph**, roughly four to eight
  sentences. The camera sentences continue it.
- Describe the camera **relative to the subject**, and include the shot scale.
- Say **how the subject appears after the move**: where the move ends and
  what it reveals.
- The guide's camera language: Follows, Tracks, Pans across, Circles around,
  Tilts upward, Pushes in / pulls back, Overhead view, Handheld movement,
  Over-the-shoulder, Wide establishing shot, Static frame.

The description is at most 1,200 characters. Audio is always generated.

### The six elements, in order

The guide (Lightricks, [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide),
10 August 2026) lists six elements. Write the paragraph in its order; the
studio's own composer does the same:

1. **Establish the shot**: the shot size and angle sentences.
2. **Set the scene**: "lighting conditions, color palette, surface textures,
   and atmosphere", then the Light sentences below.
3. **Describe the action**: what the subject or character does, not the
   camera, "as a natural sequence, flowing clearly from beginning to end"
   ("Initially…", "A moment later…", "Simultaneously…").
4. **Define the character(s)**: "age, hairstyle, clothing, and distinguishing
   features". Express emotion through **physical cues** ("jaw clenched",
   "shoulders drop"), never a label such as "sad".
5. **Identify the camera movement**: the movement sentence, saying how the
   subject appears after it.
6. **Describe the audio**: "ambient sound, music, speech, or singing", with
   spoken dialogue in quotation marks. On Acoustic Space the AKUSPACE caption
   opens this part.

Skip an element you have nothing for. An agent's request has no gap fields:
the studio appends the chosen camera sentences after `description`, as it
always has. Either write elements 2, 3, 4 and 6 and let the studio append the
shot and movement, or, for the guide's full order, set `"cameraEnabled":
false` and write the shot and movement sentences from the tables above into
the paragraph yourself. Keep `description` within 1,200 characters.

### Light

LTX only. The guide's Visual Details terms, one per group at most. The
sentences are written for this studio (`shared/light.ts`); use them verbatim
or in your own words, after the scene and before the action:

| Id                   | Group         | Guide term         | LTX-2.5 sentence (studio)                                                                           |
| -------------------- | ------------- | ------------------ | --------------------------------------------------------------------------------------------------- |
| `flickering-candles` | Lighting      | Flickering candles | Flickering candlelight lights the scene, warm light and soft shadows wavering across every surface. |
| `neon-glow`          | Lighting      | Neon glow          | A neon glow bathes the scene in saturated colour that reflects off nearby surfaces.                 |
| `natural-sunlight`   | Lighting      | Natural sunlight   | Natural sunlight lights the scene from one direction, casting soft, even shadows.                   |
| `dramatic-shadows`   | Lighting      | Dramatic shadows   | Hard light from one side carves dramatic shadows across the subject.                                |
| `vibrant`            | Color palette | Vibrant            | The colour palette is vibrant, with rich, saturated hues.                                           |
| `muted`              | Color palette | Muted              | The colour palette is muted, with soft, desaturated tones.                                          |
| `monochromatic`      | Color palette | Monochromatic      | The palette is monochromatic, built from shades of a single colour.                                 |
| `high-contrast`      | Color palette | High contrast      | The image is high contrast, with deep blacks and bright highlights.                                 |
| `fog`                | Atmosphere    | Fog                | A thin fog hangs in the air, softening the background.                                              |
| `rain`               | Atmosphere    | Rain               | Rain falls steadily through the frame, wetting every surface.                                       |
| `dust`               | Atmosphere    | Dust               | Dust drifts slowly through the air, catching the light.                                             |
| `smoke`              | Atmosphere    | Smoke              | Smoke curls slowly through the air around the subject.                                              |
| `particles`          | Atmosphere    | Particles          | Fine particles float through the air, glinting in the light.                                        |

### Vocabulary

From `shared/ltx-vocabulary.ts`: the guide's lists where it has them, under
its headings, and a studio-authored set where it has none (Character, and the
motion verbs). Rapid cuts is left out: a card is one continuous take.

- **Scene** — Describe lighting conditions, color palette, surface textures, and atmosphere.
  - Textures: Rough stone · Smooth metal · Worn fabric · Glossy surfaces
  - Scale Indicators: Expansive · Epic · Intimate · Claustrophobic
  - Animation: Stop-motion · 2D animation · 3D animation · Claymation · Hand-drawn
  - Stylized: Comic book · Cyberpunk · 8-bit pixel · Surreal · Minimalist · Painterly · Illustrated
  - Cinematic: Period drama · Film noir · Fantasy · Epic space opera · Thriller · Modern romance · Experimental film · Arthouse · Documentary
  - Film Characteristics: Film grain · Lens flares · Pixelated edges · Jittery stop-motion
- **Character** — Include age, hairstyle, clothing, and distinguishing features. Express emotion through physical cues, not abstract labels.
  - Age (studio-authored): Child · Twenties · Forties · Elderly
  - Hairstyle (studio-authored): Short dark hair · Grey ponytail · Curly red hair · Shaved head
  - Clothing (studio-authored): Yellow raincoat · Leather jacket · White shirt · Knitted scarf
  - Distinguishing features (studio-authored): Scarred brow · Wire glasses · Freckles · Nose ring
  - Physical cues (studio-authored): Jaw clenched · Shoulders drop · Eyes widen · Hands tremble · Slow smile · Breath catches
- **Action** — Write the core action as a natural sequence, flowing clearly from beginning to end.
  - Sequence: Initially… · A moment later… · Simultaneously…
  - Motion verbs (studio-authored): walks toward · turns to face · reaches for · steps back · lifts · pauses
  - Pacing & Temporal Effects: Slow motion · Time-lapse · Lingering shot · Continuous shot · Freeze-frame · Fade-in / fade-out · Seamless transition · Sudden stop
- **Audio** — Describe ambient sound, music, speech, or singing. Place spoken dialogue in quotation marks.
  - Ambient Settings: Coffeeshop noise · Wind and rain · Forest ambience with birds
  - Dialogue Style: Energetic announcer · Resonant voice with gravitas · Distorted radio-style · Robotic monotone · Childlike curiosity
  - Volume: Whisper · Mutter · Shout · Scream

For H3 Omni RGB/Canny/Depth/Combined and FLUX image-to-video, read
[the reference-video cards](references/reference-video.md) before quoting.
For music (MiniMax Music 3), read [the music card](references/music.md).

## LTX cards

### LTX-2.5 Fast · Text to video (`ltx-2-5-fast`)

| Field   | Value                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request | `"generator": "video", "model": "ltx-2.5"`                                                                                                                   |
| Route   | `router`, `ltx/ltx-2-5-fast` on Comfy Router; needs a Comfy key. Open weights                                                                                |
| Source  | `shared/registry.ts`, `shared/comfy/ltx.ts`, `shared/controls.ts`                                                                                            |
| Length  | 2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18 or 20 seconds; 25 fps                                                                                                   |
| Frame   | `16:9` or `9:16` (any other ratio falls to landscape); `hd` 1280×720, `fhd` 1920×1080, `qhd` 2560×1440, `uhd` 3840×2160, or portrait                         |
| Cost    | Quote first. Estimated at 27.16, 39.22, 57.33 or 90.52 Comfy credits a second (HD to UHD), 210 credits a dollar; the run's real cost arrives with the result |
| Camera  | The eleven LTX moves, LTX's shot sizes and angles; LTX wording                                                                                               |
| Guide   | [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide)                                                                                             |

Example: `genobi_quote {"generator": "video", "model": "ltx-2.5", "description": "A chrome chair stands on a circular plinth in a quiet gallery. Soft north light falls across the floor.", "camera": {"shot-sizes": "wide", "angles": "eye-level", "movements": "dolly-in"}, "cameraEnabled": true, "duration": 4, "resolution": "hd", "aspectRatio": "16:9"}`

### LTX-2.5 · Open workflow (`ltx-2-5-open`)

| Field   | Value                                                                                                            |
| ------- | ---------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "video", "model": "ltx-2.5-open"`                                                                  |
| Route   | `workflow`, `workflow/ltx-2-5-t2v` on the selected Comfy destination                                             |
| Source  | `shared/comfy/akuspace.ts`, `shared/comfy/ltx-frame.ts`                                                          |
| Length  | Whole seconds 2–20, 24 fps; frames = seconds × 24 + 1. 8s = 193 frames, about 8.04s encoded                      |
| Frame   | Seven studio ratios; exact width/height presets aligned to 64 for this two-stage graph. No hidden resolution cap |
| Cost    | Quote first. GPU time on Comfy Cloud; estimated using Fast rates                                                 |
| Camera  | LTX's shot sizes, angles and eleven moves                                                                        |
| Guide   | [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide)                                                 |

### LTX-2.5 · Acoustic Space, text to video (`ltx-2-5-akuspace`)

LTX-2.5 Fast's graph plus the AKUSPACE LoRA, which shapes where the sound is
heard, not where the camera is. The `genobi-akuspace` skill has the detail:
each preset's caption, the run location and running without the LoRA. One
workflow today:
[`workflows/ltx-2-5-akuspace-t2v.json`](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-2-5-akuspace-t2v.README.md).

| Field   | Value                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "video", "model": "ltx-2.5-akuspace"`, plus a required `acoustic` treatment                                                                               |
| Route   | `workflow`, `workflow/ltx-2-5-akuspace-t2v` on Comfy Cloud; needs a Comfy key. Open weights                                                                             |
| Source  | `shared/registry.ts`, `shared/comfy/akuspace.ts`, `shared/acoustic.ts`, `workflows/ltx-2-5-akuspace-t2v.README.md`                                                      |
| Length  | Whole seconds 2–20; 24 fps and `8n+1` frames. Eight seconds = 193 frames                                                                                                |
| Frame   | Seven studio ratios; explicit aligned dimensions. Landscape: 1280×704, 1920×1088, 2560×1472, 3840×2176. No silent tier cap                                              |
| Cost    | Quote first. Comfy Cloud bills GPU time; the studio estimates it at LTX-2.5 Fast's rate and keeps that estimate (marked `est.`), since Cloud reports no credits per run |
| Camera  | The eleven LTX moves, LTX's shot sizes and angles; LTX wording                                                                                                          |
| Guide   | [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide), then the AKUSPACE caption below                                                                       |

**The treatment.** `acoustic` is `{"mode", "preset", "level"}` from the AKUSPACE
node pack's presets (version 4, release 0.5):

| `mode`    | `preset`                                               | `level`                         |
| --------- | ------------------------------------------------------ | ------------------------------- |
| `room`    | `small_room`, `empty_club`, `medium_room`, `cathedral` | `low`, `mid` (Moderate), `high` |
| `outside` | `outdoor_day`, `outdoor_night`                         | `low`, `high`                   |
| `sfx`     | `dual_delay` (experimental)                            | `low`, `high`                   |

The studio appends the trained caption, trigger first, exactly as the AKUSPACE
Prompt node would, for example `AKUSPACE in an empty club, heavy broad
hard-surface reflections and a 1.2-second reverb decay, no crowd`. Do not
write AKUSPACE wording into the description. An optional `text` (up to 600
characters) replaces the caption after the protected trigger; custom wording
is experimental, not a trained caption.

**Limits.**

- Comfy Router runs no LoRA, so it cannot apply AKUSPACE. The studio never
  sends a treatment to Router; a treatment on any other video model is
  refused, and this model without one is refused too. Off (dry) is LTX-2.5
  Fast.
- The run uses the Cloud library of the key that submits it: the
  `akuspace-ltx25-v0.5.safetensors` LoRA must be imported there (Creator
  tier). If it is missing, Cloud refuses the run and the studio names the fix.
- Prompt enhancement is off in the graph, so the camera sentences and the
  treatment reach the encoder as written.

Example: `genobi_quote {"generator": "video", "model": "ltx-2.5-akuspace", "description": "Raw concrete walls catch hard slices of white light in an empty hall.", "camera": {"shot-sizes": "establishing", "movements": "crane"}, "cameraEnabled": true, "duration": 4, "resolution": "hd", "aspectRatio": "16:9", "acoustic": {"mode": "room", "preset": "cathedral", "level": "mid"}}`

**Planned AKUSPACE workflows, not runnable yet.** Do not quote them or describe
them as available:

- AKUSPACE with audio input, if the LoRA can process existing audio.
- AKUSPACE on a segment: only a chosen range of the track through the reverb
  LoRA, crossfaded back in.

The public reference workflows are in
[ComfyUI-Koshi-Nodes](https://github.com/koshimazaki/ComfyUI-Koshi-Nodes/tree/main/workflows/akuspace).

### LTX-2.5 Pro · Text to video (`ltx-2-5-pro`)

| Field   | Value                                                                                                                |
| ------- | -------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "video", "model": "ltx-2.5-pro"`                                                                       |
| Route   | `router`, `ltx/ltx-2-5-pro` on Comfy Router; needs a Comfy key. Not open: Lightricks serves Pro through its API only |
| Source  | `shared/registry.ts`, `shared/comfy/ltx.ts`                                                                          |
| Length  | Same supported seconds as Router Fast                                                                                |
| Frame   | 16:9 or 9:16, 720p or 1080p only (Router model schema)                                                               |
| Cost    | Quote first. 36.21 credits a second at HD and 51.29 at FHD; higher tiers are not offered                             |
| Camera  | The eleven LTX moves, LTX's shot sizes and angles; LTX wording                                                       |
| Guide   | [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide)                                                     |

Using Pro makes a provenance card Semi-open or Premium; prefer Fast for the
open route.

## FLUX cards

BFL's own pages are the source for every FLUX card:
[camera prompting guide](https://docs.bfl.ai/guides/prompting_video_camera_terms),
[Generate a video with FLUX 3](https://docs.bfl.ai/api-reference/utility/generate-a-video-with-flux-3),
[Video upscale](https://docs.bfl.ai/flux_tools/flux_video_upscale) and
[Pricing](https://docs.bfl.ai/quick_start/pricing). FLUX entries are not open
weights except Klein. Klein and image prompting pages checked 23 October 2026;
the image guide covers subject, setting, light, framing and spatial relationships.

### FLUX 3 · Text to video (`flux-3-video`)

| Field   | Value                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| Request | `"generator": "video", "model": "flux-3"` (the default model)                                                      |
| Route   | `router`, `bfl/flux-3-video` on Comfy Router with a Comfy key, or BFL direct with a BFL key                        |
| Source  | `shared/registry.ts`, `shared/controls.ts`, `shared/presets.ts`                                                    |
| Length  | Whole seconds from 5 to 20                                                                                         |
| Frame   | `21:9`, `2:1`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`; `hd`, `fhd`, `qhd`, `uhd`; `"draft": true` for a cheaper draft |
| Cost    | Quote first. Estimated at 17, 29, 40 or 80 cents a second (HD to UHD), 6 cents a second as a draft                 |
| Camera  | The ten FLUX moves, every shot size and angle; BFL wording, one clause per line                                    |
| Guide   | [BFL camera prompting guide](https://docs.bfl.ai/guides/prompting_video_camera_terms)                              |

The prompt is the scene, then shot size, angle and movement, each as its own
line. The description is at most 1,200 characters. Audio is always generated.

Example: `genobi_quote {"generator": "video", "model": "flux-3", "description": "A chrome chair stands on a circular plinth in a quiet gallery.", "camera": {"shot-sizes": "full", "angles": "low-angle", "movements": "arc"}, "cameraEnabled": true, "duration": 5, "resolution": "hd", "aspectRatio": "16:9", "draft": true}`

### FLUX Video Upscale (`flux-video-upscale`)

| Field   | Value                                                                                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "upscale", "model": "flux-3"` (the default), with `sourceId`, `upscaleFactor`, `upscaleCreativity` and `resolution`                                                                 |
| Route   | `router`, `bfl/video-upscale-v1` on Comfy Router with a Comfy key, or BFL direct (`flux-tools/video-upscale-v1`) with a BFL key. The queued Router route is unverified until a real run           |
| Source  | `shared/registry.ts`, `shared/presets.ts`                                                                                                                                                         |
| Length  | The source clip's own length                                                                                                                                                                      |
| Frame   | `upscaleFactor` 1.5 to 3 (default 2); output capped at 13.75 megapixels a frame; source up to 20 s, longer as a [split upscale](references/upscale-parts.md)                                      |
| Cost    | Quote first. Estimated at BFL's $0.07 per output megapixel-second precise (`upscaleCreativity` 0), $0.10 creative (1), from the measured source; Router bills Comfy credits, read from the result |
| Camera  | None                                                                                                                                                                                              |
| Guide   | [BFL video upscale](https://docs.bfl.ai/flux_tools/flux_video_upscale), [Router schema](https://docs.comfy.org/router-schemas/bfl/video-upscale-v1.json)                                          |

`sourceId` is the Ready job id of a clip this session made. The shared
validator still asks every upscale for a description (empty is fine), a
camera, a whole-second duration from 5 to 20 and a video `resolution` (`hd`,
`fhd`, `qhd` or `uhd`); the upscale sends none of them, and the quote is read
from the measured source. `upscalePrompt` (up to 1,200) is its only prompt.

Example: `genobi_quote {"generator": "upscale", "description": "", "camera": {}, "duration": 5, "resolution": "hd", "sourceId": "job-1", "upscaleFactor": 2, "upscaleCreativity": 0}`

### SeedVR2 · Video upscale, open workflow (`seedvr2-upscale`)

| Field   | Value                                                                                                                                                                                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request | `"generator": "upscale", "model": "seedvr2-upscale"`, with `sourceId` and `upscaleFactor`; no prompt, no creativity                                                                                                                                                                                                                              |
| Route   | `workflow`, `workflow/seedvr2-upscale`: Comfy's core-node SeedVR2 3B int8 graph on a local ComfyUI (no key) or Comfy Cloud (Comfy key)                                                                                                                                                                                                           |
| Source  | `shared/comfy/seedvr2.ts`, `workflows/seedvr2-upscale.README.md`                                                                                                                                                                                                                                                                                 |
| Frame   | The clip's own length, fps and sound; `upscaleFactor` 1.5 to 3 (default 2); a source the amount takes past 13.75 megapixels a frame is refused, naming the amount that fits                                                                                                                                                                      |
| Cost    | Quote first. $0 on a local ComfyUI; on Comfy Cloud held at FLUX Video Upscale's precise rate (GPU time billed by Comfy)                                                                                                                                                                                                                          |
| Camera  | None                                                                                                                                                                                                                                                                                                                                             |
| Guide   | [SeedVR2 page](https://github.com/koshimazaki/Genobi/blob/main/docs/seedvr2-upscale.md); open weights, Apache-2.0                                                                                                                                                                                                                                |
| Long    | Past 20 s, either upscaler in parts (the `genobi-upscale` skill; [split upscale](references/upscale-parts.md)): `genobi_upscale_parts_plan`, then `genobi_upscale_parts_confirm` once the person accepts the sum; read with `genobi_upscale_parts`; a failed part only via `genobi_upscale_parts_retry` and `genobi_upscale_parts_retry_confirm` |

### FLUX 3 Image Klein · Image, open workflow (`flux-3-klein`)

| Field   | Value                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "image", "model": "flux-3-klein"`                                                                                                                                                                                                                                                                                                                            |
| Route   | `workflow`, `workflow/flux-3-klein-t2i` on Comfy Cloud; needs a Comfy key. Open weights                                                                                                                                                                                                                                                                                    |
| Source  | `shared/registry.ts`, `shared/comfy/klein.ts`, `shared/image.ts`, `workflows/flux-3-klein-t2i.README.md`                                                                                                                                                                                                                                                                   |
| Frame   | `imageAspectRatio`: every BFL ratio except `auto`; `imageResolution`: `768sq`, `1k`, `1.5k`, `2k` or `4k`                                                                                                                                                                                                                                                                  |
| Cost    | Quote first. Estimated at BFL's Klein prices ($0.008, $0.009, $0.011, $0.014, $0.036 by tier); Cloud bills GPU time                                                                                                                                                                                                                                                        |
| Camera  | Shot size and angle only, as lines after the caption; movement is dropped                                                                                                                                                                                                                                                                                                  |
| Guide   | [BFL Klein](https://docs.bfl.ai/flux_3/flux3_image_klein), [image prompting](https://docs.bfl.ai/guides/prompting_unified_building), [camera wording](https://docs.bfl.ai/guides/prompting_video_camera_terms), [bounding boxes](https://docs.bfl.ai/flux_3/flux3_image_bounding_boxes), [camera prompting guide](https://docs.bfl.ai/guides/prompting_video_camera_terms) |

BFL: "Do not use Klein without its prompt upsampler." The graph keeps the
upsampler on for a plain caption. Its system prompt (node `18:14`) instructs it
to preserve explicit camera and spatial cues; this is a graph instruction, not a
measured fidelity claim. It switches the upsampler off when the description
carries box rows after the caption: a JSON array of `{"id", "bbox", "desc"}`,
each `bbox` `[top, left, bottom, right]` in integers from 0 to 1000. No reference images on this run. The description is at most
12,000 characters. The
[workflow README](https://github.com/koshimazaki/Genobi/blob/main/workflows/flux-3-klein-t2i.README.md)
records which parts of the graph have been checked against Cloud.

Example: `genobi_quote {"generator": "image", "model": "flux-3-klein", "description": "A ceramic cup on a plaster plinth, soft north light.", "camera": {"shot-sizes": "close-up", "angles": "high-angle"}, "cameraEnabled": true, "imageAspectRatio": "1:1", "imageResolution": "1k"}`

### FLUX 3 Image Klein · Image, API (`flux-3-klein-api`)

The same model on BFL's hosted endpoint, a second way to run `flux-3-klein`.

| Field   | Value                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "image", "model": "flux-3-klein-api"`                                                                                                                                                                                                                                                                                                                        |
| Route   | `bfl`, `flux-3-image-klein` on BFL direct; needs a BFL key (Router lists no Klein). Open weights                                                                                                                                                                                                                                                                           |
| Source  | `shared/registry.ts`, `shared/image.ts`                                                                                                                                                                                                                                                                                                                                    |
| Frame   | Every BFL ratio, `auto` included; the same five tiers                                                                                                                                                                                                                                                                                                                      |
| Cost    | Quote first. BFL's Klein prices, as above                                                                                                                                                                                                                                                                                                                                  |
| Camera  | Shot size and angle only, as lines after the caption                                                                                                                                                                                                                                                                                                                       |
| Guide   | [BFL Klein](https://docs.bfl.ai/flux_3/flux3_image_klein), [image prompting](https://docs.bfl.ai/guides/prompting_unified_building), [camera wording](https://docs.bfl.ai/guides/prompting_video_camera_terms), [bounding boxes](https://docs.bfl.ai/flux_3/flux3_image_bounding_boxes), [camera prompting guide](https://docs.bfl.ai/guides/prompting_video_camera_terms) |

Up to ten `imageReferences` (PNG, JPEG or WebP data URLs, 11 MB together); the
first is the image edited. A data URL is long: ask before reading a large
image into a tool call. Klein makes images only; edits run on FLUX 3 Edit.

### FLUX 3 · Image (`flux-3-image`)

| Field   | Value                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "image", "model": "flux-3"`                                                                                                                                                                   |
| Route   | `router`, `bfl/flux-3-image` on Comfy Router, or BFL direct with a BFL key                                                                                                                                  |
| Source  | `shared/registry.ts`, `shared/image.ts`                                                                                                                                                                     |
| Frame   | Every BFL ratio, `auto` included; `768sq`, `1k`, `2k` or `4k`; `imageGrounding` for BFL's web grounding                                                                                                     |
| Cost    | Quote first. $0.041, $0.048, $0.10 or $0.607 by tier                                                                                                                                                        |
| Camera  | Still framing: shot size and angle; no motion                                                                                                                                                               |
| Guide   | [image prompting](https://docs.bfl.ai/guides/prompting_unified_building), [camera wording](https://docs.bfl.ai/guides/prompting_video_camera_terms), [BFL pricing](https://docs.bfl.ai/quick_start/pricing) |

### FLUX 3 · Edit (`flux-3-edit`)

| Field   | Value                                                                                                                                                                                                       |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "edit", "model": "flux-3"`, with at least one `imageReferences` entry                                                                                                                         |
| Route   | `router`, `bfl/flux-3-image` on Comfy Router, or BFL direct with a BFL key                                                                                                                                  |
| Source  | `shared/registry.ts`, `shared/image.ts`                                                                                                                                                                     |
| Frame   | As FLUX 3 Image                                                                                                                                                                                             |
| Cost    | Quote first. As FLUX 3 Image                                                                                                                                                                                |
| Camera  | Still framing: shot size and angle; no motion                                                                                                                                                               |
| Guide   | [image prompting](https://docs.bfl.ai/guides/prompting_unified_building), [camera wording](https://docs.bfl.ai/guides/prompting_video_camera_terms), [BFL pricing](https://docs.bfl.ai/quick_start/pricing) |

## Listed but not runnable

`genobi_models {"status": "coming"}` lists these with a note; none can be
quoted: `ltx-hdr` (LTX HDR) and `ltx-alpha` (LTX Alpha) need the LTX pack on
Comfy Cloud, and `flux-3-omni` (FLUX 3 Omni) is not released. The
[workflows page](https://github.com/koshimazaki/Genobi/blob/main/workflows/README.md)
names the planned graphs: LTX image to video, the LTX-2.5 latent spatial
upscaler and `FluxVideoUpscaleNode`, and a plain LTX-2.5 Cloud entry whose
graph (`workflows/ltx-2-5-t2v.json`) nothing runs yet.

## Rules

- Never call `genobi_submit` without a price the person accepted in this
  conversation, and never retry a submission with a new key.
- Never ask for, print or store a provider key. The studio holds one key at a
  time; if a card needs the other kind, tell the person rather than switching.
- Cite the guides; do not promise that a model will follow a camera move.
