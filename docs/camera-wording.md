---
tags: [camera, bfl, ltx, comfy, sound]
summary: The camera terms the studio uses, their BFL, LTX and MiniMax H3 sources, what it claims, and the Acoustic Space LoRA.
---

# Camera wording and examples

The [BFL camera guide](https://docs.bfl.ai/guides/prompting_video_camera_terms) is the terminology source. The studio exposes three of its fourteen sections: **Shot sizes**, **Angles**, and **Movements**, with eight terms each for shot sizes and angles and ten movements. Each heading links to the matching guide section. Checked 19 September 2026; rechecked 20 October 2026, when the guide's movement gallery named Handheld, Tracking shot and Steadicam follow.

FLUX 3 from a start image (`flux-3-i2v`, BFL direct) gets every term FLUX 3 text to video does. Neither the camera guide nor the Image to Video tab of BFL's [FLUX 3 video reference](https://docs.bfl.ai/api-reference/utility/generate-a-video-with-flux-3), checked 27 October 2026, limits camera terms when keyframes are given. Until then the panel showed that entry only the terms every model shares (six shot sizes, five angles, six moves), because the FLUX-only terms named `flux-3` alone.

`shared/camera-terms.ts` is the current registry: labels, descriptions, prompt clauses, studio-authored examples and pose parameters; `shared/camera.ts` picks each model's names, guide links and wording from it, and `shared/camera-h3.ts` holds H3's. Every section has an optional None choice. The prompt contains the scene followed by shot size, angle and movement. Edits belong to individual terms; switching away and back restores them. Empty edits remain empty. Default clauses use sentence case.

The inline examples are written for this studio and labelled accordingly. BFL's own examples are linked, not copied wholesale, and BFL-hosted videos are not embedded. All playable media loads from this app's origin. No reliability claim follows from a term appearing in the guide.

The diagram composes distance/target, elevation/azimuth/roll, and movement. Lazy Susan turns the subject with a stationary camera. Pan and tilt change aim without translation; trucking changes camera position. Extreme low angles stop above the ground. These are illustrative poses, not measured lens models or a prediction of generated footage. Editing prose does not change the illustration.

`shared/legacy-camera.ts` is a compatibility table for the initial eight IDs. It is not a second active picker. Saved prompts retain their exact historical clause; retry maps the choice to the closest current term and carries the old wording into an edit. Old directional/reverse variants may therefore differ from the current diagram.

## LTX-2.5

The [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide) is the terminology source for LTX, checked 10 October 2026 and rechecked 22 October 2026, unchanged. It asks for one flowing present-tense paragraph of roughly four to eight sentences, the camera described relative to the subject, and a description of how the subject appears after the move. Its camera language is: Follows, Tracks, Pans across, Circles around, Tilts upward, Pushes in / pulls back, Overhead view, Handheld movement, Over-the-shoulder, Wide establishing shot, Static frame.

Every term in `shared/camera.ts` carries an LTX sentence beside its BFL clause; the model picks the wording and a user's edit wins over either. The composer joins the scene and the sentences into one paragraph for LTX and keeps them as lines for FLUX. Two moves exist for LTX only (Pull back, Static), since the LTX guide names them and the BFL guide does not; FLUX hides them. Follow and Handheld were LTX-only until the 20 October recheck found them in BFL's gallery; FLUX now writes them as BFL does ("Steadicam follow", "Handheld"). Shot sizes and angles are generic cinematography terms the guide asks for by name ("include shot scale"). FLUX 3 and Klein get all eight of each. Since 22 October LTX gets a shorter list, leaving out terms that overlap or contradict others: Macro (overlaps Extreme close-up), Cowboy (between Medium and Full), Worm's eye (overlaps Low angle), Aerial (between High angle and the guide's Overhead view) and Dutch angle (not in the guide, and a rolled frame reads as a move beside a real one). Bird's eye goes by the guide's name, Overhead view. A term the chosen model's panel does not show is also left out of the prompt, so switching model never sends a hidden term.

