# Whole-track room reverb

`room-reverb.sh` is the CPU script from the successful 30 October 2026 session,
with input validation and quoted file arguments added for reuse. It convolves
the whole track with each World Builder scene's impulse response (IR), levels
each wet signal against the dry track, and fades it in during that room's
window. No model, key, server or paid submission is involved.

## Inputs

Requires FFmpeg with `afir`, `volumedetect`, `amix`, `alimiter` and `loudnorm`,
plus `bc` and standard shell utilities. Supply your own track and IR files
saved by the L2R graphs' Acoustics → Reverb branch. Use `dry` for open air.
One positive duration in seconds is required per room; `start` offsets the
track, and window times start at zero after that offset.

```sh
sh workflows/room-reverb.sh track.wav 0 5.8,10.3,8,8.3 room-mix.wav dry cathedral-ir.flac medium-room-ir.flac small-room-ir.flac
```

These durations illustrate the earlier four-room cut; replace them for your
edit. Party uses a medium-room IR; studio uses its small-room IR. The named
`cathedral`, `medium_room`, `small_room`, `party` and `studio` workflow inputs
are mapped in the [endpoint catalogue](ltx-world-builder.endpoints.json).

Environment controls: `WET=-2` dB relative to dry, `DRY=0.6` linear gain,
`RAMP=0.6` seconds. A 1-second ramp was used for the later whole-track cut.
Temporary processing is stereo at 48 kHz, with six seconds of extra source
for tails. Output is trimmed to the sum of the windows, limited at 0.9,
then loudness-normalised to −14 LUFS / −1.5 dBTP. Allow enough input audio
for the requested windows. The script overwrites the specified output file.

## Run evidence, 30 October 2026

WORKFLOWS.md lists the whole-track script as **Worked**: room changes became
audible once the wet signals were levelled to the dry. It was used for the
continuous-track cuts; the source notes describe this route as giving the
smoothest transitions. That is session evidence, not a new listening test.

## Known limits and fixes

The raw IRs had mean energy of −46 to −55 dB; an unlevelled wet mix was barely
audible. This script compensates for that. It uses one static IR per scene
and crossfades between them; it does not compute a listener moving through
geometry. Long tails still fade with their room's window and are trimmed at
the final output duration. Silent dry audio or silent IRs are rejected rather
than producing an unbounded gain. Capture, Storyboard and Inputs fixes apply
when creating the IRs through an L2R graph, not when running this script.

## How to repeat it

Save the IRs from [the L2R templates](ltx-world-builder.README.md), set the
window durations to your edit, run the script, then listen against the dry
track before muxing. It preserves the source music rather than resynthesising
it through the LTX audio VAE or AKUSPACE.
