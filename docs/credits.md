---
tags: [licences, bfl]
summary: Genobi’s shared tools, new studio work, creator credits and model documentation sources.
---

# Credits and lineage

## Design

The visual system uses graphite surfaces, compact instrument controls, Lime and
Cyberpunk signal palettes, and an output-first layout, adapting the author's
graphite instrument design vocabulary.

The header pairs the Genobi name with a friendly rounded mask; its expression
comes from the closed smiling eyes, without a mouth. Dual Swords uses an original
broad curved-swords symbol. The header is shown with reversed light/dark areas and a fine outline. Ninja uses the selected three-blade S1 shuriken. These marks are vector-traced from selected
image-generation concepts and rendered in the current interface colour.

## Lineage

Genobi brings the author’s creative tools into one studio and adds tools for
working on a shared human–agent project. Earlier projects remain part of its
history:

- [FLUX Studio Lite](https://github.com/koshimazaki/Flux-Studio-Lite), MIT,
  forked at `023477b`, supplied the initial studio foundation.
- [FLUX API Control Surface](https://github.com/koshimazaki/flux-api-control-surface)
  is the author’s earlier BFL workbench for image and video workflows. Shared
  interface and effect code retains its attribution.
- [ComfyUI-Koshi-Nodes](https://github.com/koshimazaki/ComfyUI-Koshi-Nodes)
  supplies the author’s AKUSPACE LoRA, room presets and reference workflows.

Genobi extends that work with a shared Director/Editor project, agent revision
and memory, voice directions, model-aware camera controls, World Builder,
scene-derived CPU reverb, music workflows, remixable templates and the Taste and
licence layers. The camera workflow now spans FLUX video, LTX, MiniMax H3 and
Klein image framing; its wording and supported controls differ by model.

The intention is one editable studio with a choice of models and agent harnesses.
The teaser and gallery use a range of production models; those examples do not
require every future project to use the same providers.

## Licence

Original Genobi code is MIT licensed; third-party components retain their own terms; see [`LICENSE`](https://github.com/koshimazaki/Genobi/blob/main/LICENSE).

That covers Genobi’s original application source. Model weights, generated
media, music, supplied assets and third-party components have separate terms.
Consult each example’s provenance and the licence inventory before reuse;
being included in a template or Taste collection does not transfer rights.

Every model, program, asset and npm dependency, with its terms, is listed in
[`LICENCES.md`](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md) and the generated
[`LICENCES-npm.md`](https://github.com/koshimazaki/Genobi/blob/main/LICENCES-npm.md).

## Attributions

- The dither waiting and reveal field is adapted from the author's FLUX API
  Control Surface, with its MIT attribution retained in
  [`src/effects/LICENSE`](https://github.com/koshimazaki/Genobi/blob/main/src/effects/LICENSE).
- Camera terminology links to Black Forest Labs' public guide; the editable
  wording, diagrams and examples here are this studio's own interpretation.
- No BFL logo or proprietary font files are included. Fonts are self-hosted
  open-font packages.

## BFL documentation this follows

The implementation follows Black Forest Labs' published documentation, checked
19 September 2026:

- [Generate a video with FLUX 3](https://docs.bfl.ai/api-reference/utility/generate-a-video-with-flux-3)
- [Video upscale, constraints and pricing](https://docs.bfl.ai/flux_tools/flux_video_upscale)
- [Camera prompting guide](https://docs.bfl.ai/guides/prompting_video_camera_terms)
- [Pricing](https://docs.bfl.ai/quick_start/pricing)
- [Credits endpoint](https://docs.bfl.ai/api-reference/get-the-users-credits)

The camera guide supplies the public terminology. The editable wording,
diagrams and examples here are this studio's own interpretation — see
[camera wording and sources](camera-wording.md) for that boundary.

## Model and acoustic sources

- [Comfy Router](https://docs.comfy.org): the queued request contract and the per-model schemas; checked against `router-openapi.yaml` on 10 October 2026.
- [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide) by Lightricks: the LTX camera language and prompt structure that `shared/camera.ts` follows.
- [Comfy partner-node pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing): the per-second LTX rates in `shared/comfy/ltx.ts`.
- [ComfyUI-Koshi-Nodes](https://github.com/koshimazaki/ComfyUI-Koshi-Nodes) (the author's node pack): `shared/akuspace-presets.json` is a verbatim copy of its AKUSPACE `nodes/audio/presets.json` (version 4, release 0.5), and `shared/acoustic.ts` ports its caption builder (`nodes/audio/conditioning.py`). The AKUSPACE LoRA and its reference workflows come from the same project.

The Acoustic Space preview retains the original AKUSPACE viewer’s `RoomScene` and display layout, including glass rooms, floor grids, source waves, outdoor atmosphere and dual-delay lanes, with studio theme colors and React lifecycle integration. Its listener uses the same figure geometry as Camera Control.

For MiniMax H3’s model-specific controls and their pinned guide sources, see
[MiniMax H3 camera wording](minimax-h3-camera.md). The distinction between
geometry-based CPU reverb and AKUSPACE’s learned room conditioning is documented
in [World Builder acoustics](world-builder-acoustics.md).

## The people behind our taste layer

Taste is a way to celebrate other people’s craft, keep the original links
visible and build a personal collection of creative references. Explore the
[hosted Taste page](https://genobi.pages.dev/taste), save your own selection and
references in the local studio, or extend the catalogue in a fork. Creators’
work and licences remain their own; inclusion does not imply endorsement.

[Explore the creator and library dossiers](credits/README.md): Transitions.dev,
Paper Shaders, Alien.js, Space.js, Three.js, Anime.js, p5.js, p5.brush, Claude
Animation Base, IBM Plex and Geist. Recommendations, implementation dependencies
and artistic inspiration are explicitly distinguished. Each library has an
original licence file; Paper also has its NOTICE.
