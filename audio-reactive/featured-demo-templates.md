# Featured Genobi demos — two template cards, their shipped templates

**Status:** both cards now have bundled Gallery templates. Mecha × Fruits shipped as [Dance with Fruits](../docs/fruits-swap.md) (`fruits-swap`); Reactive Spaces shipped as [Acoustic Spaces v2](../docs/audio-reactive-drop.md) (`audio-reactive-drop`), the owner's selected spaces video of 3 November 2026, with [Adaptive reverb](../docs/adaptive-reverb.md) kept as its v1. This page is the design record of what each card swaps and rebuilds.  
**Brief:** 3 November 2026. Keep the owner's existing videos **unchanged**. Do not generate substitute artwork, change their cuts, overwrite their sound, or imply that a still swap edits an already-rendered MP4.

This is the public-Gallery packaging for the [audio-reactive workflow](README.md), [fruits recipe](videos/fruits.md), and [spaces recipe](videos/spaces.md). It **does not replace** the three technical experiment families (Fruits / Rooms / Objects) or the [agent skill](../plugins/genobi/skills/genobi-audio-reactive/SKILL.md).

## Exactly two cards

| Gallery card                               | Videos shown                                                                                                                                                                                                                                  | Audio                                                                     | Primary action                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Mecha × Fruits** · Character and objects | The **swap edit** (3 November: mecha, gorilla, gold gundam with watermelon, unicorn, one per loop, 25 s) and the one-loop gorilla (7 s) as versions; the two owner character videos as A/B originals; no auto-stitch or newly generated media | **Dance with Fruits**, the 9 s loop tiled per loop                        | **Make my version** → swap character, fruit or audio                            |
| **Reactive Spaces** · 3D and acoustics     | The official spaces video, **Acoustic Spaces v2**: towers → cathedral → inside a pyramid → outside it → studio, five room files                                                                                                               | **Adaptive Reverb v2**, with each room's measured CPU room sound under it | **Make my version** → swap an architectural reference or change room dimensions |

The Reactive Spaces card is the **Acoustic Spaces v2** template (`/media/template-gallery/audio-reactive-drop.mp4`, 32.33 s), the newer spaces MP4 the owner selected on 3 November 2026; the earlier **Adaptive reverb** cut (`/media/template-gallery/adaptive-reverb.mp4`, ~30.46 s) stays as its own card, version one. Replace a source only by explicit selection, not by assuming a screenshot is the file. The two character MP4 files are not present under `public/media/template-gallery/` on this branch, so no live media links or working character cards are claimed yet. The draft [manifest](featured-demo-templates.json) intentionally leaves their video URLs `null`.

**Originals first:** watch each video as it is; any swap starts a **new derived version**, never changes the original. A still/image drop can be swapped immediately as a project reference; to change _content within the video_, create a new guided LTX render with paid submission only after explicit approval.

## Two kinds of change

For agents, viewers and reviewers: Genobi treats a swap in one of two ways, and says which before anything happens.

- **Swap an asset in an existing edit.** Replacing a source slot on the Director/Editor timeline, or a reference image in the project, is immediate and free. It changes what the edit uses, not the pixels of an already rendered clip.
- **Change what appears inside a rendered LTX clip.** This is a rebuild, not an edit:
  1. If the scene changed (geometry, voxel colours, room dimensions), the agent edits the study code in `scripts/experiments/recipes-*.ts` and re-captures the Three.js guide. This is the "agent rebuilds the scene" step.
  2. The agent edits the first still (the whole still, or one `keyframes.json` region of it) with **FLUX 3 Klein**, a paid image edit that is quoted first.
  3. The affected 193-frame window(s) are re-rendered with **LTX-2.5 22B distilled + the Layout-to-Render IC-LoRA** on a rented GPU box: about 8 minutes and about $0.25 per clip on an RTX PRO 6000, plus the box rental.
  4. The windows are re-stitched and the audio re-synced with ffmpeg.

Nothing is rendered without a quote and the person's yes.

