---
tags: [director, ltx, workflows, research, plan]
summary: Gen-Mod, generation modified — edit frame 0 of a take (character, face, background or anything the Edit tool can box), carry it through the source's motion with LTX-2.5, and iterate on a JSON recipe with an agent.
---

# Gen-Mod: one take, modified

**Gen-Mod** is the Director's swap step, the part Genjutsu plays inside
Higgsfield's Katana. The idea is one sentence: **edit frame 0, and the video
follows.** Frame 0 is edited with the Edit tool the studio already has (boxes,
dropped reference images, or a prompt alone: "swap him for this character",
"his head is a chicken's head", "he holds a banana", "put her on this street");
an LTX-2.5 pass then re-renders the take so it opens on that frame and moves as
the source moved. Character, face, background and prop swaps are the same
pipeline with different frame 0 edits.

Genobi's difference is around the swap rather than in it: the recipe is plain
JSON the person can correct, an agent revises it between takes from the
person's notes, and keep/reject decisions feed [taste memory](taste-memory.md).
Effects, titles, music and the timeline are the Director's existing tools.

The name reads as "generation, modified", with a cyberpunk gene-mod echo. In
code it is `genmod` (`shared/genmod/`).

Research checked 24 October 2026: the
[ComfyUI-LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo) example
workflows at `220e1d4` (20 October), a community "LTX 2.3 Replace Anyone in
Video" ComfyUI workflow supplied by the owner (read, not run), and public model
and project pages. Hugging Face was not reachable from the research
environment, so model cards cited below were read through search summaries
only and are marked unverified. No generation was run for this page.

## The pipeline

