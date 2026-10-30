---
tags: [sound, workflows, backend, mcp]
summary: Space, a local media tool that puts an AKUSPACE room on a clip's existing sound in timed segments by ffmpeg convolution — the presets, the filter graph, the ffmpeg 6 and 7 afir difference, limits, how it relates to the AKUSPACE LoRA, and what was run.
---

# Space: a room on a clip's sound

Space is one of the local media tools, beside trim, concat and crossfade
([local media tools](architecture.md#local-media-tools)). It puts an AKUSPACE
room on audio that already exists, in timed segments, with ffmpeg on this
machine. It is never paid, and it never calls Comfy, Router or BFL.

It is the CPU counterpart of the AKUSPACE LoRA
([Acoustic Space](camera-wording.md#acoustic-space-akuspace)). The LoRA
generates the room inside LTX-2.5 as it makes the shot. Space processes sound
that is already there: a take, an upload or an earlier media result. A Docker
image for running the LoRA in a local ComfyUI is separate work (PR #108).
Part of #13 and of the "AKUSPACE on a segment" box of #18.

## Request

`POST /api/media/space` (local server only), or `genobi_media_space` for agents
(`mcp/media-tools.ts`, taught by `genobi-swords`):

```json
{
  "sourceId": "<a video or audio source of this session>",
  "segments": [
    { "start": 0, "end": 8, "preset": "small_room", "level": "low" },
    { "start": 8, "end": 16, "preset": "cathedral", "level": "high" }
  ],
  "snap": "bar",
  "grid": { "bpm": 98.2, "beatOffsetSeconds": 1.3, "beatsPerBar": 4 }
}
```

- One to 16 segments, in order, not overlapping, inside the clip, each at
  least 0.1 seconds (`validateSpace`, `shared/space.ts`).
- `level` is `low`, `mid` (the default) or `high`.
- `snap` (`beat` or `bar`) moves each edge to the nearest line of the
  composition grid (`snapSegments`, using `gridFrame` from
  `shared/director/beat-grid.ts`), then the segments are checked again.
  `grid` takes `genobi_audio_analysis`'s `composition` and is held to the
  Director's `set-beat-grid` bounds. Fields left out take the timeline's
  defaults: 120 BPM, 4 beats a bar, a downbeat at 0.

The answer is a new derived source (`label: "Space of …"`); the source is not
changed. A video keeps its picture stream copied as it is (`-c:v copy`) and
gains the treated sound as AAC; an audio clip comes back as 48 kHz stereo
16-bit WAV. The usual caps hold: two minutes of video, twenty of audio, 250 MB
with `-fs`. A video without sound is refused.

## Rooms

The presets are the room presets of `shared/akuspace-presets.json`, read from
that file, so the names match the LoRA's:

| `preset`      | RT60   | Lowpass | Where the decay comes from                  |
| ------------- | ------ | ------- | ------------------------------------------- |
| `small_room`  | 0.67 s | 9 kHz   | the trained caption ("0.67-second")         |
| `empty_club`  | 1.2 s  | 5 kHz   | the trained caption ("1.2-second")          |
| `medium_room` | 1.9 s  | 7 kHz   | the trained caption ("1.9-second")          |
| `cathedral`   | 4.8 s  | 6 kHz   | the node pack's `estimated_rt60`; no number |

Each RT60 is the preset's `estimated_rt60`, which equals the caption's figure
for the first three; the cathedral caption says only "a long decaying tail".
The lowpass values follow the descriptions ("bright", "filtered") and are this
tool's choice, not the node pack's. Levels set the wet gain from the presets'
`relative_db`: −25 dB (`low`), −12 dB (`mid`) and 0 dB (`high`), against the
dry signal.

Refused, with a message saying why: `outdoor_day` and `outdoor_night` (open-air
ambience, birdsong or crickets and cars, not a reverb), `dual_delay` (a delay
effect) and `dry` (no room). Only the LoRA has those.

## The filter graph

`ffmpegArgs.space` (`server/ffmpeg.ts`) builds one `-filter_complex` from the
validated segments and `roomResponse` (`shared/space.ts`), which describes each
room as data: decaying stereo noise `A × u × e^(−6.9078·t/RT60)` for 1.2 × RT60
(to −72 dB), each channel from its own seed, then a two-pole lowpass. `A`
gives the filtered response about unit energy, so `relative_db` is the wet
power against the dry. The same data can later make a Web Audio buffer for a
browser preview.

1. The source's first audio stream is set to 48 kHz stereo and split: one dry
   copy, and one copy per segment.
2. Each segment: `atrim` to its times, a 20 ms `afade` in and out at its edges
   so the room switches without a click, `apad` by the room's tail (held to
   the clip's end), `afir` with its room's response from `aevalsrc` and
   `lowpass`, `volume` at its level, and `adelay` back to its start, in
   samples.
3. `amix` with `normalize=0` adds the wet segments to the whole dry signal.
   `duration=first` keeps the dry length, so a tail that would ring past the
   clip's end stops there.

### ffmpeg 6 and 7

`afir` renamed its gain options. ffmpeg 6 turns automatic IR gain off with
`gtype=none`; ffmpeg 7 removed `gtype` for `irnorm`, where `-1` leaves the
response as given. The server reads `ffmpeg -version` once (the same check
`GET /api/media/tools` answers) and `afirStyle` picks the names: 6 and older
take `gtype=none:irgain=1:dry=1:wet=1`, 7 and builds without a release number
take `irnorm=-1:irgain=1:dry=1:wet=1`. Both branches are tested as argument
lists; only the ffmpeg 6 branch has been rendered.

## Limits

- No outdoor ambience and no delay (see above).
- On a finished clip the whole mix is treated: music, voice and effects. A dry
  voice or stem gives the cleaner result.
- A change of room mid-clip is heard as a crossfade of tails: the earlier
  room's tail rings on over the next segment.
- It is a synthetic room, not a measured impulse response and not the LoRA's
  trained sound. Results cannot yet reach the person's Director project, as
  with the other media tools ([Dual Editor: agents](dual-editor.md#agents)).
- Local server only; the hosted Worker has no ffmpeg and no such route.

## Verification — 24 October 2026

Run in a sandbox with ffmpeg 6.1.1, locally; nothing was deployed.

- `tests/space.test.ts`: presets and levels read from the presets file;
  overlap, order, out of range, counts and bad presets (outdoor, delay, dry)
  refused; snapping to beat and bar against a 100 BPM grid with a 0.5 s
  downbeat; both `afir` branches.
- `tests/space-render.test.ts` (real ffmpeg, skipped without it): one impulse
  per room, each in its own segment at `high`, measured from the Schroeder
  backward integral with a T20 fit (−5 to −25 dB). Measured RT60: small room
  0.662 s, empty club 1.206 s, medium room 1.921 s, cathedral 4.786 s, each
  within 2% of its preset (the test allows 10%). A 3-second H.264 clip with
  sound kept its video packets byte for byte (`-f md5` of the copied stream)
  and gained different AAC sound.
- `tests/ffmpeg-service.test.ts`, `tests/mcp-media.test.ts`,
  `tests/agent-scope-routes.test.ts`: the route with a fake ffmpeg (the
  version picks `gtype`, refusals run no ffmpeg), the MCP tool's request and
  its refusals before sending, and a studio-started session's lack of it.