| Step                                                                                  | Tool or model                                                                       | Paid                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------ |
| Guide capture (RGB, depth, `control.wav`, `keyframes.json`; `room-wet.wav` for rooms) | Three.js World Builder study, no model, CPU, about a minute per capture             | No                             |
| First still, or a region edit of it                                                   | FLUX 3 Klein                                                                        | Yes, quoted first              |
| Video, one 193-frame window per clip                                                  | LTX-2.5 22B distilled + Layout-to-Render IC-LoRA (open weights) on a rented GPU box | Yes (box time), approved first |
| Room reverb (spaces only)                                                             | Acoustics and Reverb nodes, CPU impulse response of the study's room                | No                             |
| Stitch and audio                                                                      | ffmpeg                                                                              | No                             |

Kling is not used anywhere in this workflow; "Klein" always means FLUX 3 Klein.

**Shape follows the guide; colour and surface follow the still.** The first still pins colour (a red apple morphing into a banana stayed red). A swapped subject whose shape differs a lot from the study's voxel key needs that key changed and a recapture, not only a still edit.

## 1. Mecha × Fruits — one card, two character versions

**Presentation:** the featured video is the **swap edit** made on 3 November 2026: one character per 9 s loop of **Dance with Fruits**, cut on the measured beat grid, with a Nokia-font card over the last two beats of each loop. Three characters make 25 s (mecha, gorilla, gold gundam with watermelon on the drop beat, unicorn); one character makes 7 s. The two owner character videos stay as A/B originals in the same card. Keep the exact files, original duration, internal cuts and soundtrack. The files exist on the owner's machine (`~/Downloads/genobi-run3-2026-11-03/fruits-swap-edit/`), reproducible from [`edit/fruits-swap-build.sh`](edit/fruits-swap-build.sh); they are not bundled yet, so do not point the Gallery to an unbundled local or remote path. The template contract (slots, what the agent does with each, what is proven) is [videos/fruits-template.md](videos/fruits-template.md); the rule for cutting is in [videos/fruits.md](videos/fruits.md#the-general-rule-any-dance-edit-on-a-loop); the process log is [`edit/LOG.md`](edit/LOG.md).

**Card copy:** _A dancing mecha and morphing fruits, choreographed by the track. Keep the rhythm; bring your own dancer or fruit._

**Viewer journey**

1. Preview the original **A** / **B** videos, including their existing music. No prompt is needed to watch.
2. **Make my version** opens the existing swap-only version panel. Offer **Character**, **Left fruit**, **Right fruit**, and optional **Look / stage** as simple drop slots, keeping the original as a reversible source.
3. Image-only swaps update the **references**, not the pixels of the original MP4. **Recreate in Camera** can produce a new aligned first still; it must not trigger a paid call automatically.
4. If the person chooses **Build new video**, hand an agent the original audio window, selected still(s), preset and frame-0 `keyframes.json` regions. The agent offers a visible plan, quote and explicit paid approval before edit/render. Result enters **Assets / Gallery** as a new version.

