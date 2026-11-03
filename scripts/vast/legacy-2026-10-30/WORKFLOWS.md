# Which workflow worked

Every graph is in `workflows/` (and the full set in `box-home/jobs/`), as the
API JSON that actually ran. Drop one into ComfyUI to inspect it. Builders:
`make-l2r-a2v.py`, `make-a2v.py`, `make-dive-scenes.py`, `chain-v2.py`,
`room-reverb.sh`.

## Worked

| Workflow | Graph | Result |
|---|---|---|
| Layout-to-Render dive, no person | `l2r3-dive-empty` | Clean dive between towers into the cathedral; empty Klein ref removes the mannequin |
| L2R cathedral with a top-down ref | `l2r7-cathedral` | Dives between the columns onto the altar (needs the ref at the take's angle) |
| **L2R + track in the audio latent, 2560×1408** | `l2r8-party-a2v` | Owner: the shot is good, frozen-in-time crowd, camera dives; no OOM (87 GB, 12.5 min) |
| **L2R + audio latent, no drinks / wooden studio** | `l2r9-party-a2v`, `l2r9-studio-a2v` | Final party and vocalist (she turns and smiles); v5 cuts |
| L2R party, studio (base res) | `l2r5-party`, `l2r5-studio` | Party dive works (crowd frozen); studio sinks behind the vocalist |
| i2v + track in the audio latent (cpu and akuspace) | `a2v-vocalist-*` | Wooden studio; she turns and smiles; same picture in both |
| i2v dives from empty Klein stills | `dive3-*` | Cathedral, big room, small room |
| i2v rave and vocalist | `dive4-party`, `dive4-vocalist` | v4a party cut |
| Chained continuous fall (last frame → next) | `chain2..4` | v4b; vocalist only in the last second |
| Whole-track reverb in time from the scenes' IRs | `room-reverb.sh` | Audible once the wet is levelled to the dry |
| In-graph Reverb on the track | every `l2r*` (`-wet.flac`) | The workflow's own room sound per clip |
| Text-only falls, narration | `fall15-*`, `vo-female-*` | 15 s falls; full narration read in 14.6 s |

## Did not work, or only partly

| Workflow | Why |
|---|---|
| `l2r5-cathedral` | The Klein ref was eye-level, so L2R followed the ref's camera: static shot |
| `a2v-party-cpu` / `-akuspace` | People stand and mingle: a ref of people standing still beats the audio |
| `l2r8-party-a2v` details | Cocktails in hands; cylinder colours leak as blobs in the last frames |
| `l2r2-skydive-belly` pose | The 3D take's camera hides the head; L2R copies the folded pose |
| `ltx-2-5-t2v.json` as shipped | Fails validation without the Gemma e2b enhancer model; branch removed |
| The Reverb node's `wet` | IRs carry little energy (-46 to -55 dB mean): wet barely audible unless levelled |

## Not tried yet

| Combination | What it needs |
|---|---|
| L2R + AKUSPACE LoRA (room sound from the model on a layout video) | Stack the AKUSPACE LoRA and its text encoder into the L2R graph, audio mask ~0.5 |
| AKUSPACE strength sweep (audio mask 0.3 / 0.7) | Only 0.5 was tried; the spectrogram change at 0.5 is small |
| L2R + a2v for the cathedral | Not needed for an empty space; would show whether the track shapes camera motion |
| Several mannequins as the crowd | Not supported: one avatar per recipe (DEVELOP.md 4) |
| Union Control (depth/canny) instead of Layout-to-Render | `world-builder-canny-depth.json`, with the 448×256 storyboard fix |
| SeedVR2 upscale of the final cut | Models are on the box; 3B int8 first |
| Comfy Deploy of the L2R+a2v and i2v+a2v workflows | A comfy-build release of this environment first (see `pack/`) |