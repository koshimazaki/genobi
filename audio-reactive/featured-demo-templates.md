# Featured Genobi demos — two template cards, three existing videos (draft)

**Status:** design and media-integration draft, not a shipped template or a completed render.  
**Brief:** 3 November 2026. Keep the owner's existing videos **unchanged**. Do not generate substitute artwork, change their cuts, overwrite their sound, or imply that a still swap edits an already-rendered MP4.

This is the public-Gallery packaging for the [audio-reactive workflow](README.md), [fruits recipe](videos/fruits.md), and [spaces recipe](videos/spaces.md). It **does not replace** the three technical experiment families (Fruits / Rooms / Objects) or the [agent skill](../plugins/genobi/skills/genobi-audio-reactive/SKILL.md).

## Exactly two cards

| Gallery card | Videos shown | Audio | Primary action |
| --- | --- | --- | --- |
| **Mecha × Fruits** · Character and objects | Two owner-supplied **existing character videos**, A and B, selectable as versions; no auto-stitch or newly generated media | **Dance with Fruits**, already aligned with the originals | **Make my version** → swap character and/or fruit reference images |
| **Reactive Spaces** · 3D and acoustics | One **existing spaces video**, with skyscrapers → cathedral → large hall → recording booth | **Adaptive Reverb**, including the space-derived room sound where present | **Make my version** → swap an architectural reference or change room dimensions |

