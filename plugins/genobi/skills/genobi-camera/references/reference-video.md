# Reference video model cards

Read these cards when H3 or FLUX image-to-video is selected. Inspect actual workflow
node/model availability first. Quote the exact attached references and owned guide,
then wait for approval before submitting. Never retry an uncertain paid submission.
The four OmniRef workflows require two image references and one owned video
source; combined guidance is an unbenchmarked test preset. Treat RGB/Canny/depth
as semantic references, not independent weighted ControlNets. Do not promise pose
accuracy or VRAM fit. H3 on Router takes the two images and no guide video; it is
the only H3 entry with 4 to 15 seconds, other ratios or 2K, since the OmniRef four
keep their one measured 5 s, 16:9 recipe.

## H3 camera wording

Every H3 entry (H3 on Router and the four OmniRef workflows) takes the camera
in the wording of MiniMax's [base prompt guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md#43-camera-motion-motion-type--amplitude--speed),
section 4.3, at commit `42ed227`; the full-reference guide (section 5.1) defers
to it. Set `"cameraEnabled": true` and choose ids as for any model. The studio
writes one English paragraph in **H3's order**: the shot size and angle
sentences that open the shot (section 4.1, "the overall style and initial
composition"), then the description, then the move "as a natural English
action within the shot". It never writes bracket commands (`[Pan left]` is
the Hailuo 2.3 and 02 syntax, not H3's), amplitude or speed modifiers (the
guide omits the medium, normal default) or the reference-mode sections. A
`cameraEdits` phrase wins, so write it as a natural English action too.

Shot sizes and angles have no H3 list: H3 takes LTX's shorter list without
Profile (`extreme-close-up`, `close-up`, `medium`, `full`, `wide`,
`establishing`; `eye-level`, `low-angle`, `high-angle`, `birds-eye` as
Overhead view) and the LTX sentences, whose stationary verbs never read as a
second move.

### The thirteen H3 moves

| Id            | H3 name        | H3 sentence                                            | Basis                                 |
| ------------- | -------------- | ------------------------------------------------------ | ------------------------------------- |
| `dolly-in`    | Push in        | The camera pushes in toward the subject.               | Push In                               |
| `pull-back`   | Pull out       | The camera pulls out from the subject.                 | Pull Out                              |
| `pan-left`    | Pan left       | The camera pans left across the subject.               | Pan Left                              |
| `pan-right`   | Pan right      | The camera pans right across the subject.              | Pan Right                             |
| `dolly-left`  | Truck left     | The camera trucks left past the subject.               | Truck Left                            |
| `dolly-right` | Truck right    | The camera trucks right past the subject.              | Truck Right                           |
| `tilt`        | Tilt up        | The camera tilts up along the subject.                 | Tilt Up                               |
| `crane`       | Pedestal up    | The camera pedestals up, keeping the subject in view.  | Nearest: Pedestal Up                  |
| `jib-down`    | Pedestal down  | The camera pedestals down toward the subject's level.  | Nearest: Pedestal Down                |
| `arc`         | Arc shot       | The camera moves in an arc around the subject.         | Arc Shot                              |
| `follow`      | Tracking shot  | A tracking shot follows the subject as it moves.       | Tracking Shot; needs a moving subject |
| `static`      | Static shot    | The camera holds a static shot on the subject.         | Static Shot                           |
| `handheld`    | Shake slightly | The camera shakes slightly as it stays on the subject. | Nearest: Shake Slightly               |

Not for H3: `orbit` (no full circle is documented), `pan` and `trucking`
(H3 names a direction: use the left or right id), and `lazy-susan` (a subject
move). On an OmniRef entry the guide video still carries its own motion; the
sentence is words beside it. A term in the guide is no claim that H3 follows
it: no H3 camera run has been made.

### MiniMax H3 · Omni RGB · 5 s (`minimax-h3`)

| Field   | Value                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request | `"generator": "video", "model": "minimax-h3"`; exactly two `imageReferences`, owned `sourceId`, `duration: 5`, `resolution: "hd"`, `aspectRatio: "16:9"`                                                                                                                                               |
| Route   | `workflow`, `workflow/minimax-h3-rgb` on the selected Comfy destination                                                                                                                                                                                                                                |
| Camera  | The thirteen H3 moves, H3's shot sizes and angles; H3 wording ([guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md#43-camera-motion-motion-type--amplitude--speed)). The guide video still carries its motion |
| Cost    | Quote first. GPU-time estimate; combined memory and cost have not been measured                                                                                                                                                                                                                        |
| Source  | `workflows/minimax-h3-rgb.json`; recipe and licence notes in `workflows/minimax-h3-omniref.README.md`                                                                                                                                                                                                  |

