# Featured Genobi demos — two template cards, three existing videos (draft)

**Status:** design and media-integration draft, not a shipped template or a completed render.  
**Brief:** 3 November 2026. Keep the owner's existing videos **unchanged**. Do not generate substitute artwork, change their cuts, overwrite their sound, or imply that a still swap edits an already-rendered MP4.

This is the public-Gallery packaging for the [audio-reactive workflow](README.md), [fruits recipe](videos/fruits.md), and [spaces recipe](videos/spaces.md). It **does not replace** the three technical experiment families (Fruits / Rooms / Objects) or the [agent skill](../plugins/genobi/skills/genobi-audio-reactive/SKILL.md).

## Exactly two cards

| Gallery card                               | Videos shown                                                                                                               | Audio                                                                     | Primary action                                                                  |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Mecha × Fruits** · Character and objects | Two owner-supplied **existing character videos**, A and B, selectable as versions; no auto-stitch or newly generated media | **Dance with Fruits**, already aligned with the originals                 | **Make my version** → swap character and/or fruit reference images              |
| **Reactive Spaces** · 3D and acoustics     | One **existing spaces video**, with skyscrapers → cathedral → large hall → recording booth                                 | **Adaptive Reverb**, including the space-derived room sound where present | **Make my version** → swap an architectural reference or change room dimensions |

The bundled Gallery already has a separate **Adaptive reverb** finished-cut template. Its existing original is at `/media/template-gallery/adaptive-reverb.mp4` (~30.46 s); **reuse rather than duplicate this card**. If the owner supplies a newer spaces MP4, replace the source by explicit selection, not by assuming a screenshot is the file. The two character MP4 files are not present under `public/media/template-gallery/` on this branch, so no live media links or working character cards are claimed yet. The draft [manifest](featured-demo-templates.json) intentionally leaves their video URLs `null`.

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

**Presentation:** the first two owner videos are A/B examples within the same card, both with **Dance with Fruits**. Keep the exact files, original duration, internal cuts and soundtrack. Their source files are requested for bundling; do not point the Gallery to an unbundled local or remote path.

**Card copy:** _A dancing mecha and morphing fruits, choreographed by the track. Keep the rhythm; bring your own dancer or fruit._

**Viewer journey**

1. Preview the original **A** / **B** videos, including their existing music. No prompt is needed to watch.
2. **Make my version** opens the existing swap-only version panel. Offer **Character**, **Left fruit**, **Right fruit**, and optional **Look / stage** as simple drop slots, keeping the original as a reversible source.
3. Image-only swaps update the **references**, not the pixels of the original MP4. **Recreate in Camera** can produce a new aligned first still; it must not trigger a paid call automatically.
4. If the person chooses **Build new video**, hand an agent the original audio window, selected still(s), preset and frame-0 `keyframes.json` regions. The agent offers a visible plan, quote and explicit paid approval before edit/render. Result enters **Assets / Gallery** as a new version.

**Repeatable new-render route (not a claim about the existing originals):** the tested fruit pipeline can assemble **three 193-frame shots at 24 fps** (~24.125 s of three 8.0417 s windows) on the tripled _Dance with Fruits_ loop. Its three-stage recipe is **mecha burst → fruit morph / Rubik → mecha returned or region-swapped**. Do not silently turn the A/B original videos into that montage; use this only if someone requests a fresh piece.

- Start with `fruit-mecha`, `fruit-mecha-morph`, or `fruit-apple-banana` from [the presets](presets/README.md).
- Capture 1024×576, 193 frames, `--band-gain auto --motion-gain 1 --stage studio`, release 12 (release 30 and smoothing 5 for slower morphs).
- Use the named `robot`, `fruit-left`, and `fruit-right` rectangles in `keyframes.json`, not invented bounding boxes. **Align the replacement still with frame 0**; a colour-changing morph may need a second still at its peak.
- Render with existing LTX-2.5 22B distilled + Layout-to-Render IC-LoRA graph, then review and add the track. Do not call it character-consistent video-to-video editing or a real-time swap: it is a new guided render.

### What happens when you swap

The first swap offered is deliberately small (owner decision, 3 November 2026): change **one fruit**, or change **the character**. Nothing else is offered as a first step.

The rebuild pipeline: the 9 s _Dance with Fruits_ loop tripled (27 s) → three windows, w0 at 0 s, w1 at 8.0417 s, w2 at 16.0833 s, 193 frames each at 24 fps → w0 `fruit-mecha` (explode) or `fruit-mecha-morph`, w1 `fruit-apple-banana` or `fruit-banana-apple` (one fruit morphing), w2 `fruit-mecha` with the robot swapped by a region edit → capture writes `rgb.webm`, `depth.webm`, `control.wav` and `keyframes.json` with frame-0 rectangles on the 1024x576 guide (`regions.robot`, `regions.fruit-left`, `regions.fruit-right`; the single-fruit study writes `regions.fruit`) → a first still exactly 16:9 and aligned with frame 0 → LTX render to 2048x1152, CFG 1, seed 42 → stitch w0, w1, w2 → replace the per-window excerpts with the loop file at the end.

