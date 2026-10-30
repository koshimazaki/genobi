---
tags: [verification, 3d, sound]
summary: The 30 October adaptive-reverb runs, connecting Three.js scenes, Klein stills, LTX Layout-to-Render and scene-derived CPU reverb; separate AKUSPACE experiments and remaining deployment gaps.
---

# Adaptive reverb: one scene guides picture and sound

## What ran on 30 October 2026

Agent-built Three.js scenes were captured with World Builder and used in
ComfyUI on a rented RTX PRO 6000 with 96 GB VRAM. Local FLUX 3 Image Klein
BF16 turned the take's first frame into a styled reference. LTX-2.5 with the
Layout-to-Render IC-LoRA generated video from that reference and the captured
camera/layout guidance. The same scene recipe supplied the room acoustics.

The run records report successful cathedral, party-room and studio shots.
The party and studio graphs also encoded the owner's music into LTX's audio
latent. A 2560 × 1408 party shot completed; the record reports about 87 GB
VRAM and 12.5 minutes. These are recorded results from that machine, not a
benchmark or a fresh run performed during this documentation update.

The final CPU comparison uses four Layout-to-Render clips. Other cuts use an
i2v vocalist ending, so they must not be described as entirely Layout-to-Render.
The music is the owner's original track.

## How the room becomes sound

Our custom ComfyUI nodes connect **World Builder Capture → Acoustics →
Reverb**. Capture supplies a scene recipe alongside image/video guidance;
Acoustics estimates the room; Reverb constructs its impulse response and
convolves an audio input with it on CPU.

- Room planes supply dimensions. Material words, or colour-based fallbacks,
  supply absorption estimates; interior objects contribute absorbing area.
- Sabine's formula estimates RT60. Early reflections use image sources in a
  simplified rectangular room; a decaying noise tail supplies late reverb.
- The same impulse responses can process a continuous track outside the graph,
  crossfading room treatments as the picture moves between spaces.

This is a creative acoustic approximation. It does not trace reflections or
occlusion around every object, reconstruct the generated image's geometry, or
guarantee physically accurate acoustics. The source scene guides both outputs.
See the node pack's [README](https://github.com/koshimazaki/Genobi/blob/main/custom_nodes/director_world_builder/README.md)
and its `acoustics.py` and `ir.py` implementations.

## CPU reverb and AKUSPACE are separate options

| Option                    | What was demonstrated                                          | Boundary                                                              |
| ------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- |
| CPU in the graph          | Scene-derived reverb on the music in the LTX graphs            | Selected for the clearest explanation of the room changes             |
| CPU across the full track | The same scene IRs, timed and crossfaded between spaces        | This mix step runs outside ComfyUI                                    |
| AKUSPACE LoRA             | Separate LTX i2v/audio experiments with room-conditioned sound | Partial audio regeneration can change the music as well as its reverb |
| Hybrid cut                | In-graph reverb followed by a clean studio ending              | The ending intentionally uses the original dry track                  |

AKUSPACE is our trained LTX acoustic-space LoRA. Do not attribute the CPU
demo's reverb to the LoRA. Stacking AKUSPACE with Layout-to-Render in one
generation graph was explicitly **not tried** in these records.

## Reproduction and release status

The source run bundle contains the successful API graphs, scene-building and
capture scripts, input takes, comparison cuts, and a worked/failed/not-tried
ledger. This update cross-checked its `README.md` and `WORKFLOWS.md` against
the node implementation and the agents' 30 October checkpoint.

Before presenting this as a downloadable recipe, include sanitized copies of
those final graphs, scene recipes, model requirements and input/output mapping
in the public release. The run bundle itself is not added by this documentation
change. Existing node examples alone are not the complete four-shot recipe.

The GPU runs establish the workflow outside Genobi's one-click studio route.
They do not verify a Comfy Cloud deployment, a Developer Platform deployment,
or automatic return to a linked Director project. Those remain separate
acceptance checks. The CPU-only recipe was also reported working in local
ComfyUI on macOS; local video execution still requires the LTX nodes and models.