### MiniMax H3 · Omni Canny · 5 s (`minimax-h3-canny`)

| Field   | Value                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request | `"generator": "video", "model": "minimax-h3-canny"`; exactly two `imageReferences`, owned `sourceId`, `duration: 5`, `resolution: "hd"`, `aspectRatio: "16:9"`                                                                                                                                         |
| Route   | `workflow`, `workflow/minimax-h3-canny` on the selected Comfy destination                                                                                                                                                                                                                              |
| Camera  | The thirteen H3 moves, H3's shot sizes and angles; H3 wording ([guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md#43-camera-motion-motion-type--amplitude--speed)). The guide video still carries its motion |
| Cost    | Quote first. GPU-time estimate; combined memory and cost have not been measured                                                                                                                                                                                                                        |
| Source  | `workflows/minimax-h3-canny.json`; recipe and licence notes in `workflows/minimax-h3-omniref.README.md`                                                                                                                                                                                                |

### MiniMax H3 · Omni Depth · 5 s (`minimax-h3-depth`)

| Field   | Value                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request | `"generator": "video", "model": "minimax-h3-depth"`; exactly two `imageReferences`, owned `sourceId`, `duration: 5`, `resolution: "hd"`, `aspectRatio: "16:9"`                                                                                                                                         |
| Route   | `workflow`, `workflow/minimax-h3-depth` on the selected Comfy destination                                                                                                                                                                                                                              |
| Camera  | The thirteen H3 moves, H3's shot sizes and angles; H3 wording ([guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md#43-camera-motion-motion-type--amplitude--speed)). The guide video still carries its motion |
| Cost    | Quote first. GPU-time estimate; combined memory and cost have not been measured                                                                                                                                                                                                                        |
| Source  | `workflows/minimax-h3-depth.json`; recipe and licence notes in `workflows/minimax-h3-omniref.README.md`                                                                                                                                                                                                |

### MiniMax H3 · Omni Combined · 5 s (`minimax-h3-combined`)

| Field   | Value                                                                                                                                                                                                                                                                                                  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request | `"generator": "video", "model": "minimax-h3-combined"`; exactly two `imageReferences`, owned `sourceId`, `duration: 5`, `resolution: "hd"`, `aspectRatio: "16:9"`                                                                                                                                      |
| Route   | `workflow`, `workflow/minimax-h3-combined` on the selected Comfy destination                                                                                                                                                                                                                           |
| Camera  | The thirteen H3 moves, H3's shot sizes and angles; H3 wording ([guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md#43-camera-motion-motion-type--amplitude--speed)). The guide video still carries its motion |
| Cost    | Quote first. GPU-time estimate; combined memory and cost have not been measured                                                                                                                                                                                                                        |
| Source  | `workflows/minimax-h3-combined.json`; recipe and licence notes in `workflows/minimax-h3-omniref.README.md`                                                                                                                                                                                             |

### MiniMax H3 · Reference to video · 4–15 s (`minimax-h3-router`)

| Field   | Value                                                                                                                                                                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Request | `"generator": "video", "model": "minimax-h3-router"`; exactly two `imageReferences` (the character sheet, then the storyboard), `duration` 4 to 15, `resolution` `"hd"` (768P) or `"fhd"` (2K), `aspectRatio` 21:9, 16:9, 4:3, 1:1, 3:4 or 9:16              |
| Route   | `router`, `minimax/minimax-h3` through Comfy Router; requires a Comfy key                                                                                                                                                                                    |
| Camera  | The thirteen H3 moves, H3's shot sizes and angles; H3 wording ([guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md#43-camera-motion-motion-type--amplitude--speed)) |
| Cost    | Quote first. Comfy's published H3 rate per second (768P or 2K); the run's credits header is the charge                                                                                                                                                       |
| Guide   | Name both images in the prompt: "Use the first image as the character sheet and the second as the storyboard…", then the panel to follow; a camera term adds its H3 sentence                                                                                 |

The result link lasts usually 12 hours, shorter if Router falls back to
MiniMax's own link; the studio copies it on the first poll after the
run completes.

### Openjutsu · Character swap (`openjutsu-swap`)

