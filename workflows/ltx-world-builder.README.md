# Worked LTX / World Builder templates

These API graphs preserve the successful 30 October 2026 GPU workflows as
reusable inputs. They are separate from the earlier UI-format World Builder
graphs and the studio's registered workflow slots. They require a prepared
ComfyUI or the proposed `genobi-ltx-world` Developer Platform deployment.

Every graph has its own README with inputs, model filenames, results, fixes
and limits. The [endpoint catalogue](ltx-world-builder.endpoints.json) maps
stable names to files. These are workflow selectors on one deployment's job
API, not separate provisioned URLs or a new Genobi server route.

## Fill a template

Every `__TOKEN__` is an entire literal value. Replace it with the matching
JSON type: seeds are numbers; recipe_json is a string containing the complete
capture recipe. No capture, owner-supplied still or music is bundled here.
Filenames are relative to ComfyUI's `input/`; output prefixes are relative
to its output directory. Never submit an unfilled template.

`materialize-ltx.py` only writes JSON; it never queues or spends. For example,
prepare the values for the `party` endpoint using your matching capture:

```sh
python3 - <<'PY'
import json
from pathlib import Path
values = {
    "PROMPT": "A continuous downward camera dive into a sunlit party room; hands empty, camera moving through the crowd.",
    "NEGATIVE_PROMPT": "cuts, shot changes, mannequin, yellow figure, drinks, colour blobs, frozen people, captions, watermark",
    "RECIPE_JSON": Path("take-recipe.json").read_text(),
    "TAKE_WEBM": "take.webm",
    "DEPTH_WEBM": "depth.webm",
    "REFERENCE_PNG": "reference.png",
    "TRACK_AUDIO": "track-slice.wav",
    "SEED_STAGE_1": 0,
    "SEED_STAGE_2": 0,
    "REVERB_SEED": 0,
    "IR_PREFIX": "audio/party-ir",
    "WET_PREFIX": "audio/party-wet",
    "VIDEO_PREFIX": "video/party"
}
Path("values.json").write_text(json.dumps(values))
PY
python3 workflows/materialize-ltx.py --endpoint party --values values.json --output /tmp/party.api.json
```

Use the exact placeholder list in each README; missing and extra keys fail.
Choose your own seeds; identical seeds between stages remain possible, as in
the original L2R graphs. The materializer creates output exclusively and will
refuse to overwrite it. Upload all named media before a local queue or include
them in the Developer Platform run's asset root. Asset upload/path resolution
on the platform still needs the owner's test; see the [deploy plan](../docs/comfy-deploy.md).

## What the families preserve

| Family                     | Picture                                                                                  | Sound                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| World Builder L2R          | BF16 LTX-2.5, Layout-to-Render IC-LoRA, colour take + look still, two stages, ×2 upscale | Original track through the scene's CPU Reverb; IR and wet mix saved                                    |
| World Builder L2R + a2v    | Same, plus track in both samplers' audio latent with a zero noise mask                   | Same CPU Reverb; no AKUSPACE LoRA in these graphs                                                      |
| i2v + a2v                  | int8 LTX-2.5, still + encoded track, masks in both stages                                | CPU option: audio mask 0, space Off; AKUSPACE option: audio mask 0.5, Room / small_room / Heavy / high |
| i2v dives / chain          | int8 LTX-2.5, still → two-stage sampler                                                  | Generated audio; reference alignment scale 0; apply scene IRs separately                               |
| Text-only fall / narration | int8 LTX-2.5, image branches bypassed, 15 seconds                                        | Generated audio and speech, no enhancer branch                                                         |
| Whole-track script         | Existing picture                                                                         | Original track convolved with each scene IR and levelled across room windows                           |

The i2v CPU option does not contain a Reverb node. “CPU” describes the
external room treatment in the source experiment. Decoding an unchanged
audio latent through LTX's audio VAE can alter phase; keeping the original
track in the final mux avoids that. AKUSPACE at audio mask 0.5 changes the
music as well as its room sound.

## Chained fall

The three chain graphs are self-contained stages after uploading an image.
Start with the dive output; use its final frame for `chain_cathedral`, then
that output's final frame for `chain_party`, then for `chain_studio`.
Extract the actual final frame from the preceding result, for example:

```sh
ffmpeg -v error -i previous.mp4 -vf reverse -frames:v 1 next-first.png
```

For these short clips, `reverse` is a simple exact-last-frame extraction but
buffers decoded frames. Each stage needs its own owner-approved generation;
there is no automatic submission script and no retry on uncertain outcomes.
The observed chain delayed the vocalist until the final second.

## Evidence and limits

The per-workflow results are transcribed from the supplied session's
WORKFLOWS.md **Worked** table, with cut details from its README. They describe
a rented RTX PRO 6000 (96 GB) on ComfyUI 0.41.0, not a new run here or proof of
a Developer Platform deployment. Replacement inputs and seeds change results.

Keep the successful sampling and widget values. In particular, keep the L2R
Storyboard cells at **448 × 256**, its guides on multiples of 64, and its
193-frame, 24 fps timing. The original 1.25 GiB Capture limit rejected the
1024 × 576 take; the node and build patch now allow 2 GiB. Inputs downscales
large return previews instead of rejecting them, leaving model output intact.

Untried: L2R + AKUSPACE, cathedral a2v, audio-mask strengths 0.3 / 0.7, Union
Control instead of L2R, multi-avatar crowds and final-cut SeedVR2 upscale.
The dedicated build omits Union Control, SeedVR2, Klein and the Gemma e2b
enhancer: still creation is an external input step, and none of these graph
loaders uses those weights.
