# CPU adaptive reverb from a World Builder scene

## What it makes

`world-builder-adaptive-reverb-cpu.json` is LoadAudio + recipe text → Acoustics
and Reverb → SaveAudio (wet mix and impulse response). It runs on a CPU/Mac
in seconds for the recorded short room clips. It decodes no capture video and
loads no GPU model. Acoustics previews the scene measurement; Reverb computes
its IR from the same recipe.

## Inputs and placeholders

Use local endpoint `cpu-reverb` with the [offline materializer](README.md#fill-a-key-workflow),
or the sanitized builder adapted from `make-cpu-reverb.py`:

```sh
python3 workflows/make-cpu-reverb.py --recipe scene.json --audio track.wav --prefix audio/room --seed 0 --output /tmp/room.api.json
```

`scene.json` may be a v1 World Builder recipe or a receipt containing `recipe`.
`track.wav` must already be uploaded into your local ComfyUI's input folder.
The builder only writes JSON; queue it yourself on that local CPU install.

| Token (surrounded by `__`) | Input                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `RECIPE_JSON`              | Complete v1 scene recipe as a JSON string, with room objects/materials; capture dimensions are not required |
| `TRACK_AUDIO`              | Relative uploaded audio filename                                                                            |
| `REVERB_SEED`              | Unsigned 32-bit JSON integer                                                                                |
| `IR_PREFIX`, `WET_PREFIX`  | Relative output prefixes                                                                                    |

## Models

None. Install this repository's `director_world_builder` in local ComfyUI;
numpy, torch and Pillow are supplied by ComfyUI. No LTX or Koshi pack is needed.
The graph keeps the CPU template's settings: decay scale 1, wet 0.8, dry 0.7,
maximum IR 6 seconds. Output keeps the track's sample rate, channels and length.

## Recorded result

The source CPU template ran locally on a Mac on 30 October 2026, producing
cathedral, crowded-hall and small-studio wet mixes and IRs in seconds. The
scene-derived CPU route supplied the adaptive-reverb v5 comparison; the
[whole-track helper](room-reverb.README.md) levels and crossfades those room
responses. This template contains no private recipe, recording or media.

## Limits

One shoebox room, static source/listener and one IR per run. Room size dominates;
objects add absorption but do not reflect or occlude sound. This is a synthetic
approximation, not a measured acoustic simulation or AKUSPACE. Quiet IRs can
need wet-level matching. Processing truncates the tail to the input length;
add silence yourself if needed. Longer tracks take longer than the short demo.