The bundled Gallery already has a separate **Adaptive reverb** finished-cut template. Its existing original is at \`/media/template-gallery/adaptive-reverb.mp4\` (~30.46 s); **reuse rather than duplicate this card**. If the owner supplies a newer spaces MP4, replace the source by explicit selection, not by assuming a screenshot is the file. The two character MP4 files are not present under \`public/media/template-gallery/\` on this branch, so no live media links or working character cards are claimed yet. The draft [manifest](featured-demo-templates.json) intentionally leaves their video URLs \`null\`.

**Originals first:** watch each video as it is; any swap starts a **new derived version**, never changes the original. A still/image drop can be swapped immediately as a project reference; to change *content within the video*, create a new guided LTX render with paid submission only after explicit approval.

## 1. Mecha × Fruits — one card, two character versions

**Presentation:** the first two owner videos are A/B examples within the same card, both with **Dance with Fruits**. Keep the exact files, original duration, internal cuts and soundtrack. Their source files are requested for bundling; do not point the Gallery to an unbundled local or remote path.

**Card copy:** *A dancing mecha and morphing fruits, choreographed by the track. Keep the rhythm; bring your own dancer or fruit.*

**Viewer journey**

1. Preview the original **A** / **B** videos, including their existing music. No prompt is needed to watch.
2. **Make my version** opens the existing swap-only version panel. Offer **Character**, **Left fruit**, **Right fruit**, and optional **Look / stage** as simple drop slots, keeping the original as a reversible source.
3. Image-only swaps update the **references**, not the pixels of the original MP4. **Recreate in Camera** can produce a new aligned first still; it must not trigger a paid call automatically.
4. If the person chooses **Build new video**, hand an agent the original audio window, selected still(s), preset and frame-0 \`keyframes.json\` regions. The agent offers a visible plan, quote and explicit paid approval before edit/render. Result enters **Assets / Gallery** as a new version.

**Repeatable new-render route (not a claim about the existing originals):** the tested fruit pipeline can assemble **three 193-frame shots at 24 fps** (~24.125 s of three 8.0417 s windows) on the tripled *Dance with Fruits* loop. Its three-stage recipe is **mecha burst → fruit morph / Rubik → mecha returned or region-swapped**. Do not silently turn the A/B original videos into that montage; use this only if someone requests a fresh piece.

- Start with \`fruit-mecha\`, \`fruit-mecha-morph\`, or \`fruit-apple-banana\` from [the presets](presets/README.md).
- Capture 1024×576, 193 frames, \`--band-gain auto --motion-gain 1 --stage studio\`, release 12 (release 30 and smoothing 5 for slower morphs).
- Use the named \`robot\`, \`fruit-left\`, and \`fruit-right\` rectangles in \`keyframes.json\`, not invented bounding boxes. **Align the replacement still with frame 0**; a colour-changing morph may need a second still at its peak.
- Render with existing LTX-2.5 22B distilled + Layout-to-Render IC-LoRA graph, then review and add the track. Do not call it character-consistent video-to-video editing or a real-time swap: it is a new guided render.

## 2. Reactive Spaces — one existing spaces video

**Presentation:** use the real **Adaptive Reverb** video and its soundtrack, as bundled in the existing Gallery card; the owner's more recent spaces MP4 can take its place when delivered. Show the spaces **skyscrapers → cathedral → hall → booth** as chapters or annotations, **not** as invented or regenerated previews.

**Card copy:** *Skyscrapers contract, rooms breathe and the acoustics follow the architecture. Replace a space and let your agent build its geometry.*

**Viewer journey**

1. Play the original video **as-is**. Show four named spaces and the **Adaptive Reverb** soundtrack without silently editing the original.
2. **Make my version** provides a still/reference slot for each space, plus **Small / Original / Large** and room dimension controls. Preserve the 1.8 m mannequin scale as the reference.
3. When a **space image changes**, ask an agent to **reconstruct an editable Three.js guide** using the reference as a design target, not as a guaranteed metrically exact scan. Display and allow edits to the proposed geometry, camera, dimensions and acoustic zones. If the reference is insufficient, let the person approve or edit a primitive-room approximation.
4. **Rebuild guide** captures RGB, depth, start look and \`room-wet.wav\` from the new geometry, with the spatial dimensions driving the impulse response. A look-only/material edit may reuse geometry if camera and layout are unchanged; a structural/size edit must recapture and recompute acoustics.
5. **Make new video** passes the verified guide/look to the same LTX graph and requires the person's approval for every paid step. The rendered video and processed room audio become a **new** version in Assets / Gallery.

**Four-window capture reference** (for **new** ~32.167 s edits, not the 30.46 s finished Gallery cut):

| Section | Study | Audio-source start | Notes |
| --- | --- | --- | --- |
| Towers | \`towers-descent\` | 0.0000 s | Motion in the buildings; camera descends |
| Cathedral | \`cathedral-gallery\` or \`cathedral-gallery-grow\` | 8.0417 s | Walls slide or grow toward the centre |
| Hall | \`party-walls\` | 15.6916 s | Shifted to an open/quiet frame |
| Booth | \`studio-walls\` | 23.6083 s | Shifted to an open/quiet frame |

These are **source offsets**, not all the edit's cut times. Before stitching, align any shifted footage and \`room-wet.wav\` to the intended timeline: do not let the quiet-frame source shift introduce a music/reverb discontinuity. Keep the approved arrangement of the person's soundtrack. Use motion gain 1 and scene-native room size, not gain 2 saturation.

## One simple UI contract

\`\`\`text
Gallery
  ├─ Mecha × Fruits     [Watch A] [Watch B] [Make my version]
  └─ Adaptive Reverb    [Watch]              [Make my version]

Make my version → Swap references → Review result
                                 ├─ Use in current edit (source slot only)
                                 └─ Rebuild guide → Review → Quote/approve render → Assets
\`\`\`

Do **not** restore automatic generation to the swap-only **Make my version** dialog (PR #64). The **Recreate in Camera** control can take a person to the generator but must not pay or submit on navigation. Agent reconstruction is a deliberate step, not an automatic consequence of merely opening a card.

## Media hand-off and acceptance

- **Required:** the two original character video files, with their existing audio, and confirmation whether the pictured spaces video is the already-bundled Adaptive Reverb MP4 or a newer export. A screenshot alone does not carry an MP4.
- **Optional:** their first-frame stills, individual fruit/character assets, and four room reference images. **Do not substitute stock media** while waiting for these.
- Integrate existing media in \`public/media/template-gallery/\` **without altering originals**. Make optimized previews/posters from the *same video frames* only once those originals are available and their rights/credits are confirmed.
- Wire the two cards (one existing, one new) to \`shared/gallery/catalogue.ts\` and to the current Director/Editor copy and swap flow. Avoid duplicate Adaptive Reverb entries and keep agent/CLI project identities stable.
- Test A/B selection, sound retention, source provenance, missing-asset graceful states, keyboard/mobile accessibility, source swaps not triggering paid calls, project-copy isolation, one explicit agent rebuild, and approval gating of any LTX render.
- Verify format, lint, typecheck, tests, worker boundaries, build and a visual check before marking the PR ready.

**Implementation state:** this PR is a reviewable product/template draft. It does **not** ship new video files, source-aware image reconstruction, a new Gallery card, or working A/B controls. The existing clip is linked only where it is known to be bundled.