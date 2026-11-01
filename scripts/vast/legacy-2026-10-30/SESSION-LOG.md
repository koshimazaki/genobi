# Adaptive reverb: falling through generated spaces

Vast session 2, 30 October 2026 (afternoon). One RTX PRO 6000 (96 GB), ComfyUI
0.41.0 with ComfyUI-LTXVideo, Koshi-Nodes (AKUSPACE) and our World Builder node
(`director_world_builder`, camera-director main `db4f0c17` plus two node fixes,
see `pack/REPO_COMMIT`). Every job, error and decision is in the box's
`/workspace/LOG.md`, copied into `out/` at the end.

**The use case.** The camera falls through spaces that agents built in Three.js
inside ComfyUI (the World Builder). The 3D take gives the video its layout
(LTX-2.5 Layout-to-Render IC-LoRA), FLUX 3 Image Klein gives it the look (a
still made from the take's first frame), and the same scene gives the sound its
room: the Acoustics node computes the room's impulse response from the scene's
walls and objects, and the Reverb node runs the owner's track through it. Each
space sounds like the space it shows.

Track: owner-local `Adaptive Reverbv2.mp3` (32.4 s; audio is not committed).

## What generated what

| Model / node | Role |
|---|---|
| World Builder (Three.js, our node) | The 3D scenes and their takes: colour + depth video, first frame, recipe |
| DirectorSceneCapture → Acoustics → Reverb (our nodes, CPU) | Room impulse response from the scene; the track through it, in the graph |
| FLUX 3 Image Klein bf16 (local) | Stills: the take's 3D frame turned into a photo, mannequin removed or people added |
| LTX-2.5 22B + Layout-to-Render IC-LoRA (bf16) | Video that follows the take's camera and layout, styled by the Klein still |
| LTX-2.5 22B int8 + AKUSPACE LoRA (i2v graph) | Image-to-video dives; audio-to-video (track in the audio latent); AKUSPACE room audio |
| LTX-2.5 22B t2v | The 15 s text-only falls and the female narration |
| `room-reverb.sh` (ffmpeg, CPU) | Whole-track processing in time: each room's IR faded in for its window |
| Whisper small.en | Checking the narration's words (Whisper hears "Three.js" as "3DS") |

## The cuts, in order made

| File | Picture | Sound |
|---|---|---|
| `out/talk2-rooms-v2.mp4` | Talking beats (LTX i2v from Klein stills), owner's workflow lines | LTX speech, AKUSPACE Heavy/high per room |
| `cut-v2/fall-rooms-v2.mp4` | 15 s t2v fall (`fall15-voice-s2`) | LTX female narration, dry, through `room-reverb.sh` (dry/cathedral/medium/small on the pauses) |
| `cut-v3/adaptive-reverb-v3.mp4` | Clip 1 L2R dive (no person) + three i2v dives into empty rooms | Track through `room-reverb.sh` (dry 0-5.8, cathedral to 16.1, medium to 24.1, small) |
| `cut-v3/clip1-in-workflow-reverb.mp4` | Clip 1 only | **In-graph**: track 0-8 s through the World Builder Reverb of the skydive scene |
| `cut-v4/v4a-party-cuts.mp4` | Dive, cathedral, i2v rave (hands up), vocalist (foam booth) | Track through `room-reverb.sh` |
| `cut-v4/v4b-continuous-fall.mp4` | One fall: each clip i2v from the last frame of the one before | Track through `room-reverb.sh` |

Each cut has a dry twin or its source clips beside it for comparison.

## The 3D scenes (built this session)

`make-dive-scenes.py` writes three World Builder recipes, captured headlessly
with the repo's `scripts/capture-move-library.mjs` (SwiftShader, local, free);
the takes are in `takes/`.

| Scene | Layout | Acoustic room |
|---|---|---|
| `dive-cathedral` | Cathedral walls, two rows of 5 stone columns, 4 pew blocks, an altar | cathedral (the Acoustics node reads the walls and objects) |
| `dive-party-room` | The medium room, 16 dancers (cylinders swaying on small orbits), a DJ table | medium room |
| `dive-studio` | The small room, mirrored so the camera enters from the open side; a vocalist and a mic stand | small room |

The camera is the skydive follow shot on a face-down falling mannequin; Klein
and the negative prompt remove him from the picture.

## The two audio workflows (the owner's test)

`make-a2v.py` builds both from the AKUSPACE i2v graph, per shot (party, vocalist):

- **cpu**: the track slice is encoded into LTX's audio latent and masked
  (`LTXVSetAudioVideoMaskByTime`, audio mask 0), so the video is generated
  against the real music and the crowd moves to it. The audio stays the
  track; the room reverb is added on CPU from the World Builder IRs.
- **akuspace**: the same, with the audio mask at 0.5 and AKUSPACE set to the
  room (`space_mode Room`, medium or small room, Heavy, high), so LTX
  regenerates the track partway with the room's acoustics from the model.

Results and the A/B are added below when they land.

## What to develop next

See `DEVELOP.md`.

## Final cuts (v5), `cut-v5/`

Picture for all three: the four Layout-to-Render clips, each from a World Builder
scene captured this session, styled by a Klein still at the take's angle.

| Clip | Graph | Scene | Ref | Notes |
|---|---|---|---|---|
| 1 | `l2r3-dive-empty` | skydive-cathedral | `klein3-skydive-empty` | towers → through the roof |
| 2 | `l2r7-cathedral` | dive-cathedral (columns, pews, altar) | `klein7-dive-cathedral` (top-down) | dives onto the altar |
| 3 | `l2r9-party-a2v` | dive-party-room (16 swaying stand-ins) | `klein9-dive-party` (no drinks) | **track in the audio latent**, 2560×1408 |
| 4 | `l2r9-studio-a2v` | dive-studio (mirrored, vocalist + mic) | `klein9-dive-studio` (wooden room) | **track in the audio latent**; she turns and smiles |

| File | Sound |
|---|---|
| `adaptive-reverb-v5-cpu.mp4` (30.6 s, party trimmed at 6.5 s before the stand-in blobs) | Owner's track through **each scene's own IR** (the IRs these four graphs computed), `room-reverb.sh`, dry until 5.8 s, 1 s crossfades |
| `adaptive-reverb-v5-in-graph.mp4` (32 s) | **Only the workflow's sound**: each graph's in-graph Reverb output (`-wet.flac`) for its track slice, butted with 50 ms crossfades |
| `adaptive-reverb-v5-akuspace.mp4` (32 s) | Clips 1–3 in-graph Reverb; clip 4 is the i2v vocalist (`a2v-vocalist-akuspace`) with **LTX + AKUSPACE room audio** (audio mask 0.5, small room, Heavy) |

The LTX audio VAE resynthesises sound (phase changes), so cuts use the
original track wherever the audio was meant to be kept.

Which graphs worked and which were not tried: `WORKFLOWS.md`.
What to build next: `DEVELOP.md`.

## v6, the owner's pick (`cut-v5/adaptive-reverb-v6.mp4`, 28.6 s)

The owner's verdict on v5: the AKUSPACE cut ("Echo Space") was the best, but
the joins were not clean, and the studio ending's audio had been changed by
AKUSPACE (audio mask 0.5 regenerates half the latent, so the music itself
changes, not only the room). v6 fixes both:

- **Picture:** clips 1 (`l2r3-dive-empty`), 2 (`l2r7-cathedral`), 3
  (`l2r9-party-a2v`, cut at 6.0 s before the stand-in colour blobs) and 4
  (`a2v-vocalist-akuspace`, i2v, she turns and smiles), joined with 0.5 s
  dissolves (`xfade`).
- **Sound:** the workflow's in-graph Reverb for clips 1–3 (each graph's
  `-wet.flac` on its track slice), then the studio runs the original track
  **clean** from where the party slice stops (16.08 + 6.0 s), so the music
  never jumps; 0.5 s `acrossfade` at each join; loudness -14 LUFS.
