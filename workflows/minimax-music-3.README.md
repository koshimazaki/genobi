# minimax-music-3

The workflow behind **MiniMax Music 3 · Text to music** (registry entry
`minimax-music-3`, generator `audio`, route `workflow`, model
`workflow/minimax-music-3`). A caption, optional lyrics and a length go in;
one MP3 comes out and becomes a take.

In the Camera's family switch it is listed under **H3**, as one of the H3
models, not as a family of its own (owner's decision, 27 October 2026; music
may get a section of its own later). Choosing H3 still lands on H3's video
model; the hosted studio keeps H3 but leaves this local-only entry out.

## Source

Comfy's official template `audio_minimax_music_3` ("MiniMax Music 3: Text to
Music", template version 0.4, dated 13 August 2026), exported from Comfy Cloud
in editor format on 27 October 2026 and converted to API format the same day
by a script that reads each node's widget order from this account's Cloud
`/api/object_info`. Its one subgraph, "Text to Music (MiniMax Music 3)", is
flattened into nodes `37:*`, as the Comfy frontend names flattened nodes.
Every node the template holds is kept, with its values: the subgraph's inputs
(the three model files, tiled decode on) and its inner widgets (30 steps,
`euler`, `simple`, CFG 1.7, denoise 1, the encoder's `cfg_scale` 1.7 and
`top_k` 50, tile size 1536 and overlap 64, MP3 at `V0`).

| Node    | Change from the template                                                          |
| ------- | --------------------------------------------------------------------------------- |
| `39`    | Markdown note removed (the parameter table)                                       |
| `40`    | Markdown note removed (model links)                                               |
| `37:13` | Caption and lyrics replaced by placeholders (slots); the example song not shipped |
| `37:13` | `max_duration` is a slot; the template's 60 s is only the file's default          |
| `37:38` | `SeedNode` seed is a slot, a fresh value per run; the template's seed not kept    |

`SeedNode` drives both the encoder's seed and the sampler's, as in the
template. `EmptyMiniMaxMusic3LatentAudio` `37:15` takes its length from the
encoder's `seconds` output, and that link is kept on purpose (see the length
paragraph under Slots). `ComfySwitchNode` `37:43` keeps the template's tiled decode
(`VAEDecodeAudioTiled`); the template's note says turning it off gives the
best quality on a large GPU. That is a later, measured choice, not made here.
`SaveAudioAdvanced` `35` writes MP3 at `V0`; its dynamic `format` input is
sent in API form, `format: "mp3"` and `format.quality: "V0"`.

## Slots