With an LTX model selected, the camera panel speaks LTX's language. Its names come from two LTX sources: the camera-control presets Lightricks shipped as LTX-2 camera LoRAs ([Dolly left](https://huggingface.co/Lightricks/LTX-2-19b-LoRA-Camera-Control-Dolly-Left) and its six siblings: Dolly in, Dolly out, Dolly right, Jib up, Jib down, Static), which also appear as presets in [LTX's API changelog](https://docs.ltx.io/api-changelog/2026/1/1) (the changelog adds an eighth, `focus_shift`, a focus change rather than a camera move, which the studio does not offer), and the LTX-2.5 guide's verbs (Circle around, Pan across, Tilt up, Handheld). The panel looks and works the same for both models; only the names, the wording and the guide link change. To offer LTX only what its own sources document, the LTX panel has eleven moves: the seven presets plus Circle around, Pan across, Tilt up and Handheld. Follow left the LTX panel on 22 October: it needs a moving subject, which a scene cannot promise. BFL's Arc shot, Trucking and Lazy Susan stay FLUX-only, and Trucking's two directions appear for LTX as Dolly left and Dolly right. The links in the panel point at the LTX guide instead of BFL's. The LoRA cards give one prompting rule, describe where the move ends and what it reveals, and the directional LTX sentences follow it. Sentences for shot sizes and angles use stationary verbs ("frames", "sits at") so they never read as a second move, and Dolly left and right are written with the guide's verb ("tracks").

The LoRAs themselves are not loaded, checked 20 October 2026. They target the LTX-2 19B base; Lightricks has published none for LTX-2.3 or LTX-2.5, and nothing says the 19B files load on the 22B model. Comfy Router accepts no LoRA. Using them needs an LTX-2 workflow on Comfy Cloud or a local ComfyUI. They fall under the LTX-2 Community License, so Genobi links to them rather than shipping the weights.

Agents get the same wording from the plugin's `genobi-camera` skill ([`plugins/genobi/skills/genobi-camera/SKILL.md`](https://github.com/koshimazaki/Genobi/blob/main/plugins/genobi/skills/genobi-camera/SKILL.md)): the guide's rules above, the eleven LTX moves and the ten FLUX moves with their sentences, and one card per runnable model. `tests/plugin-skill-cards.test.ts` checks the skill against `shared/camera.ts` and the registry, so a change here that leaves the skill behind fails the tests.

### Motion, light and order

The guide's latest version (Lightricks, [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide), dated 10 August 2026, rechecked 22 October 2026) lists six elements in order: establish the shot, set the scene ("lighting conditions, color palette, surface textures, and atmosphere"), describe the action ("as a natural sequence, flowing clearly from beginning to end"), define the characters ("age, hairstyle, clothing, and distinguishing features", emotion "through physical cues, not abstract labels"), identify the camera movement, and describe the audio ("ambient sound, music, speech, or singing", dialogue in quotation marks).

For an LTX model the composer follows that order. Three pickers fill the picker places, in the guide's order **Shot → Light → Movement**: Shot is the shot size and angle tabs, Movement the twelve LTX moves, and **Light** (`shared/light.ts`) a new tab between Angles and Movements with the guide's Visual Details terms, one or None per group: Lighting (Flickering candles, Neon glow, Natural sunlight, Dramatic shadows), Color palette (Vibrant, Muted, Monochromatic, High contrast) and Atmosphere (Fog, Rain, Dust, Smoke, Particles). The guide gives terms, not sentences, so each term's sentence is studio-authored; an edit wins, as it does for a camera term. FLUX has no Light tab.

Four free-text gaps sit as tabs over the one prompt field (Prompt · Scene · Character · Action · Audio), each with a one-line hint in the guide's words and a row of chips (`shared/ltx-vocabulary.ts`). A chip adds its phrase to the end of the gap and never replaces it; a chip whose phrase would take the gap past 1,200 characters is disabled and says so in its name. Scene's chips are the guide's Textures, Scale Indicators, its Animation, Stylized and Cinematic categories and Film Characteristics; Action's are its sequence words ("Initially…", "A moment later…", "Simultaneously…"), its Pacing & Temporal Effects (Rapid cuts left out, since a run is one continuous take) and studio-authored present-tense motion verbs; Audio's are its Ambient Settings, Dialogue Style and Volume, the Volume chips writing the dialogue in quotation marks. The guide has no Character list, so that set is studio-authored to its rule (age, hairstyle, clothing, features, physical cues such as "jaw clenched", never "sad"). Each gap also offers three studio-authored example lines (`shared/ltx-examples.ts`) with room for an example clip; none has been generated, since that is a paid run.

The browser joins the parts into the one description a request carries, in this order: shot and angle sentences → the main field → Scene text and Light sentences → Action → Character → movement sentence → Audio. An empty gap leaves only its picker's sentence; each part becomes a sentence (capitalised, closed with a full stop). On Acoustic Space the AKUSPACE caption opens the Audio part exactly as `acousticCaption` writes it, newlines and closing marks included, and the Audio text follows it after a full stop; the Audio tab shows the Acoustic Space choice and opens the same dialog. The server does not compose: it validates and records the parts as `ltxPrompt` (type and length, Light terms by group, the caption kept whole when there is a treatment) and, with `ltxPrompt` present, sends the description as it is. The rule the server refuses a composed request by (`composedRefusal` in `shared/ltx-prompt.ts`) is the one the composer holds Generate on, so Generate is never offered for a request the server would refuse; `tests/ltx-prompt-generate.test.ts` checks that over generated gaps, chips, Light edits and captions. Recreate and a saved prompt bring the gaps back as gaps. Voice dictation fills the open gap's field ("In the Action gap."), as [voice mode](voice-mode.md) describes.

When every gap is empty and no Light is chosen, nothing changes: the request is the one sent before the gaps existed, the main text with the camera sentences appended by `composePrompt`, and no `ltxPrompt`. FLUX ignores the gaps entirely; `tests/ltx-prompt.test.ts` pins both against prompts composed by the previous `main`.

The composed paragraph must keep the description's 1,200 characters. A counter beside the tabs shows the count, and past the limit the composer says by how much and which parts lose their end; the request is cut at a word boundary. A cut that would reach the AKUSPACE caption holds the run instead, since the LoRA needs its trigger whole. "View composed prompt" shows the paragraph part by part, each in its colour with a text label, and strikes through what the limit cuts.

Each part has a theme colour token in `src/styles/tokens.css`, defined for Blackstone / Lime and for Cyberpunk: `--camera-shot`, `--camera-angle`, `--camera-light`, `--camera-movement`, `--prompt-scene`, `--prompt-character`, `--prompt-action` and `--prompt-audio` (the Acoustic Space colour). Tabs, chips, picker headings and the preview read only those tokens, so a theme switch recolours them live. `scripts/check-ltx-prompt.mjs` switches the theme and checks that each colour changes, keeps at least 4.5:1 on the composer and stays at least ΔE 10 (CIEDE2000) from the others.

### Claims

No reliability claim follows from a term appearing in either guide. The camera test (`npm run camera-test`) runs one scene through each movement, one take each; the verdicts go here when it has run.

| Move | Result      | Note                                                   |
| ---- | ----------- | ------------------------------------------------------ |
| —    | not yet run | `COMFY_API_KEY` was not available in the build session |

## MiniMax H3

Since Box 2.6 (28 October 2026) every H3 entry takes the camera panel: H3 on Router (`minimax-h3-router`) and the four Cloud OmniRef workflows (`minimax-h3`, `-canny`, `-depth`, `-combined`). The Openjutsu swap does not. Once an H3 entry is selected the same panel swaps its names, sentences, order and links to MiniMax's, as it does for LTX. The source is MiniMax's [base prompt guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md) at commit `42ed227`, section 4.3 (Camera Motion: Motion Type + Amplitude + Speed), which the full-reference guide defers to (section 5.1); [MiniMax H3 camera wording](minimax-h3-camera.md) has the sources, rechecked 28 October 2026, and the mapping this follows.

The guide asks for a camera move "as a natural English action within the shot, rather than stacked as separate labels", so the studio never writes bracket commands (those are Hailuo 2.3 and 02's syntax), and it writes no amplitude or speed modifier: the guide omits the medium, normal default. **Order.** One English paragraph, as the guide's shot is written (section 4.1, "the overall style and initial composition" at the start of the shot): the shot size and angle sentences, the person's text, then the move in the same shot (`h3Paragraph`). No reference-mode sections are written ([open question 1](minimax-h3-camera.md#open-questions)). The composer's preview and the request read the same order, and `composePrompt` writes it for both adapters. A legacy preset is never written for H3: its wording is BFL's.

Shot sizes and angles have no H3 list, so H3 takes the LTX panel's narrowed lists without Profile, and the LTX sentences, whose stationary verbs never read as a second move. Each panel heading links to its guide section: shot size and angle to 4.1, movement to 4.3.

| Studio term (id)                 | LTX name          | H3 name           | H3 sentence                                                                 | Guide section                |
| -------------------------------- | ----------------- | ----------------- | --------------------------------------------------------------------------- | ---------------------------- |
| Extreme close-up                 | Extreme close-up  | Extreme close-up  | An extreme close-up fills the frame with one detail of the subject.         | 4.1, studio wording          |
| Close-up                         | Close-up          | Close-up          | A close-up frames the upper part of the subject.                            | 4.1, studio wording          |
| Medium shot                      | Medium shot       | Medium shot       | A medium shot frames the subject from the waist upward.                     | 4.1, studio wording          |
| Full shot                        | Full shot         | Full shot         | A full shot keeps the whole subject in the frame.                           | 4.1, studio wording          |
| Wide shot                        | Wide shot         | Wide shot         | A wide shot gives the subject room in its surroundings.                     | 4.1, studio wording          |
| Establishing shot                | Establishing shot | Establishing shot | A wide establishing shot shows the subject and the whole setting around it. | 4.1, studio wording          |
| Eye level                        | Eye level         | Eye level         | The camera sits at eye level with the subject.                              | 4.1, studio wording          |
| Low angle                        | Low angle         | Low angle         | The camera looks up at the subject from a low angle.                        | 4.1, studio wording          |
| High angle                       | High angle        | High angle        | The camera looks down at the subject from a high angle.                     | 4.1, studio wording          |
| Bird's eye (`birds-eye`)         | Overhead view     | Overhead view     | An overhead view looks straight down at the subject from directly above.    | 4.1, studio wording          |
| Dolly in (`dolly-in`)            | Dolly in          | Push in           | The camera pushes in toward the subject.                                    | 4.3, Push In                 |
| Pull back (`pull-back`)          | Dolly out         | Pull out          | The camera pulls out from the subject.                                      | 4.3, Pull Out                |
| Pan left (`pan-left`, H3 only)   | Not for LTX       | Pan left          | The camera pans left across the subject.                                    | 4.3, Pan Left                |
| Pan right (`pan-right`, H3 only) | Not for LTX       | Pan right         | The camera pans right across the subject.                                   | 4.3, Pan Right               |
| Dolly left (`dolly-left`)        | Dolly left        | Truck left        | The camera trucks left past the subject.                                    | 4.3, Truck Left              |
| Dolly right (`dolly-right`)      | Dolly right       | Truck right       | The camera trucks right past the subject.                                   | 4.3, Truck Right             |
| Tilt (`tilt`)                    | Tilt up           | Tilt up           | The camera tilts up along the subject.                                      | 4.3, Tilt Up                 |
| Crane / boom (`crane`)           | Jib up            | Pedestal up       | The camera pedestals up, keeping the subject in view.                       | 4.3, nearest: Pedestal Up    |
| Jib down (`jib-down`)            | Jib down          | Pedestal down     | The camera pedestals down toward the subject's level.                       | 4.3, nearest: Pedestal Down  |
| Arc shot (`arc`)                 | Not for LTX       | Arc shot          | The camera moves in an arc around the subject.                              | 4.3, Arc Shot                |
| Follow (`follow`)                | Not for LTX       | Tracking shot     | A tracking shot follows the subject as it moves.                            | 4.3, Tracking Shot           |
| Static (`static`)                | Static            | Static shot       | The camera holds a static shot on the subject.                              | 4.3, Static Shot             |
| Handheld (`handheld`)            | Handheld          | Shake slightly    | The camera shakes slightly as it stays on the subject.                      | 4.3, nearest: Shake Slightly |

Left out for H3: Orbit (no full circle is documented), the undirected Pan and Trucking (H3 names a direction, so Pan is split into Pan left and Pan right, H3-only terms, as Trucking is into Dolly left and right), Lazy Susan (a subject move), and Macro, Cowboy, Worm's eye, Aerial, Dutch angle and Profile. Light is LTX's alone. A term the H3 panel does not show is dropped when the composer switches to H3 and never written into the prompt; the server accepts the camera for every H3 entry, as it does for LTX, and needs none, so a prompt may still carry the camera in the person's own words. The anime teaser picks no term, since each storyboard panel already sets the viewpoint ([open question 5](minimax-h3-camera.md#open-questions)). On an OmniRef entry the guide video still carries its own motion; the sentence is words beside it.

No reliability claim: no H3 camera run has been made, and a verdict on any term needs a paid run the owner approves. Agents get the same table from the `genobi-camera` skill ([`references/reference-video.md`](https://github.com/koshimazaki/Genobi/blob/main/plugins/genobi/skills/genobi-camera/references/reference-video.md)), held to `shared/camera-h3.ts` by `tests/plugin-skill-cards.test.ts`; `tests/camera-h3.test.ts` checks the panel, the sentences and the order.

## Camera paths

`shared/camera-path.ts` is the portable shape of a camera move, so a recorded, preset or agent-authored move can travel between the browser, an agent and the server as data. It is not yet part of a generation request.

```ts
type CameraPath = {
  version: 1;
  duration: number; // seconds from the first key to the last, 0.1 to 60
  keys: {
    t: number; // normalised time, 0 on the first key and 1 on the last, strictly increasing
    position: [number, number, number]; // scene units, within ±1000
    target: [number, number, number]; // the point looked at; never the position
    fov: number; // vertical, 5 to 150 degrees
    roll: number; // ±180 degrees, default 0
    ease?: CameraEaseKey; // the segment leaving this key, default linear; absent on the last key
  }[]; // 2 to 256 keys
};
```

`validateCameraPath` rejects unknown fields, non-finite numbers, anything out of bounds and any segment along which the camera would meet its target (checked at the closest approach between keys, not only at the keys), and returns a canonical copy. `sampleCameraPath` interpolates position, target, field of view and roll through each segment's ease. The six eases (`shared/camera-ease.ts`) are the curves of Holodeck's camera combo: linear, smoothstep, cubic ease in, cubic ease out, cubic S and sine in-out.

`src/world-builder/camera-path.ts` turns a World Builder recipe, or one of its preset shots, into a path on the take's frame grid. At one key per frame it replays the recipe's camera exactly; a coarser step stays on the grid and keeps the last frame.

`describeCameraPath` (`shared/camera-path-terms.ts`) names a path in this vocabulary, one term per section, from the terms the chosen model's guide names. It returns null for a section when nothing fits:

| Section   | Read from                                 | Named                                                                                                                                                                                                                                                                                | Not named                                                                                             |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Shot size | the first key, given the subject's height | frame height against subject height, by the terms' descriptions (one detail, upper part, waist, mid-thigh, whole subject, surroundings)                                                                                                                                              | any path without a subject height                                                                     |
| Angle     | the first key                             | the nearest of the terms' illustrative elevations within 15°; Dutch from 10° of roll                                                                                                                                                                                                 | Profile (a path has no subject facing); elevations far from every term                                |
| Movement  | every key and between keys                | Orbit, Arc shot, Dolly in, Pull back and Jib down, Crane / boom around a fixed target; Pan (Pan left or right for H3) and upward Tilt from a fixed camera; Trucking (Dolly left or right for LTX) and Follow when camera and target travel together; Static (LTX) when nothing moves | a zoom, a roll, a downward tilt, a move that turns back, two motions at once, Handheld and Lazy Susan |

Movement is read across the whole path, so a zoom or move that returns to its start by the last key still counts, and Static means nothing, roll included, changed at any point. The thresholds are this studio's reading of the terms, not provider guidance. A named term is the nearest documented wording for the move; it is no claim that a model will follow the path.

## Acoustic Space (AKUSPACE)

Acoustic Space describes where the sound is heard, not where the camera is. It is the AKUSPACE LoRA, trained on LTX-2.5 audio, and it runs on one entry only: **LTX-2.5 · Acoustic Space** (`ltx-2-5-akuspace`), a Comfy Cloud workflow that is LTX-2.5 Fast's graph plus a core `LoraLoaderModelOnly`. It is landscape only (16:9) for now: the Cloud template names its frame by label, and only its widescreen label is known. The ACOUSTIC SPACE switch on LTX-2.5 Fast moves between the two entries; choosing None returns to Fast. Video audio is always on.

**Vocabulary.** `shared/akuspace-presets.json` is a verbatim copy of the node pack's `presets.json` (version 4, release 0.5); the dialog's sections are the node's modes:

| Section       | Presets                                        | Levels               |
| ------------- | ---------------------------------------------- | -------------------- |
| Room          | Small room, Empty club, Medium room, Cathedral | Low, Moderate, Heavy |
| Space         | Outside · day, Outside · night                 | Low, Heavy           |
| Sound effects | Dual Delay (experimental)                      | Low, Heavy           |

Off (dry) is not a choice: it bypasses the LoRA, which is LTX-2.5 Fast. The node's `source_type` stays at "none", the effect-only caption.

**The wording.** There is one: the trained caption grammar, trigger first, for example `AKUSPACE in an empty club, heavy broad hard-surface reflections and a 1.2-second reverb decay, no crowd`. `shared/acoustic.ts` ports the node's `build_caption` and `compose_prompt`, so the prompt the workflow receives closes with the same text the AKUSPACE Prompt node would append for the same settings, joined the same way (a space after `.`, `,`, `;` or `:`, otherwise `, `). `tests/acoustic.test.tsx` checks five settings against strings produced by running the node's Python. The dialog lets you edit up to 600 characters of acoustic wording while keeping the AKUSPACE trigger separately protected. Default captions remain byte-identical. Custom wording remains when you switch presets or levels until you choose Reset to preset wording; it is saved with the run and restored for recreation. Custom text is experimental wording rather than a trained caption.

**What each route can do.** Comfy Router runs no LoRA, so it cannot apply AKUSPACE; the studio never sends a treatment to Router and never describes a Router run as spatial. Acoustic Space now runs as that Cloud workflow ([`workflows/ltx-2-5-akuspace-t2v.json`](https://github.com/koshimazaki/Genobi/blob/main/workflows/ltx-2-5-akuspace-t2v.README.md)): Comfy Cloud's LTX-2.5 template switched to text to video, with a core `LoraLoaderModelOnly` (`akuspace-ltx25-v0.5.safetensors`, strength 1.0) between the model and both guiders, and the template's prompt enhancer off so the camera sentences and the treatment reach the encoder as written. The run uses the key owner's Cloud library, so the LoRA must be imported there (Creator tier); if it is missing, Cloud refuses the run and the studio says so. The public reference workflows are at [github.com/koshimazaki/ComfyUI-Koshi-Nodes/tree/main/workflows/akuspace](https://github.com/koshimazaki/ComfyUI-Koshi-Nodes/tree/main/workflows/akuspace).

**The preview.** The lazy-loaded original AKUSPACE Three.js viewer retains its glass room geometry, floor grids, source orb, wave animations, outdoor day or night and dual-delay lanes. Drag to orbit and scroll to zoom; studio theme colors and the Camera Control listener figure integrate it with the rest of the app. Replay restarts the animation; reduced motion shows static rings. The preview follows the selected preset, including when the wording is custom. It is an illustrative guide, not an exact acoustic simulation or a prediction of the generated sound.
