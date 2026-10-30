---
tags: [3d, world-builder, comfy, sound]
summary: World Builder's room acoustics estimate (Sabine RT60 to AKUSPACE presets) and the Reverb node's DSP route.
---

# World Builder acoustics

Part of [World Builder and Scene Adapter](world-builder.md).

## Acoustics

**World Builder · Acoustics** reads a recipe and names the AKUSPACE treatment
for its room. The room is the bounding box of the objects whose ids start with
`room-` (the Small room, Acoustic room, Club and Cathedral presets build one).
Open-front, open-top sets are camera cutaways: a missing ceiling or wall takes
the walls' mean absorption. A recipe with no `room-` set is open sky.

RT60 is Sabine's `0.161 · V / Σ αᵢSᵢ` over floor, ceiling and walls, plus any
other primitive inside the room (its box surface area). α comes from the first
material word in a surface's prompt, otherwise from its colour:

| Material                 | α    | Material | α    |
| ------------------------ | ---- | -------- | ---- |
| marble                   | 0.01 | plaster  | 0.06 |
| concrete, tile           | 0.02 | metal    | 0.06 |
| stone                    | 0.03 | wood     | 0.10 |
| brick, glass             | 0.04 | carpet   | 0.30 |
| colour light (lum ≥ 0.5) | 0.05 | pews     | 0.40 |
| colour mid               | 0.10 | curtain  | 0.50 |
| colour dark (lum < 0.15) | 0.20 | foam     | 0.80 |

The bands follow the decay each AKUSPACE preset was trained on (small 0.67 s,
club 1.2 s, medium 1.9 s, cathedral 4.8 s), so the club band sits below the
medium room's:

| RT60 (s)  | Preset                                           | Level                                 |
| --------- | ------------------------------------------------ | ------------------------------------- |
| < 0.3     | `dry`                                            | ignored by AKUSPACE                   |
| 0.3–0.95  | `small_room`                                     | low / mid / high by third of the band |
| 0.95–1.55 | `empty_club`                                     | as above                              |
| 1.55–3.0  | `medium_room`                                    | as above                              |
| ≥ 3.0     | `cathedral`                                      | thirds of 3.0–8.0 s                   |
| open sky  | `outdoor_day`, or `outdoor_night` when light < 1 | `low`                                 |

The four room presets and `custom_nodes/director_world_builder/examples/rooms/`
snap to their namesakes: small 0.7 s, medium 1.8 s, club 1.3 s, cathedral
5.2 s. Sizes, materials and the table live in that directory's
`acoustics.json`, which Director's presets read too. The outputs
`space_mode`, `application` and `room_preset` are typed as
Koshi_AKUSPACEPrompt's combo lists for linking onto its widgets; that link has
not been exercised in a running Comfy graph.

## Reverb (DSP route)

The same room feeds two routes. The AKUSPACE LoRA learned its rooms from
recordings and generates the space inside LTX as the shot is made; Acoustics
names the preset it should use. **World Builder · Reverb** computes a room
response from the recipe's geometry on the CPU and convolves it onto any AUDIO,
so a take's existing sound can sit in the room that was built. Wire Capture's
`audio` and `recipe` into it, or any AUDIO with a recipe string.

- **Room:** the shoebox, per-surface absorption and Sabine RT60 that Acoustics
  measures (`estimate` in `acoustics.py`). `size_scale` scales the box and RT60
  with it; `decay_scale` scales RT60; `material_override` puts one material from
  `acoustics.json` on every surface, keeping furniture absorption.
- **Early reflections:** image sources to order 3, delay at 343 m/s, 1/r
  spreading, `sqrt(1 − α)` per bounce, a broadband air loss, rounded to the
  nearest sample. Time zero is the direct sound's arrival; the direct sound is
  the dry path. Open sky gets the floor reflection and a 0.4 s diffuse tail.
- **Late tail:** seeded Gaussian noise under the RT60 decay, ramped in over
  20 ms up to the last early reflection. A one-pole low-pass magnitude, applied
  per STFT frame, drops its cutoff over time by `damping_high`, so highs die
  first. `early_late_balance` splits the energy (0 early only, 1 tail only);
  the IR has unit energy.
- **Mix:** block FFT convolution (torch, numpy fallback), `pre_delay_ms`, `wet`,
  `dry`, `output_gain_db`. When the peak would pass 0.99 the output is
  peak-normalised and `summary` says so. The IR is capped at
  `max_ir_seconds` (default 6) and ends with a 50 ms fade.

Outputs are the mix (same rate, channels and length as the input), the mono IR
at the input rate (for SaveAudio, or as a file for Space in
[media space](media-space.md)) and a one-line summary such as
`cathedral · 12×30×18 m · RT60 5.2 s · IR 6.0 s`. Positions are recipe world
metres (`x,y,z`, y up), clamped inside the room; by default the listener is at
the room centre 1.6 m up and the source 2 m along +z. A 60 s stereo 48 kHz
input renders in well under a second on a laptop CPU. It is a shoebox model:
rooms are their bounding box, there is no per-band wall absorption and no
diffraction. Not yet run inside a live ComfyUI graph or judged by ear.