**Repeatable new-render route:** every character is rendered once, on the same window-0 explode guide (193 frames, the loop's first 8.04 s), and the swap edit places one render per loop; a window-0 render fits any loop because every loop is the same audio. The older three-stage montage (**mecha burst → fruit morph / Rubik → mecha returned**, w0/w1/w2 on the tripled loop) remains a recipe in [videos/fruits.md](videos/fruits.md), not the shipped structure. Do not silently turn the A/B original videos into either; use these only if someone requests a fresh piece.

- Start with `fruit-mecha`, `fruit-mecha-morph`, or `fruit-apple-banana` from [the presets](presets/README.md).
- Capture 1024×576, 193 frames, `--band-gain auto --motion-gain 1 --stage studio`, release 12 (release 30 and smoothing 5 for slower morphs).
- Use the named `robot`, `fruit-left`, and `fruit-right` rectangles in `keyframes.json`, not invented bounding boxes. The agent scales `regions.robot` to the still, pads it by about 10 percent so the raised arm fits, and shows it as the suggested box before any edit. **Align the replacement still with frame 0**; a colour-changing morph may need a second still at its peak.
- Render with existing LTX-2.5 22B distilled + Layout-to-Render IC-LoRA graph, then review and add the track. Do not call it character-consistent video-to-video editing or a real-time swap: it is a new guided render.

### What happens when you swap

The first swap offered is deliberately small (owner decision, 3 November 2026): change **one fruit**, or change **the character**. Later the same day the owner widened the template to three slots, **character**, **fruits** and **audio**, with one submission making one loop and up to three making three; that contract is [videos/fruits-template.md](videos/fruits-template.md).

The rebuild pipeline: the 9 s _Dance with Fruits_ loop → window 0 of the `fruit-mecha` explode study (193 frames at 24 fps, gain 1, release 12) → capture writes `rgb.webm`, `depth.webm`, `control.wav` and `keyframes.json` with frame-0 rectangles on the 1024x576 guide (`regions.robot`, `regions.fruit-left`, `regions.fruit-right`; the single-fruit study writes `regions.fruit`) → one first still per character, exactly 16:9 and aligned with frame 0 → one LTX render per character to 2048x1152, CFG 1, seed 42 → the swap edit: one render per loop, cut on the measured grid (loop 9.0 s, beat 0.592 s, kicks from beat 8), cards over beats 13 and 14, the 9 s loop tiled as the audio. The loop file is sample-aligned with the renders; the tripled wav (`mecha-fruits-A2-x3.wav`) is 60 ms off and is no longer the sync reference.

| Swap            | What the agent does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Windows re-rendered                                      | Paid                                       |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------ |
| One fruit       | The person drops a fruit image or names a fruit. The agent edits only the `fruit-left` or `fruit-right` rectangle of the first still with Klein (quote, yes, submit) and changes the fruit noun in the render prompt. If the new fruit's shape differs a lot from the voxel key, it also recolours or reshapes that fruit's voxels in the study (catalogue fruits today: banana, papaya, apple, orange, watermelon) and recaptures. The gold gundam loop is the proof: watermelon and a green fruit on the same guide.                                                                                                                                                                                                                                                                                                                                      | The one window-0 render of the loop the fruit appears in | Yes: Klein edit plus one LTX clip          |
| Character       | The person drops one reference image. The agent shows the suggested box (`regions.robot` scaled to the still, padded about 10 percent), and with a yes edits only that rectangle of the first still with Klein ("swap the mecha for this character"), then changes the noun in the render prompt. The dancer is the World Builder avatar whose motion is the RGB/depth guide, so the same rig is kept: the swap changes who it looks like, not how it moves. Any character that can take the mecha's pose works; a gorilla, a unicorn, a pony and a pink cat rendered on 3 November from the owner's Genobi Image stills. A Klein region edit driven by a reference image has not been tested on this workflow; the tested path is a region edit driven by the person's words, and Klein's `--aesthetic-image` copies composition and is not the mechanism. | One window-0 render per character                        | Yes: Klein edit plus one LTX clip          |
| More characters | Each extra character is one more loop (one more window-0 render) and one more card; the first submission is the main character and opens the piece. One loop is 7 s, three are 25 s; the build stops at three because the loop wears out.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | One window-0 render per added character                  | Yes: one Klein edit plus one LTX clip each |
| Audio           | A supplied track, or new music from MiniMax Music 3 from a caption. The whole motion is derived from the track's low band, so the agent measures the new loop and beat periods from the audio (never assumed), recaptures window 0 on the new track (morphs start on a quiet low-band frame), re-renders every character, recomputes the cut frames from the measured grid and tiles the new loop as the audio. The most expensive swap.                                                                                                                                                                                                                                                                                                                                                                                                                    | Every character's window-0 render                        | Yes: one LTX clip per character            |

The rig stays humanoid: a vehicle that should move like a vehicle is `ship-mecha`, a separate Objects study, not a character swap.

**Inputs that come in:** the loop (`mecha-fruits-9s-A2-starts-on-voice.mp3`, 9.0 s, an owner file, not in the repository), the owner's character stills (not in the repository), the reference image for the swap, and the character MP4s: the swap edit and the one-loop gorilla exist in the owner's edit folder and the two A/B originals on the owner's machine; none is in the repository yet, so their URLs stay `null`.

**Known limits:** fruits sit at ±0.95 m; motion gain 1 (gain 2 pushed the fruits out of frame); the morph take does not open on a clean rest pair because the loop's bass is high at frame 0; a new fruit from a name is catalogue-only (prompt-to-voxel is not built); the suggested-box step has no UI yet; this is a new guided render, not character-consistent video-to-video editing and not a real-time swap.

## 2. Reactive Spaces — one existing spaces video

**Presentation:** the official template is **Acoustic Spaces v2** ([docs/audio-reactive-drop.md](../docs/audio-reactive-drop.md)): five World Builder rooms on the owner's track Adaptive Reverb v2, each room its own file and shot, each room's measured CPU room sound under its section. Show the spaces **towers → cathedral → pyramid inside → pyramid outside → studio** as chapters or annotations, **not** as invented or regenerated previews. The earlier Adaptive Reverb cut remains as version one.

**Card copy:** _Skyscrapers contract, rooms breathe and the acoustics follow the architecture. Replace a space and let your agent build its geometry._

**Viewer journey**

1. Play the original video **as-is**. Show the five named spaces and the **Adaptive Reverb v2** soundtrack without silently editing the original.
2. **Make my version** provides a still/reference slot for each space, plus **Small / Original / Large** and room dimension controls. Keep the room sizes the studies use as the reference: the hall (`party-walls`) is 13 x 16 x 5.5 m and the booth (`studio-walls`) 3.2 x 2.4 x 2.5 m.
3. When a **space image changes**, ask an agent to **reconstruct an editable Three.js guide** using the reference as a design target, not as a guaranteed metrically exact scan. Display and allow edits to the proposed geometry, camera, dimensions and acoustic zones. If the reference is insufficient, let the person approve or edit a primitive-room approximation.
4. **Rebuild guide** captures RGB, depth, start look and `room-wet.wav` from the new geometry, with the spatial dimensions driving the impulse response. A look-only/material edit may reuse geometry if camera and layout are unchanged; a structural/size edit must recapture and recompute acoustics.
5. **Make new video** passes the verified guide/look to the same LTX graph and requires the person's approval for every paid step. The rendered video and processed room audio become a **new** version in Assets / Gallery.

**Four-window capture reference** (for **new** ~32.167 s edits, not the 30.46 s finished Gallery cut):

| Section   | Study                                           | Audio-source start | Notes                                    |
| --------- | ----------------------------------------------- | ------------------ | ---------------------------------------- |
| Towers    | `towers-descent`                                | 0.0000 s           | Motion in the buildings; camera descends |
| Cathedral | `cathedral-gallery` or `cathedral-gallery-grow` | 8.0417 s           | Walls slide or grow toward the centre    |
| Hall      | `party-walls`                                   | 15.6916 s          | Shifted to an open/quiet frame           |
| Booth     | `studio-walls`                                  | 23.6083 s          | Shifted to an open/quiet frame           |

These are **source offsets**, not all the edit's cut times. Before stitching, align any shifted footage and `room-wet.wav` to the intended timeline: do not let the quiet-frame source shift introduce a music/reverb discontinuity. Keep the approved arrangement of the person's soundtrack. Use motion gain 1 and scene-native room size, not gain 2 saturation.

### What happens when you swap

**What the existing cut is.** The Gallery cut is 30.46 s at 1280x720 with four rooms: towers 0–7.9 s, cathedral 7.9–15.9 s, hall 15.9–22.5 s, booth 22.5–30.5 s. Its pictures are LTX-2.5 Layout-to-Render shots. Its sound is the original track processed on CPU with each scene's geometric impulse response (the Acoustics and Reverb nodes). The AKUSPACE LoRA was tested separately and is **not** what made this cut's audio. The learned room-audio route is experimental, and the model would need more training. That cut is now version one. The owner selected the newer spaces video on 3 November 2026: Acoustic Spaces v2, 32.33 s at 1920 × 1080 with five rooms (towers, cathedral, pyramid inside, pyramid outside, studio), each room's own measured CPU room sound (Sabine RT60 from the room's volume and absorption, image-source and diffuse-tail IRs) at wet 0.45 under the dry track; its room files, track and every overlay are swappable layers ([docs/audio-reactive-drop.md](../docs/audio-reactive-drop.md)).

