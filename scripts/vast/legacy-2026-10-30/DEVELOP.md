# What to develop, from this session

Ordered by how much each would have saved today.

1. **A moving listener in the Acoustics/Reverb node.** Today a room gives one
   impulse response for the whole take, and the change between spaces is
   faked by cross-fading separate IRs over time (`room-reverb.sh`). A node that
   takes the camera or avatar path from the recipe, computes the IR along it
   (or per room crossed) and convolves the track in time would make "the reverb
   follows the fall" a single graph. Inputs exist already: the recipe carries
   the path and the room objects.

2. **Wet level that means something.** The IRs the Acoustics node writes carry
   very little energy (mean -46 to -55 dB), so a straight convolution adds
   about 0.6 dB of tail and is inaudible; `room-reverb.sh` had to level each wet
   signal against the dry one. The Reverb node's `wet` should be energy-
   normalised (wet loudness relative to dry), so 0.35 or 0.8 sounds like that.

3. **Audio-to-video and Layout-to-Render in one graph.** The L2R graph is video
   only (no audio latent), so the track cannot drive the motion there. The i2v
   graph now takes the track through `LTXVAudioVAEEncode` and
   `LTXVSetAudioVideoMaskByTime` (`make-a2v.py`); the same two nodes belong in
   the L2R graph, before both samplers, so a layout take can move to the music.
   Ship it as a recipe (`apply`/`capture`), not hand-edited JSON.

4. **A crowd in the World Builder.** A recipe has one animated avatar and at
   most 24 primitives, so the party is 16 swaying cylinders. Several mannequins
   with their own clips (dance, idle, sway) would give Layout-to-Render real
   bodies to follow, and is what "lots of mannequins are the party" needs.

5. **Camera moves that do not need a character.** The skydive shot is a follow
   camera on the falling mannequin, so a "camera only" dive still carries a
   figure that Klein and the negative prompt must remove. A keyed free camera
   path (position and look-at per frame) would make empty-space dives clean,
   and avoid the world-space offset that put the studio camera behind a wall.

6. **A capture API for agents without a browser tab.** Takes were captured by
   running the repo's Playwright script against a local Vite server; agent
   pairing needs the owner's open World tab and a code. A headless
   `genobi world capture --recipe file.json` (or a box-side command) would let
   an agent build and capture scenes on the GPU box directly.

7. **A skill for this pipeline.** "Scene → take → Klein still → L2R → acoustics
   → reverb → cut" is now a repeatable recipe with known traps (mannequin in the
   layout, empty-room Klein prompts, IR levelling, a2v masks, chained last
   frames). A `genobi-adaptive-reverb` skill with the scripts here would let
   Hermes or Claude run it end to end.

8. **Comfy's t2v template.** `ltx-2-5-t2v.json` carries a prompt-enhancer branch
   that needs `gemma4_e2b_it_int8_convrot`, which no model set downloads; the
   graph fails validation unless that branch is removed. Either download it in
   the AKUSPACE set or ship the repo graph without the enhancer.