| Slot           | Path                 | Value the studio sends                                     |
| -------------- | -------------------- | ---------------------------------------------------------- |
| `caption`      | `37:13.caption`      | The request's `description`, trimmed                       |
| `lyrics`       | `37:13.lyrics`       | The request's `lyrics`, trimmed; empty is sent empty       |
| `duration`     | `37:13.max_duration` | Whole seconds, 5 to 120 (the composer's Max length fader)  |
| `seed`         | `37:38.seed`         | A fresh random seed, so four runs are four different songs |
| `unet_name`    | `37:6.unet_name`     | Only on a local ComfyUI, from its model map                |
| `text_encoder` | `37:3.clip_name`     | The same                                                   |
| `vae`          | `37:7.vae_name`      | The same                                                   |

`max_duration` is a ceiling, not the song's length. In ComfyUI's source
(`comfy/ldm/minimax_music/ar.py`, read 30 October 2026) the encoder samples
acoustic frames until it emits `<|audio_end|>` or reaches the ceiling, and its
`seconds` output is the length it reached. The DiT (`dit.py`) zero-pads its
conditioning when the latent is longer than that, so writing a literal into
`37:15.seconds` would not lengthen the song; it would add a tail rendered
without conditioning. `37:15.seconds` therefore stays linked to the encoder,
and the composer labels the fader **Max** (**Max length** in its popover),
showing "≤N s". The
model has no duration input; whether fuller lyrics or a caption that names a
length make longer songs is untested. The take records the measured length. The
encoder accepts up to 360 s and the template's note says about five minutes
is supported; the studio keeps to 120 s (the encoder's default) until a run
has measured what a long song costs. The caption and lyrics caps (2,000 and
3,000 characters) are the studio's, not the model's. Whether an empty lyrics
field alone makes an instrumental is untested; the template's own lyrics use
an `[Instrumental]` tag for sections without singing.

## Output and the take

The job reads the file of node `35` (`WorkflowOutput {nodeId: "35", media:
"audio"}`; the SDK lists it as an output of type `audio`). The local server
saves it under the job id, measures it with the shared reader
(`inspectStoredAudio`, `shared/audio.ts`, by ranged reads) and names it
`.mp3`, `.wav` or `.flac` by the format its header proves
(`server/job-output.ts`). The stored measurement uses the shared reader, not
ffprobe, as every stored file does here (`server/media.ts`). A `V0` MP3 is
variable bitrate, and whether Cloud's file carries a Xing frame has not been
seen yet: when it states no frame count, the reader walks every frame header
and counts them, the exact length from the headers alone. The hand-in to a
project reads it the same way; uploads keep the stricter `inspectAudio`. A
paid song is never deleted or fetched again for want of a length: if no
header measures it, the take goes Ready as an MP3 with duration 0 (not
measured) and is still served.

A Ready song is an audio `Source` (`mediaType: "audio"`, `audio/mpeg`) in the
session, played with an `<audio>` element in the gallery and the main view.
**Add to project** in the gallery imports it into the open Director project as
a production audio asset; an agent hands it in with `genobi_take_to_project`.

The hosted Worker refuses music (`audio_local_only`, 501) before any quote or
reservation: its copy step stores MP4s and stills only.

## Price

Comfy Cloud publishes no per-run rate for this graph and reports no credits
per run. The estimate follows the H3 workflow's convention
(`shared/h3.ts`): an allowance of active GPU seconds at 0.266 credits per
second. No Music 3 run has been timed, so the allowance is H3's 240 seconds,
63.84 credits, about $0.30 per candidate at 210 credits to the dollar
(`shared/music.ts`). It is a budget estimate, not a measurement or a cap; the
first approved run's Cloud usage should replace it. Four candidates are four
quotes and four runs; there is no batch.

## Models

| File                                                          | Folder             |
| ------------------------------------------------------------- | ------------------ |
| `minimax_music3_dit_fp16.safetensors`                         | `diffusion_models` |
| `minimax_music3_text_encoder_pruned_int8_convrot.safetensors` | `text_encoders`    |
| `minimax_music3_dav.safetensors`                              | `vae`              |

These are the template's choices, and this account's Cloud `/api/object_info`
listed each of them on 27 October 2026 (with the int8 ConvRot and fp32 DiT and
the bf16 text encoder beside them). Every node class in the graph, and every
input name and combo value it sends, was checked against the same
`object_info`. No weights are redistributed here.

## Licence

The weights are governed by the **MiniMax-Music3 Community License**
([LICENSE](https://huggingface.co/MiniMaxAI/MiniMax-Music3/blob/main/LICENSE),
checked 27 October 2026). They arrive through the Comfy-Org repackaging,
[Comfy-Org/MiniMax-Music-3](https://huggingface.co/Comfy-Org/MiniMax-Music-3),
whose card's `apache-2.0` tag is the repackager's label, not the weights'
licence. The licence is an MIT-style grant with four conditions: keep the
copyright and permission notice; follow the law and the Acceptable Use Policy
(publicly posted machine-generated content disclosed as such; no military
use); a commercial product or service that uses it prominently displays
"MiniMax-Music3" in its interface, and needs written authorization from
api@minimax.io above US$20 million aggregate yearly revenue from such
products; a hosted service generating outputs keeps reasonable safeguards
against infringing uses. No territory is excluded. **Commercial use is
allowed under those conditions**, so the studio shows "MiniMax-Music3" in the
music composer, its foot and on every song it makes (registry `credit`). The
model is fine-tuned from Qwen3-8B (Apache-2.0), with the DiT from
stable-audio-tools (MIT) and the VAE from descript-audio-codec (MIT). See
[LICENCES.md](../LICENCES.md).

## Not proven

No Cloud or local submission was made and no song was generated: the graph,
slots and node names are checked structurally (`tests/music-workflow.test.ts`)
and the lifecycle runs against a fake Comfy Cloud
(`tests/server-music.test.ts`). The route is wired but unproven. The first
paid run needs the owner's go-ahead, and its result goes on the run card.