- `adaptive-reverb-v5-akuspace-smooth.mp4` is the same with the full-length
  party and the AKUSPACE studio audio, for comparison.

Next, by the owner: run it through Genobi for interface overlays, slices and
glitches; then the two workflows on Comfy Deploy.

**Decision (owner, 30 Oct):** for Comfy Deploy and the showcase, keep the CPU
path: Layout-to-Render + the track in the audio latent + our in-graph Reverb
(`l2r9-party-a2v`, `l2r9-studio-a2v`, `l2r7-cathedral`), because its effect is
the easiest to hear and explain. **Keep all options**: the AKUSPACE path
(`a2v-*-akuspace`, LTX + the AKUSPACE LoRA regenerating the audio in the room)
gave the **nicest reverb** to the owner's ear, and the in-graph and script
versions stay as the third and fourth options. All four are documented above
and their graphs are in `workflows/`.

| Option | Reverb from | Owner's note |
|---|---|---|
| CPU, in-graph | World Builder Acoustics → Reverb in each L2R graph | easiest to tell, deploy first |
| CPU, script | the same scene IRs, `room-reverb.sh` across the whole track | smoothest transitions |
| AKUSPACE | LTX-2.5 + AKUSPACE LoRA, audio mask 0.5, room preset per space | the nicest reverb; changes the music a little |
| v6 hybrid | in-graph Reverb, then the studio clean | the cut to take into Genobi |