The rebuild pipeline for a new version: a World Builder room study (`towers-descent`; `cathedral-gallery` or `cathedral-gallery-grow`; `party-walls`, the 13 x 16 x 5.5 m hall; `studio-walls`, the 3.2 x 2.4 x 2.5 m booth) → capture writes `rgb.webm`, `depth.webm`, `control.wav` and `room-wet.wav` (the CPU reverb of the same room, shrinking as the walls close) → still → LTX render → mix `room-wet.wav` under the dry excerpt (dry 0.9, wet 0.7) → stitch towers, cathedral, hall, booth → lay the full track over the cut with each window's wet reverb at its start time. Window starts are 0, 8.0417, 15.6916 and 23.6083 s; the hall and booth start on quiet frames.

The first swap offered is **one space** (owner decision and scope cut, 3 November 2026), in three ways of rising cost:

| Swap                     | What the agent does                                                                                                                                            | Windows re-rendered            | Paid                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| (a) Look only            | A new first still from the preset's `frame-0000.png`, with surfaces and light changed and the same geometry. No recapture; the reverb stays the same.          | That one window                | Yes: Klein edit plus one LTX clip                                              |
| (b) Room dimensions      | The agent edits the study's numbers in `recipes-*.ts` and recaptures, which gives a new `room-wet.wav`; then re-renders and re-mixes.                          | That one window                | Yes: one LTX clip (plus a Klein still if the look must follow the new framing) |
| (c) Room reference image | The agent proposes an editable primitive-room approximation of the reference, as a design target and not a metric scan, for the person to review; then as (b). | That one window                | Yes: as (b)                                                                    |
| Track                    | The agent recaptures all four windows (wall studies start on quiet frames), re-renders all four, and re-mixes the reverb.                                      | Towers, cathedral, hall, booth | Yes: four LTX clips                                                            |