| Swap                      | What the agent does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Windows re-rendered                                                                               | Paid                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| One fruit                 | The person drops a fruit image or names a fruit. The agent edits only the `fruit-left` or `fruit-right` rectangle (`fruit` in w1) of the first still with Klein (quote, yes, submit) and changes the fruit noun in the render prompt. If the new fruit's shape differs a lot from the voxel key, it also recolours or reshapes that fruit's voxels in the study and recaptures. For a morph, it also makes a peak still at the closed frame.                                                                                                                                                         | Every window the fruit appears in: w0 and w2 show both fruits; w1 shows the single morphing fruit | Yes: Klein edit plus one LTX clip per window |
| Character (humanoid only) | The person drops one reference image. The agent edits only the `regions.robot` rectangle of the first still with Klein ("swap the mecha for this character") and changes the noun in the render prompt. The dancer is the World Builder avatar whose motion is the RGB/depth guide, so the same rig is kept: the swap changes who it looks like, not how it moves. A Klein region edit driven by a reference image has not been tested on this workflow; the tested path is a region edit driven by the person's words, and Klein's `--aesthetic-image` copies composition and is not the mechanism. | w0 and w2 (w1 has no dancer)                                                                      | Yes: Klein edit plus two LTX clips           |
| Track                     | The whole motion is derived from the track's low band, so the agent recaptures all three windows (morphs start on a quiet low-band frame), re-renders them, and re-muxes the new track at the end. The most expensive swap.                                                                                                                                                                                                                                                                                                                                                                          | w0, w1, w2                                                                                        | Yes: three LTX clips                         |

A non-humanoid character (a vehicle, an animal) is not a supported swap in this template; `ship-mecha` is a separate Objects study.

**Inputs that come in:** the track (`mecha-fruits-A2-x3.wav`, the loop tripled; an owner file, not in the repository), the owner's look stills (not in the repository), the reference image for the swap, and the two existing character MP4s for the A/B originals (not yet in the repository, so their URLs stay `null`).

**Known limits:** fruits sit at ±0.95 m; motion gain 1 (gain 2 pushed the fruits out of frame); the morph take does not open on a clean rest pair because the loop's bass is high at frame 0; this is a new guided render, not character-consistent video-to-video editing and not a real-time swap.

## 2. Reactive Spaces — one existing spaces video

**Presentation:** use the real **Adaptive Reverb** video and its soundtrack, as bundled in the existing Gallery card; the owner's more recent spaces MP4 can take its place when delivered. Show the spaces **skyscrapers → cathedral → hall → booth** as chapters or annotations, **not** as invented or regenerated previews.

**Card copy:** _Skyscrapers contract, rooms breathe and the acoustics follow the architecture. Replace a space and let your agent build its geometry._

**Viewer journey**

1. Play the original video **as-is**. Show four named spaces and the **Adaptive Reverb** soundtrack without silently editing the original.
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

**What the existing cut is.** The Gallery cut is 30.46 s at 1280x720 with four rooms: towers 0–7.9 s, cathedral 7.9–15.9 s, hall 15.9–22.5 s, booth 22.5–30.5 s. Its pictures are LTX-2.5 Layout-to-Render shots. Its sound is the original track processed on CPU with each scene's geometric impulse response (the Acoustics and Reverb nodes). The AKUSPACE LoRA was tested separately and is **not** what made this cut's audio. The learned room-audio route is experimental, and the model would need more training. The card keeps showing this cut (the one that falls into the cathedral); a newer spaces video replaces it only when the owner explicitly selects one.

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
  ├─ Mecha × Fruits     [Watch A] [Watch B] [Make my version]
  └─ Adaptive Reverb    [Watch]              [Make my version]

Make my version → Swap references → Review result
                                 ├─ Use in current edit (source slot only)
                                 └─ Rebuild guide → Review → Quote/approve render → Assets
```

Do **not** restore automatic generation to the swap-only **Make my version** dialog (PR #64). The **Recreate in Camera** control can take a person to the generator but must not pay or submit on navigation. Agent reconstruction is a deliberate step, not an automatic consequence of merely opening a card.

## How reviewers regenerate

The owner renders on a rented Vast box with `scripts/vast/box/run-queue.sh`. Reviewers use the `layout-to-video` selector of the `genobi-ltx-world` Comfy deployment instead, described in [Comfy deploy](../docs/comfy-deploy.md): fixed 1024 × 576, 193 frames, 24 fps, which is exactly one template window.

- **Access:** an access code from the competition submission unlocks a capped number of runs paid by the owner's workspace (default cap 10). The mechanism is `docs/tester-access.md`, arriving in a separate PR and off by default. The code itself never appears in the repository.
- **Which card:** Mecha × Fruits is the reusable regeneration test. Reactive Spaces also needs LTX runs for a new version.
- **Every run** is quoted and confirmed before submission.

## Media hand-off and acceptance

- **Required:** the two original character video files, with their existing audio, and confirmation whether the pictured spaces video is the already-bundled Adaptive Reverb MP4 or a newer export. A screenshot alone does not carry an MP4.
- **Optional:** their first-frame stills, individual fruit/character assets, and four room reference images. **Do not substitute stock media** while waiting for these.
- Integrate existing media in `public/media/template-gallery/` **without altering originals**. Make optimized previews/posters from the _same video frames_ only once those originals are available and their rights/credits are confirmed.
- Wire the two cards (one existing, one new) to `shared/gallery/catalogue.ts` and to the current Director/Editor copy and swap flow. Avoid duplicate Adaptive Reverb entries and keep agent/CLI project identities stable.
- Test A/B selection, sound retention, source provenance, missing-asset graceful states, keyboard/mobile accessibility, source swaps not triggering paid calls, project-copy isolation, one explicit agent rebuild, and approval gating of any LTX render.
- Verify format, lint, typecheck, tests, worker boundaries, build and a visual check before marking the PR ready.

**Implementation state:** this PR is a reviewable product/template draft. It does **not** ship new video files, source-aware image reconstruction, a new Gallery card, or working A/B controls. The existing clip is linked only where it is known to be bundled.
