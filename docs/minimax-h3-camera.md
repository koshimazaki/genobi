---
tags: [camera, comfy, research]
summary: What MiniMax documents about camera wording and prompt structure for H3, and the mapping from the studio's camera controls that every H3 entry now speaks.
---

# MiniMax H3 camera wording

The research behind the H3 camera panel. Since Box 2.6 (28 October 2026) every
H3 entry, H3 on Router (`minimax-h3-router`) and the four Cloud OmniRef
workflows, takes the camera panel in the wording below
(`shared/camera-h3.ts`); [camera wording](camera-wording.md#minimax-h3) has
the panel as built. Nothing here has been run; no claim about how H3 follows a
term comes from this page. All sources were checked on 27 October 2026 and
rechecked on 28 October 2026 ([recheck](#recheck-28-october-2026)).

## Sources

| Source                                                                                                                                                                                   | What it is                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Video Prompt Writing Guide (base modes)](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)          | MiniMax's guide for T2VA, I2VA, FL2VA and L2VA, in the official model repository, pinned to commit `42ed227` (13 August 2026). The camera vocabulary lives here.     |
| [Full-Reference Mode guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md)                         | MiniMax's guide for reference-to-video (Ref2VA): reference labels, section order and length. It defers to the base guide for camera wording.                         |
| [Model card](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/README.md)                                                                        | H3-Context-IR, the hosted stage that rewrites free-form input into the form the guides describe.                                                                     |
| [`h3-prompt-writing` skill](https://github.com/MiniMax-AI/MiniMax-H3/tree/d21241f0a4b3acbb34c97dae47fa417b7065e438/.claude/skills/h3-prompt-writing)                                     | MiniMax's agent skill. Its two reference files are identical to the guides above.                                                                                    |
| [Video Generation guide](https://platform.minimax.io/docs/guides/video-generation), [Create task](https://platform.minimax.io/docs/api-reference/video-generation-v2-create)             | MiniMax platform pages for the hosted API that Router calls (`/v2/video_generation`): limits, roles and a camera hint in the text-to-video paragraph. Not versioned. |
| [Text-to-video (v1)](https://platform.minimax.io/docs/api-reference/video-generation-t2v)                                                                                                | The older endpoint for Hailuo 2.3, Hailuo 02 and T2V-01-Director, where the bracketed camera commands are documented.                                                |
| [Router schema](https://docs.comfy.org/router-schemas/minimax/minimax-h3.json), version `c0e2e941ffff`                                                                                   | Comfy Router's request body. It has no camera field, no prompt-length limit and no prompt-expansion field.                                                           |
| [Comfy H3 API nodes](https://docs.comfy.org/tutorials/partner-nodes/minimax/minimax-h3), [Comfy H3 prompt guide](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-prompt-guide) | Comfy's pages. They link MiniMax's two guides as the official ones and add tips of their own, some for local workflows only.                                         |

### Recheck, 28 October 2026

Unchanged since 27 October. The Hugging Face repository's `main` is still commit
`42ed227` (13 August 2026), and the pinned base guide, full-reference guide and
model card are byte-identical to `main`. The GitHub repository's `main` is still
`d21241f`, so the `h3-prompt-writing` skill is the pinned one. Comfy's H3 prompt
guide and API node page, and MiniMax's Video Generation guide, create-task,
text-to-video (v1) and self-hosting pages, read as recorded below: the
"\[pan], \[zoom], \[static]" line is still in the platform guide, the v1 page
still names its 15 bracket commands for Hailuo 2.3, Hailuo 02 and
T2V-01-Director only, the create-task page still gives 4 to 15 seconds for
MiniMax-H3, 7,000 characters per `text` item and `prompt_expansion_mode` for
H3 Max only, and Comfy's API node page still says 5 to 15 seconds. The Router
schema is still version `c0e2e941ffff`. The platform and Comfy pages are not
versioned, so "unchanged" for them means the facts this page records still
hold, not a byte comparison.

## What H3 documents

### Camera vocabulary

H3's camera wording is natural English built from a fixed list. The base guide
(section 4.3) says a camera move has three parts, **motion type**, **amplitude**
and **speed**, and that amplitude and speed are added "only when they are
meaningful; medium amplitude and normal speed are usually omitted."

| Part        | Documented terms                                                                                                                                                                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Motion type | Zoom In / Zoom Out (focal length), Push In / Pull Out, Pan Left / Pan Right, Truck Left / Truck Right, Tilt Up / Tilt Down, Pedestal Up / Pedestal Down, Arc Shot, Tracking Shot, Static Shot, Shake Slightly / Shake Strongly, POV, Roll Clockwise / Roll Counterclockwise |
| Amplitude   | with small amplitude, with large amplitude                                                                                                                                                                                                                                  |
| Speed       | at slow speed, at fast speed                                                                                                                                                                                                                                                |

The rule for placement is explicit: "Camera motion should be written as a natural
English action within the shot, rather than stacked as separate labels at the end
of a sentence", for example "The camera pushes in with small amplitude at slow
speed toward the folded letter in her hands." The full-reference guide repeats it
(section 5.1). Camera wording sits inside a `[Shot N]` paragraph.

**How many per prompt** is not documented. Neither guide sets a limit per shot or
per prompt, and neither says whether two motion types may combine. The guide does
say a cut should bring new information, and "if only the distance or a slight
angle needs to change, prefer camera motion" over a cut (section 4.2). Open.

**Brackets.** In H3's guides, square brackets mark shots (`[Shot 1]`), the
language inside a dialogue tag (`<d>[English] …</d>`) and the Ref2VA task prefix
(`[reference generation]`), never camera commands. Bracketed camera commands are
documented for **Hailuo 2.3, Hailuo 02 and T2V-01-Director** on the v1 endpoint:
15 commands (`[Truck left]`, `[Truck right]`, `[Pan left]`, `[Pan right]`,
`[Push in]`, `[Pull out]`, `[Pedestal up]`, `[Pedestal down]`, `[Tilt up]`,
`[Tilt down]`, `[Zoom in]`, `[Zoom out]`, `[Shake]`, `[Tracking shot]`,
`[Static shot]`), up to three combined in one bracket, in sequence through the
prompt, with "free-form descriptions also work, but explicit commands yield more
accurate results." That page names no H3 model.

One MiniMax page disagrees: the platform's Video Generation guide, under
Text-to-Video, says "add camera motion instructions (e.g., \[pan], \[zoom],
\[static]) directly after key descriptions." It gives no list, and the create-task
reference and both model guides do not repeat it. This page treats the model guide
as the camera source and the bracket line as an open conflict.

### Shot size, angle, light and style

- **Shot size**: no list. The guide asks for "the overall style and initial
  composition" at the start of `[Shot 1]`; its own examples write "a medium-wide
  shot frames…", "a close-up of…" and "a close shot begins…".
- **Angle**: no list. POV is a motion type. Roll is a move around the lens axis,
  not a held Dutch angle.
- **Light**: no vocabulary. The full-reference guide asks each shot to establish
  "the current composition, subject appearance and position, environment and
  lighting, actions and state changes, camera movement, current sound"; FL2VA
  descriptions cover "how the scene or lighting transitions".
- **Style**: the guide lists common styles for the opening of `[Shot 1]`:
  Cinematic, live-action, 2D-animated, 3D CG, claymation, watercolor and vintage
  film.
- **What to avoid**: camera labels stacked at the end of a sentence; a cut where
  a camera move would do. Comfy's prompt guide also says "No negatives", but that
  is about its local workflow (`BasicGuider` at cfg 1), not the hosted API.

### Structure and length

| Mode                         | Order                                                                                                                      | Main field                          | Style sentence                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------- |
| Text only (T2VA)             | `integrated_multimodal_description`, `overall_soundscape`, `non_diegetic_music`                                            | `integrated_multimodal_description` | After `[Shot 1]`                         |
| First/last frame (I2VA etc.) | A fixed alignment line, a blank line, then the three T2VA fields                                                           | `integrated_multimodal_description` | After `[Shot 1]`, derived from the image |
| Reference (Ref2VA)           | `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music` | `detailed_description`              | One or two sentences before `[Shot 1]`   |

The first shot has no timestamp; later shots open with a cut time, for example
`[Shot 2] At 00:03.500, the camera cuts to…`. Everything is written in English
except dialogue, lyrics and on-screen text. For generation, `detailed_description`
"is normally 350-500 English words." The platform allows up to 7,000 characters
per `text` item. The studio's own description limit is 1,200 characters
(`server/validation.ts`), well under that.

**These guides describe H3-Context-IR's output.** The model card calls
Context-IR "critical to the quality of the final output" and recommends either
using it or "following the Prompting Guidance to build your own context-processing
system". The create-task examples send one free-form sentence, and the model card
says Context-IR plus H3-Base plus 2K regeneration reproduces "the quality of 2K
videos generated directly by the MiniMax API", which suggests the create endpoint
expands the prompt itself. The create-task page does not say so; its
`prompt_expansion_mode` switch is documented for H3 Max only, and the Router
schema carries no such field. Open.

### Referring to references

The full-reference guide labels inputs `<Subject N>` (content reused in the
video), `<Picture N>`, `<Video N>` and `<Audio N>`. An image used only to define a
character is cited inside its `<Subject N>`; an image used as a storyboard gets its
own entry, for example "`<Picture 3>` is a storyboard reference for `[Shot 1]` and
`[Shot 2]`, defining their viewpoint, subject placement, and shot order." MiniMax's
[self-hosting page](https://platform.minimax.io/docs/guides/local-deploy-h3) says
to refer to inputs "in connection order with tags such as `<Picture 1>`, `<Video 1>`,
and `<Audio 1>`, then state which reference controls identity, style, motion,
camera, or voice."

Other pages word it differently: Comfy's API node page says `Image 1`, MiniMax's
[launch post](https://www.minimax.io/blog/minimax-h3) (31 July 2026) quotes
"Reference the Hitchcock camera movement from Video 1, have the character in
Image 2 sing", and the create-task example says "reference audio 1". Comfy's
prompt guide (for local workflows) gives a multi-panel reference sheet its own
`<Picture N>` and points shots at a panel.

### Text-only against reference-to-video

The camera vocabulary and its placement are the same in every mode; the
full-reference guide defers to the base guide for them. What changes is the frame
around it (the table above): the main field's name, where the style sentence goes,
and the reference labels. H3 on Router is always reference-to-video in this studio
(the sheet and the storyboard as `reference_image` items), so the full-reference
guide applies. Its storyboard entry defines viewpoint, so a camera term can
contradict a storyboard panel; MiniMax says nothing about which wins.

## What the studio maps

Proposed on 27 October and built in Box 2.6 as written, except where
[as built](#as-built) says otherwise. The studio terms come from
`shared/camera-terms.ts`; "documented" means the motion type is in the base
guide's table, and "nearest" means the studio's reading of the closest one.

| Studio term                       | H3 wording                                                          | Basis                                                                           |
| --------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Dolly in                          | The camera pushes in toward the subject.                            | Documented (Push In)                                                            |
| Pull back                         | The camera pulls out from the subject.                              | Documented (Pull Out)                                                           |
| Pan                               | The camera pans left / right across the subject.                    | Documented, but H3 names a direction: split into two terms, as Dolly left/right |
| Tilt (upward)                     | The camera tilts up along the subject.                              | Documented (Tilt Up)                                                            |
| Trucking, Dolly left, Dolly right | The camera trucks left / right past the subject.                    | Documented (Truck Left / Right)                                                 |
| Crane / boom                      | The camera pedestals up, keeping the subject in view.               | Nearest (Pedestal Up moves the whole camera straight up)                        |
| Jib down                          | The camera pedestals down toward the subject's level.               | Nearest (Pedestal Down)                                                         |
| Arc shot                          | The camera moves in an arc around the subject.                      | Documented (Arc Shot)                                                           |
| Orbit                             | The camera moves in an arc around the subject with large amplitude. | Nearest; no full circle is documented, so Orbit could be hidden for H3          |
| Follow                            | A tracking shot follows the subject as it moves.                    | Documented (Tracking Shot); needs a moving subject                              |
| Handheld                          | The camera shakes slightly as it stays on the subject.              | Nearest (Shake Slightly); "handheld" is not in the table                        |
| Static                            | The camera holds a static shot on the subject.                      | Documented (Static Shot)                                                        |
| Lazy Susan                        | Leave out                                                           | A subject move, not a camera term                                               |

H3 terms the studio has no control for: Zoom In / Out, Roll, POV, Shake Strongly,
and the amplitude and speed modifiers. A first PR can write moves without
modifiers, which the guide calls the medium, normal default.

**Shot sizes and angles** have no H3 list, so their wording would be the studio's,
in the composition phrase that opens the shot ("a close-up frames the subject…")
with stationary verbs, as the LTX sentences do. The LTX panel's shorter lists are a
reasonable start: shot sizes without Macro and Cowboy; angles Eye level, Low angle,
High angle and Overhead, without Dutch (H3's Roll is a move), Worm's eye, Aerial
and Profile. **Light** has no vocabulary either; the LTX Light sentences could be
reused as studio wording, but that is the owner's call and need not be in the
first PR.

**Composition.** One English paragraph in shot order: the style and composition
(shot size, angle), the person's text, then the camera sentence inside the same
shot, never bracket commands. Do not emit the six Ref2VA sections by default until
the Context-IR question is answered. An optional lead sentence could name the
references as the guide does ("`<Picture 1>` is the character sheet…; `<Picture 2>`
is a storyboard reference…").

### As built

Box 2.6 (owner's decision, 27 October: "on par with BFL, but using the
terminology and order of H3", for every H3 MiniMax workflow):

- `shared/camera-h3.ts` holds an H3 sentence and name per term, in the guide's
  table order; `termsFor` shows an H3 entry only the terms with one. Pan is
  split into Pan left and Pan right, two H3-only terms; Orbit, the undirected
  Pan and Trucking, and Lazy Susan are left out. No amplitude or speed
  modifier is written.
- Shot sizes and angles are the LTX panel's narrowed lists without Profile, with
  the LTX sentences. Light is not offered for H3.
- The prompt is one paragraph in H3's order: shot size, angle, the person's
  text, then the move. No bracket commands and no Ref2VA sections; the lead
  sentence naming the references is a later step.
- `camera: true` for `h3RouterControls` and `h3VideoControls`, so the four
  OmniRef workflows take the camera too, which the proposal above did not. The
  guide video still carries its own motion; the sentence is words beside it.
  The registry entries say `camera: "minimax-h3"` and moved to recipe version 2.
- Both adapters share `server/validation.ts`, which now keeps the camera on for
  every H3 entry and still requires none. A legacy preset is never written for
  H3: its wording is BFL's.
- The panel's section links point at the pinned guide's sections 4.1 (shot
  size and angle) and 4.3 (movement); the `genobi-camera` skill carries the
  table in `references/reference-video.md`.

## Open questions

1. Does Router's `minimax/minimax-h3` route, or MiniMax's create endpoint behind
   it, run Context-IR on the prompt? If so, is a prompt already in the guide's
   structured form expanded again?
2. The platform guide's "\[pan], \[zoom], \[static]" line against the model guide's
   natural-language rule: which does MiniMax intend for H3?
3. How many camera moves per shot, and whether two motion types may combine.
4. Which reference wording the hosted model resolves best: `<Picture 1>`,
   `Image 1` or plain description.
5. When the storyboard's viewpoint and a picked camera term disagree, which
   should the studio send, or should the panel offer only movement when a
   storyboard is attached?
6. Whether to raise the 1,200-character description limit for H3 (the platform
   takes 7,000; the guide's descriptions run 350–500 words).
7. The duration note in `shared/comfy/h3-router.ts` says MiniMax's page gives 5 to
   15 seconds; the platform pages now give 4 to 15 for MiniMax-H3 and 5 to 15 for
   H3 Max. Comfy's API node page still says 5 to 15.
8. No reliability claim: any verdict on a term needs a paid run, with the owner's
   approval.