**Inputs that come in:** the track (`Adaptive Reverbv2`, an owner file, not in the repository), the owner's room stills (not in the repository), and, for (c), the room reference image.

**Known limits:** the reverb is an approximate geometric response, not a measurement; the booth's quiet-frame start opens at only 0.60 of its width; a reference image yields an approximation the person edits, not a reconstruction of the real room.

## One simple UI contract

```text
Gallery
  ├─ Mecha × Fruits     [Watch swap edit] [Watch A] [Watch B] [Make my version]
  └─ Adaptive Reverb    [Watch]              [Make my version]

Make my version → Swap references → Review result
                                 ├─ Use in current edit (source slot only)
                                 └─ Rebuild guide → Review → Quote/approve render → Assets
```

Do **not** restore automatic generation to the swap-only **Make my version** dialog (PR #64). The **Recreate in Camera** control can take a person to the generator but must not pay or submit on navigation. Agent reconstruction is a deliberate step, not an automatic consequence of merely opening a card.

## How reviewers regenerate

The owner renders on a rented Vast box with `scripts/vast/box/run-queue.sh`. Reviewers use the `layout-to-video` selector of the `genobi-ltx-world` Comfy deployment instead, described in [Comfy deploy](../docs/comfy-deploy.md): fixed 1024 × 576, 193 frames, 24 fps, which is exactly one template window.

- **Access:** an access code from the competition submission unlocks a capped number of runs paid by the owner's workspace (default cap 10). The mechanism is `docs/tester-access.md`, arriving in a separate PR and off by default. The code itself never appears in the repository.
- **Which card:** Mecha × Fruits is the reusable regeneration test: one window-0 render per character, then `edit/fruits-swap-build.sh` cuts the loops. Reactive Spaces also needs LTX runs for a new version.
- **Every run** is quoted and confirmed before submission.

## Media hand-off and acceptance

- **Required:** the swap edit (`fruits-swap-v1.mp4`, 25 s) and the one-loop gorilla (`fruits-swap-gorilla-1loop.mp4`, 7 s) from the owner's edit folder, the two original character video files with their existing audio, and confirmation whether the pictured spaces video is the already-bundled Adaptive Reverb MP4 or a newer export. A screenshot alone does not carry an MP4.
- **Optional:** their first-frame stills, individual fruit/character assets, and four room reference images. **Do not substitute stock media** while waiting for these.
- Integrate existing media in `public/media/template-gallery/` **without altering originals**. Make optimized previews/posters from the _same video frames_ only once those originals are available and their rights/credits are confirmed.
- Wire the two cards (one existing, one new) to `shared/gallery/catalogue.ts` and to the current Director/Editor copy and swap flow. Avoid duplicate Adaptive Reverb entries and keep agent/CLI project identities stable.
- Test A/B selection, sound retention, source provenance, missing-asset graceful states, keyboard/mobile accessibility, source swaps not triggering paid calls, project-copy isolation, one explicit agent rebuild, and approval gating of any LTX render.
- Verify format, lint, typecheck, tests, worker boundaries, build and a visual check before marking the PR ready.

**Implementation state:** the two Gallery templates have shipped (`fruits-swap`, `audio-reactive-drop`). Source-aware image reconstruction and A/B controls described above are still design, not shipped behaviour.