1. **Frame 0, the still pass.** FLUX 3 Klein edits the source's first frame.
   For a named swap (character, face, background) Director's **Generate a
   character, face, background or clothing swap** panel writes the instruction
   (`GENMOD_STILL_INSTRUCTION`); for anything else the Edit tool's boxes and
   references do (see [Targeting](#targeting-what-changes)). This is the cheap,
   reviewable step: nothing goes to video until the person approves the still.
2. **The video pass**, on one of two routes:
   - **`control` (default): the "Replace Anyone" pattern.** An annotator reads
     the source's pose (DWPose), depth or edges in every frame; the LTX Union
     Control IC-LoRA follows that guide, and the approved frame 0 conditions
     the opening (`LTXVImgToVideoConditionOnly` at strength 1). Replace Anyone
     isolates the person with SAM3 first so the pose comes from them alone;
     the shipped graph reads the pose off the whole frame for every kind, and
     a recipe asking for `isolate` is refused until SAM3 is wired in. Every pixel is
     re-rendered, so a new silhouette, hat or prop has room without a mask.
   - **`masked`: pixel-exact outside a region.** The LTX in/outpaint graph
     regenerates only a white mask region and keeps every other pixel of the
     source. Best when the background must survive unchanged.
   - **`audio`: a talking shot, re-voiced by its own soundtrack.** Frame 0 and
     the source's audio, encoded and frozen, drive a new take: the lips follow
     the audio and the motion comes from the prompt, not the source, so it is
     stiller than `control`. Best for a person talking to camera.
3. **Sound.** By default the source's soundtrack is kept: its audio latent is
   encoded and frozen (a zero noise mask), as Replace Anyone's "Keep Original
   Voice" switch does, so lips and voice stay with the take.
4. **Back into the Director** as a take with its generation record, placed
   with `replace` or `replace-plate`.

## Workflow candidates for LTX-2.5

Official graphs are in `example_workflows/2.5/` of ComfyUI-LTXVideo.

| Candidate                                                                                             | Inputs                                                | Keeps                                | Where it runs                                 | Status                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A. Union Control + frame 0** (`LTX-2.5_ICLoRA_Union_Control_Distilled`)                             | Source → DWPose / depth / canny guide, edited frame 0 | Motion and timing; frame 0's look    | Comfy Cloud template family or local          | The `control` route. Same structure as Replace Anyone, which runs it on LTX 2.3 dev; not yet run on 2.5 |
| **B. Inpaint two-stage** (`LTX-2.5_ICLoRA_Inpaint_Two_Stage_Distilled`)                               | Source, mask video, prompt, optional edited frame 0   | Every pixel outside the mask         | Comfy Cloud (native-encoder adapter) or local | The `masked` route. Ran on Comfy Cloud on 17 October ([verification](director-remix-verification.md))   |
| **C. BFS head swap** (community IC-LoRA, trigger "head swap")                                         | Source as guide, a head image as identity             | Body, motion, scene                  | Local only: custom nodes `ComfyUI-BFSNodes`   | Cards claim LTX-2.3 and 2.5 versions (unverified); nodes GPL-3.0; LoRA licence unverified               |
| **D. Ingredients**                                                                                    | A reference sheet                                     | Nothing: a new shot                  | Comfy Cloud template or local                 | For one character across new shots, not for existing footage                                            |
| **E. Image + audio to video** (`LTX-2.5_A2V_Two_Stage_Distilled`; Comfy's `video_ltx2_3_ia2v` on 2.3) | Frame 0, the source soundtrack                        | Voice and lip timing; frame 0's look | Comfy Cloud template (core nodes) or local    | The `audio` route. The 2.3 template was read from the owner's export; not yet run                       |

### Replace Anyone, read node by node

The supplied workflow has two pipelines, toggled by group bypass: **1.
Character replacement** and **2. Background replacement**. Each is a FLUX 2
Klein edit of frame 0 (four reference latents, 4 steps) feeding one LTX pass:

- LTX 2.3 22B dev with the 2.3 distilled LoRA at 0.6, the
  `ltx-2.3-22b-ic-lora-union-control-ref0.5` IC-LoRA at 1.0, and an LTX-2 19B
  detailer LoRA at 0.05;
- the guide is **DWPose only** (depth and canny are present but unwired),
  read from a SAM3 "The human" segmentation in the character pipeline and from
  the whole frame in the background one;
- one distilled stage, 8 manual sigmas, `euler_ancestral_cfg_pp`, CFG 1;
- audio kept by freezing the source's audio latent; optionally the speech is
  separated (MelBand RoFormer) and transcribed (VoxCPM) into the prompt as
  `The character say: "…"`;
- the prompt describes **the action and scene only**, for example "A man
  confidently walks toward the camera while talking directly to the viewer.
  Natural body movement, expressive facial expressions, strong presence,
  cinematic lighting, realistic style."

Its Klein prompts are useful wording: the character swap lists what to keep
(pose, composition, camera angle, lighting, environment, framing) and what to
take from image 2 (face, hair, identity, body, outfit, accessories), and asks
to match the source's expression, gaze and head angle.

**Porting it to LTX-2.5 and FLUX 3 Klein** is a model swap, because the
official 2.5 Union Control graph is the same structure: the 2.5 distilled
transformer with the same 2.3 Union Control IC-LoRA, DWPose among its
annotators, and an optional start image. The port changes:

| Node                       | LTX 2.3 / FLUX 2 (as supplied)                   | LTX-2.5 / FLUX 3 Klein                                      |
| -------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Klein UNET, encoder, steps | `flux-2-klein-9b-fp8mixed`, `qwen_3_8b`, 4 steps | `flux3_image_klein_sd_int8_convrot`, `qwen3vl_4b`, 16 steps |
| Klein VAE                  | `flux2-vae`                                      | Unchanged                                                   |
| LTX transformer            | 2.3 dev (fp8, or GGUF wired by default)          | `ltx-2.5-22b-distilled-transformer-bf16`, wired in          |
| Text encoder               | Gemma 3 12B + 2.3 projection (dual loader)       | `gemma4-12b-with-proj-ltx-2.5-bf16` (one loader)            |
| Video, audio VAE; upscaler | 2.3 files                                        | 2.5 files                                                   |
| Distilled LoRA             | 0.6                                              | Off: the 2.5 transformer is distilled                       |
| LTX-2 19B detailer LoRA    | 0.05                                             | Off: trained for a different model                          |
| Sampler                    | `euler_ancestral_cfg_pp`                         | `euler_ancestral`, as the official 2.5 graph                |

Unchanged and unverified on 2.5: the 2.3 Union Control IC-LoRA strength, the
8 sigmas, and the `taeltx2_3` preview decoder. The FLUX 3 names are those in
`workflows/flux-3-klein-t2i.json`; FLUX 3 Klein took two image inputs natively
on Comfy Cloud on 17 October, but this four-reference-latent edit wiring has
not been run on it. The workflow's custom nodes (rgthree, KJNodes,
VideoHelperSuite, Easy-Use, Crystools, pysssss, controlnet_aux, a SAM3 node,
MelBand RoFormer, VoxCPM) must exist where it runs; Comfy Cloud's own Union
Control template uses core nodes and is the base for a hosted graph.

### Image + audio to video, read node by node

The owner's export of Comfy's `video_ltx2_3_ia2v` template is core nodes only:
LTX 2.3 22B dev fp8 with the 2.3 distilled LoRA at 0.5; the image resized and
`LTXVPreprocess`ed (compression 18), conditioning stage 1 at strength 0.7 and
stage 2 at 1.0; the audio trimmed to the duration, encoded and frozen with a
zero `SolidMask`; 8 sigmas, ×2 latent upscale, 3 refine sigmas, `euler`, CFG

1. Its optional prompt enhancer runs Gemma 3 through an "abliterated" LoRA
   that strips the model's refusals; Gen-Mod writes its own prompt and leaves
   that switch off. On LTX-2.5 the official A2V graph is the same idea and also
   muxes the original waveform into the output, so the voice is the source's
   own, sample for sample.

### Core-node graphs (built, not run)

`workflows/ltx-2-5-genmod-audio.json` and `ltx-2-5-genmod-control.json`
([README](https://github.com/koshimazaki/Genobi/blob/main/workflows/genmod.README.md))
carry the `audio` and `control` routes with **core ComfyUI nodes only**,
checked class by class against ComfyUI `7cebca5`. Core now has what the
custom packs used to supply: native IC-LoRA (`GetICLoRAParameters` with
`LTXVAddGuide`), SDPose pose extraction and drawing, SAM3 detection and video
tracking, MoGe, Depth Anything 3, Lotus, Marigold and `RemoveBackground`. Both
start from Comfy Cloud's own LTX-2.5 template, open on frame 0 at full
strength, freeze the source soundtrack and mux the original back;
`genmodValues` (`shared/comfy/genmod.ts`) fills them from a planned pass. It
refuses generated audio and a nonempty `control.isolate`: these graphs cannot
apply those choices. The recipe defaults read the whole frame, which these graphs support.

### Choosing the annotators

What the guide needs is steadiness from frame to frame more than single-frame
accuracy: a jittering pose or depth map reads to the video model as motion.
From core nodes and public reports, checked 24 October 2026:

| Need    | In core / on Comfy Cloud                                                                                                                     | Faster or sharper, outside core                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Pose    | **SDPose** whole-body (in the control graph); reports +6–12 AP over DWPose, diffusion-based so slower                                        | DWPose and RTMPose/RTMW (fast; DWPose is the Replace Anyone and LTX-pack default); ViTPose (accuracy-first) |
| Subject | **SAM3 / SAM3.1** text prompt → masks on every frame; 3.1 tracks up to 16 objects per pass, about 7× faster at 128 objects on an H100 (Meta) | SAM 2.1 (Apache-2.0, no text prompt); BiRefNet for hair-fine mattes (already in the browser)                |
| Depth   | **Depth Anything 3** (fast per frame), **MoGe-2** (Comfy's IC-LoRA template uses it)                                                         | Video Depth Anything (built for temporal consistency; the LTX pack's default)                               |

SAM 3.1 is the one to use: ComfyUI core carries its multiplex tracker
(`comfy/ldm/sam3`), and Comfy's official templates (video segmentation, SCAIL-2
character replacement, VACE inpainting, "change any objects") already load
`sam3.1_multiplex_fp16.safetensors`, so it runs on Comfy Cloud with no
install. It also has open weights: Meta publishes the checkpoints, gated, on Hugging
Face (`facebook/sam3.1`) under the SAM License, beside its hosted API; the
licence is recorded in
[LICENCES](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md).
Core's `SAM3DBody_*` nodes are a different model, SAM 3D Body: a 3D human
mesh and facial expression from an image, not segmentation. A rendered body
mesh is a candidate pose guide that should not flicker where limbs cross, as
2D keypoints can.

**The open chain:** SAM 3.1 finds the thing by name and its bounds become the
Klein box (`boxFromAgent` takes them as `[x1, y1, x2, y2]`), FLUX 3 Klein edits
frame 0, and an LTX-2.5 graph carries it through. Every step runs on open
weights, locally or on Comfy Cloud; the weights carry their owners' licences
(SAM License, FLUX Kommunity, LTX Community), so open weights rather than OSI
open source.

No model named "Ultimate Depth" was found; recent video-depth research
(ICDepth, FlashDepth, one-step distilled diffusion depth) is not in ComfyUI
core. Measure jitter on our own clips before changing a default.

Comfy Cloud also runs **Wan2.2 Animate, SCAIL-2 character replacement and Wan
2.1 VACE** ([inventory](comfy-cloud-inventory.md)): Apache-2.0 or MIT
character replacement with no LTX licence question, worth one comparison run
against the control route.

### Face, background and light

- **Faces** on the control route are re-rendered from frame 0 like the rest of
  the person. If identity drifts, the masked route with a head region, or C,
  are the next steps. C's node pack carries one idea worth taking whatever
  wins: **crop before sampling**, since a face a fifth of a 512 × 288 frame is
  about 25 px tall and cannot hold identity, while a stable box around the head
  sampled full-frame gives it 200–300 px. Its identity node needs InsightFace
  `buffalo_l` weights, released for non-commercial research only.
- **Backgrounds**: the control route with pose from the whole frame, as
  Replace Anyone does; the masked route with the subject's mask inverted when
  the person must stay pixel-exact; or Lightricks' LTX-2.3 Clean Plate IC-LoRA
  (removes people without a mask, steered by a prompt of the empty place),
  then the person matted back on the timeline. No dedicated LTX-2.5
  background-replace LoRA was found.
- **Light** rather than place: the official LTX-2.5 Day-to-Night IC-LoRA, and
  the LTX-2.3 Relight in Lightricks' Creative Lab collection.

Wan2.2 Animate (Apache 2.0) stays the documented fallback for full-body
performances.

## Targeting what changes

Frame 0 edits use FLUX's box grid, [top, left, bottom, right] on 0–1000, with a
reference image per box (`src/image-regions.ts`). Finding where things are is
the agent's job, done before any workflow runs, so no detection graph is
needed:

1. **The agent looks.** It reads frame 0 with the `frame` command, names what
   could change ("a man, his cap, a coffee cup") and proposes a labelled box
   for each. Any vision model the person runs will do: Claude Opus estimates
   boxes from the image; Hermes with an open grounding model (Qwen3-VL, or a
   DeepSeek vision-language model; DeepSeek's chat models read text only)
   returns them directly and runs locally. `boxFromAgent`
   (`shared/genmod/detect.ts`) turns the model's `[x1, y1, x2, y2]`, in pixels
   or on a 0–1000 grid, into FLUX's box; which grid a given model answers on
   is checked against that model's documentation before it is used.
2. **The person approves.** The boxes are drawn on frame 0; the person moves,
   resizes or deletes them on the Edit canvas, drops a reference image onto a
   box, or types the change ("this becomes a banana"). Nothing is paid until
   the still pass is quoted and approved. A box only makes an edit more
   precise: "his head is a chicken's head" works without one.
3. **The still pass** sends the boxes, references and words to FLUX 3 Klein
   (or the FLUX 3 edit API) as the Edit tool does today.

Two helpers stay for what an agent's single look cannot do:

- **On this device, free: the main subject.** `subjectBox` turns an alpha
  matte into a box with a margin for hair, a hat or a held prop. Dual Editor
  already computes that matte in the browser with BiRefNet
  (`src/dual-editor/background.worker.ts`, MIT export, no upload), so "swap the
  person" can open with its box drawn even with no agent linked.
- **SAM3, for every frame.** The control route's `isolate` and the masked
  route's mask video need the subject on every frame, not one box. The agent
  writes the SAM3 text prompt ("the man", "his left arm") from the same look;
  SAM3 runs inside the video graph on Comfy.

Whichever way the still was made, the video pass needs only the approved
frame: the boxes and references live in the still's own generation record.

## The recipe

`shared/genmod/recipe.ts` holds the contract. `parseGenModRecipe` refuses
unknown fields so a typo in the JSON editor cannot quietly drop a setting, and
each route takes only its own settings.

```json
{
  "schema": "genobi.genmod.v1",
  "kind": "edit",
  "source": { "assetId": "take-1", "in": 64, "out": 161 },
  "firstFrame": { "assetId": "still-2" },
  "route": "control",
  "control": { "guide": "pose" },
  "change": "his head is a chicken's head",
  "action": "A man confidently walks toward the camera while talking directly to the viewer.",
  "keep": [
    "camera",
    "framing",
    "performance",
    "light",
    "background",
    "wardrobe"
  ],
  "audio": "keep"
}
```

- `kind` is `character`, `face`, `background` or `edit`; it sets defaults and
  wording, not the graph.
- `source` is a project video asset and a half-open frame range, as `cut`
  takes. The pass uses the largest 8k+1 window inside it (`genmodFrames`), up
  to 241 frames, never more than the person chose.
- `route` is `control` (with `guide`, and a SAM3 `isolate` prompt the shipped
  graph does not support yet) or
  `masked` (with `mask.region` on the box grid and `mask.dilation` in pixels;
  the 17 October proof used 15).
- `firstFrame` is absent until a still is approved; `genmodVideoPass` refuses
  to plan a video pass without it.
- The prompt (`genmodPrompt`) is the action, then the change "as in the first
  frame", then a sentence per `keep` item. It never names a camera move: the
  source owns the camera.

## The iteration loop

One round:

1. The agent (or the person) writes a recipe, runs the still pass after a quote
   and the person's yes, and records the approved still as `firstFrame`.
2. The video pass runs after its own quote and yes. The take lands in the
   project.
3. The person keeps or rejects it, says why in a frame note ("her face melts
   at the head turn"), or edits the JSON directly.
4. The agent reads the feedback, changes the recipe and says which field it
   changed and why, then quotes the next take.

What to change for what goes wrong, a starting table to prove or correct:

| Symptom                                    | First change                                                 |
| ------------------------------------------ | ------------------------------------------------------------ |
| Wrong look entirely                        | Redo the still: the video pass only follows `firstFrame`     |
| Motion ignores the source                  | `guide: "pose"`; once isolation lands, `isolate` the subject |
| Room geometry wobbles on a background swap | `guide: "depth"`, or the masked route with the subject       |
| Background changes when it should not      | The masked route; or add `background` to `keep`              |
| Edge halo or seam (masked)                 | Raise `mask.dilation`                                        |
| New silhouette clipped (masked)            | Grow `mask.region`, or move to the control route             |
| Identity drifts after a head turn          | Shorten `source`; then crop sampling (C)                     |
| Lips out of sync                           | `audio: "keep"`, and the spoken line in `action`             |

**Taste.** A kept or rejected Gen-Mod take is a decision with its reason, as
any other take. The recipe fields are what such a decision is about, so a
reusable preference can say something precise ("person swaps: pose guide,
whole-frame pose; faces: masked, dilation 8") instead of "make it better".
Agents propose; only the owner promotes, as for all taste.

## Rules and gates

- **Consent.** Swap only characters and faces the person owns or has consent to
  use, never a real person's likeness without it. The panel says so.
- **Every pass is paid.** The still and the video pass each quote first and
  wait for a yes; neither is retried automatically. On-device detection is
  free and sends nothing.
- **Licences, before a shipped one-click route.** Both routes load LTX-2.3
  IC-LoRAs (Union Control, In-Outpainting) on LTX-2.5, and LTX-2.3's licence
  text is ambiguous
  ([licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md),
  "need a decision" 4); the LTX non-compete question (item 1) applies to every
  LTX route. The BFS LoRA's licence is unverified and its nodes are GPL-3.0, so
  they are installed by the person, never vendored. The supplied Replace
  Anyone workflow is the owner's material, not the repository's: its port lives
  outside the repository until its licence is known.
- **Nothing vendored.** Official graphs are fetched and hash-checked at run
  time (`scripts/fetch-director-ltx.mjs`), as today.

## What exists and what is next

Exists now: the recipe contract, its prompt and pass planning, agent box
conversion and on-device subject boxes, with their checks (`shared/genmod/`, `tests/genmod.test.ts`);
the still pass with character, face and background modes; the pinned inpaint
graph and its Cloud adapter; and the manual run in
[Director on Comfy](director-comfy.md).

Next, built one step at a time, each tried on its own with the owner's
approval before the next, then chained:

1. **Look.** The agent proposes labelled boxes on frame 0 with `boxFromAgent`;
   the swap panel can draw them, or `subjectBox`'s on-device box, for
   approval. Free.
2. **Still.** The approved boxes, references and words through the FLUX 3
   Klein edit, as the panel does today. One paid image.
3. **Video, per route.** One owner-approved run each: `control` from the
   ported Replace Anyone graph, `audio` from the official 2.5 A2V graph,
   `masked` from the pinned inpaint graph, on a short clip, with receipts in
   [verification](director-remix-verification.md). Then a hand-translated API
   graph behind a `workflow` entry for each route that earns one, once the
   licence questions are answered.
4. **Chain.** Still → video (→ upscale) as a [chain](architecture.md): each
   stage quoted and approved, each reading the previous stage's take. Chains
   refuse image references today, so the still and video stages join once
   they read project asset ids instead of request bytes. Recipes
   live in the project, behind a `genmod` Director command, so agents read and
   write them like any other revision-checked edit.
5. **Later.** The masked route's mask video from a recipe in the browser;
   the spoken line transcribed into `action`; crop sampling and C on faces;
   one recipe per shot for a clip with cuts.

Sources:
[ComfyUI-LTXVideo 2.5 workflows](https://github.com/Lightricks/ComfyUI-LTXVideo/tree/220e1d45aa0469f518e982102fca4dca92a61862/example_workflows/2.5),
[LTX in/outpainting guide](https://docs.ltx.io/open-source-model/feature-guides/editing-effects/in-outpainting),
[IC-LoRA adapters](https://docs.ltx.io/open-source-model/integration-tools/ic-lo-ra-adapters),
[ComfyUI-BFSNodes](https://github.com/alisson-anjos/ComfyUI-BFSNodes/tree/f4b6f63be1a76ccc4992112568fad38bcaa4120c),
[BFS face swap video (card, unverified)](https://huggingface.co/Alissonerdx/BFS-Best-Face-Swap-Video),
[LTX-2.3 Clean Plate (card, unverified)](https://huggingface.co/Lightricks/LTX-2.3-22b-IC-LoRA-Clean-Plate),
[LTX-2.3 Creative Lab](https://huggingface.co/collections/Lightricks/ltx-23-creative-lab),
[Scenario's Alter](https://www.scenario.com/explorations/alter/), the
Seedance-based skill whose keep-list prompt structure this borrows.