| Field   | Value                                                                                                                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "video", "model": "openjutsu-swap"`; owned `sourceId` (the clip), `imageReferences` [character, first frame?], `duration` 5–15 (the part), `description` the direction (≤500), `swap: {start, size: 480 or 768, seed, items?}` |
| Route   | `workflow`, `workflow/openjutsu-swap` on the server's Comfy deployment (Comfy key), never Cloud or local                                                                                                                                     |
| Camera  | None; the clip's own camera and performance stay                                                                                                                                                                                             |
| Cost    | Quote first. No Genobi price: the quote's `billing` names who bills the GPU time                                                                                                                                                             |
| Source  | `workflows/openjutsu-swap.json`; the first frame, workflow and licences in `docs/openjutsu-swap.md`                                                                                                                                          |

Make the first frame before the swap: a `flux-3-klein-api` image run with the
frame at the part's start as reference 1, the character or item images after
it, and one edit row per box (`shared/openjutsu-anchor.ts` writes it). Quote
and submit it as its own paid step. If it fails, run the swap without it. When
the boxes changed items rather than the whole person, name them in
`swap.items`. Cut the clip to the part before uploading it.

### FLUX 3 · Image to video (`flux-3-i2v`)

| Field   | Value                                                                                      |
| ------- | ------------------------------------------------------------------------------------------ |
| Request | `"generator": "video", "model": "flux-3-i2v"`; one to ten ordered `imageReferences`        |
| Route   | `bfl`, `flux-3-video` through BFL direct; requires a BFL key                               |
| Camera  | FLUX camera wording, the same terms as text to video; keyframes guide progression          |
| Cost    | Quote first. Use the studio quote for the selected duration and resolution                 |
| Guide   | [FLUX 3 video API](https://docs.bfl.ai/api-reference/utility/generate-a-video-with-flux-3) |

Use one image for a starting frame, two for start/end, or more for evenly spaced
keyframes at an explicit duration. Keep reference order. Do not claim Router
supports this input path: the current Genobi adapter uses BFL direct.

Use the [BFL camera wording guide](https://docs.bfl.ai/guides/prompting_video_camera_terms) for the FLUX camera clauses.

## Comfy Deploy Camera routes

These two entries run from **Camera in the local studio** after the owner
registers the deployment and stages inputs. The current MCP/CLI generation
schema does not expose deployment staging, so `genobi_models` omits these
Camera-only entries. Do not try to submit them with `genobi_quote`/`submit`,
borrow browser tickets, or remove an agent mark. Ask the person to use Camera.
CPU adaptive reverb remains a separate local workflow.

### LTX Comfy Deploy · Layout-to-video (`ltx-deploy-layout-to-video`)

| Field   | Value                                                                                                                                                                                                                                                          |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "video", "model": "ltx-deploy-layout-to-video"`; fixed `duration: 8`, `resolution: "hd"`, `aspectRatio: "16:9"`, `draft: false`; `deploy` contains seed, negative prompt, matching recipe and owned take/reference/track tickets, optional depth |
| Route   | `workflow`, `workflow/world-builder-l2r-a2v` on the registered Comfy deployment; Studio selects `world-builder-l2r-a2v-studio`                                                                                                                                 |
| Camera  | LTX wording: https://ltx.io/blog/ltx-2-5-prompt-guide; the captured scene carries its camera guidance                                                                                                                                                          |
| Cost    | Quote first. GPU time billed by Comfy; no fixed price or cost cap. The person confirms one run in Camera; never retry an uncertain submission                                                                                                                  |
| Source  | `workflows/world-builder-l2r-a2v.json`; `docs/comfy-deploy.md#use-it-from-camera`; video plus the scene-derived IR and wet mix                                                                                                                                 |

### LTX Comfy Deploy · AKUSPACE (`ltx-deploy-akuspace`)

| Field   | Value                                                                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request | `"generator": "video", "model": "ltx-deploy-akuspace"`; fixed `duration: 8`, `resolution: "hd"`, `aspectRatio: "16:9"`, `draft: false`; `deploy` contains seed, negative prompt and owned reference-image/track tickets |
| Route   | `workflow`, `workflow/ltx-i2v-a2v-akuspace` on the registered Comfy deployment                                                                                                                                          |
| Camera  | LTX wording: https://ltx.io/blog/ltx-2-5-prompt-guide; describe motion and the intended room sound without claiming an exact acoustic simulation                                                                        |
| Cost    | Quote first. GPU time billed by Comfy; no fixed price or cost cap. The person confirms one run in Camera; never retry an uncertain submission                                                                           |
| Source  | `workflows/ltx-i2v-a2v-akuspace.json`; `docs/comfy-deploy.md#use-it-from-camera`; learned room-conditioned audio changes the music at mask 0.5                                                                          |
