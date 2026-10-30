---
name: genobi-swords
description: Dual Swords for agents - check ffmpeg, probe a clip, pull still frames, trim a section, recompose clips with a join or a crossfade, and put an AKUSPACE room on a clip's sound in timed segments, through the studio's local ffmpeg tools. Says what the results can and cannot reach yet (the person's project, a re-run from a frame). Local work on this machine; never paid.
license: MIT
compatibility: Needs the Genobi studio running locally (`npm run dev` in camera-director) with ffmpeg and ffprobe installed, the genobi MCP server and Node 22 or later. The hosted studio has no media tools.
metadata:
  version: "0.1.0"
  phase: "Dual Swords tools"
  tags: "agents, mcp, dual-editor, sound"
  docs: "docs/dual-editor.md, docs/architecture.md, docs/media-space.md"
---

# Genobi Dual Swords

Dual Swords is the studio's frame editor. In the browser the person compares
two clips frame by frame and cuts on a timeline; for agents, the local studio
server runs the same kind of work with ffmpeg. Every tool here runs on this
machine, one ffmpeg at a time, and never pays. Each result is a **new** source
in your own studio session (`origin: derived`); the source you cut from is
never changed.

Timeline commands like the Director's (`genobi_director_command`) are planned
for Dual Swords, not available: you cannot edit the person's Dual Swords
timeline from here.

## Check first

1. `genobi_status {}` → the studio is up.
2. `genobi_media_tools {}` → `{ffmpeg: true}`. If `ffmpeg` is `false`, every
   other tool here answers `ffmpeg_missing`: ask the person to install ffmpeg
   (and ffprobe), then restart the studio. Do not install it yourself.

## Which clips you can name

The tools take a `sourceId`:

- your own Ready takes: the job `id` from `genobi_jobs` (a take's clip is a
  source with the job's id);
- an audio file you brought in with `genobi_audio_upload`;
- an earlier result of these tools;
- a library clip id the person gives you.

Anything else of the person's is not found. When the studio started you for a
project prompt, a take the person picked (`picks` in the studio's context)
can be **probed**, but not cut: the cutting tools read your own session only.

## Probe

`genobi_media_probe {"sourceId": "<sourceId>"}` → `duration` (seconds),
`video` (`width`, `height`, `fps`, `codec`) and `audio` (`sampleRate`,
`channels`, `codec`); a stream is missing when the file has none. Probe before
you cut, so times land inside the clip.

## Pull frames

`genobi_media_frames {"sourceId": "<sourceId>", "times": [0, 1.5, 3]}` → one
PNG image source per time, in the order asked: each with `sourceId`, `label`,
`kind` (`image`), `width` and `height`. One to 16 times per call, each before
the clip's end; the source must be a video.

## Slice

`genobi_media_trim {"sourceId": "<sourceId>", "start": 2, "duration": 3.5}` →
the section from `start` for `duration` seconds (at least 0.1), inside the
clip. A video cut is an H.264 MP4 with the source's picture (rounded down to
even sides) and its sound; an audio cut is 16-bit WAV. Results are capped at
two minutes of video, twenty of audio and 250 MB.

To split a clip into parts, trim each part from the same source.

## Recompose

- `genobi_media_concat {"sourceIds": ["<first sourceId>", "<second sourceId>"]}`
  joins two to eight clips end to end, in order. All video or all audio. Video
  is fitted to the first clip's even size and frame rate, letterboxed, and keeps
  sound only when every clip has it; audio comes back as 48 kHz stereo WAV.
- `genobi_media_crossfade {"sourceIds": ["<outgoing sourceId>", "<incoming sourceId>"], "duration": 0.5}`
  overlaps exactly two clips of the same kind by `duration` seconds (0.1 to 5,
  shorter than either clip): a picture fade and a sound crossfade.

Each answers one result: `sourceId`, `label`, `kind`, `width`, `height` and
`duration`. Probe it to check the length you expected.

A cut of audio can go straight on to `genobi_audio_analysis {"sourceId": "<sourceId>"}`
for its tempo and beat grid (see `genobi-director`).

## Put a room on it

`genobi_media_space` puts one of the AKUSPACE rooms on sound that already
exists, by convolution with a synthetic room response: the CPU counterpart of
the AKUSPACE LoRA, which generates the room inside LTX instead (load
`genobi-akuspace` for that). Local, never paid.

1. **Analyse first.** For music, `genobi_audio_analysis {"sourceId": "<sourceId>"}`
   gives the grid, the downbeat, key moments (build-ups, drops) and, with
   `librosa: true`, sections. For a storyboard, read the Scrolls panels'
   times instead. Choose segment edges from those: a section, a drop, a panel.
2. **Call it**, with the rooms in order and not overlapping:
   `genobi_media_space {"sourceId": "<sourceId>", "segments": [{"start": 0, "end": 8, "preset": "small_room", "level": "low"}, {"start": 8, "end": 16, "preset": "cathedral", "level": "high"}], "snap": "bar", "grid": {"bpm": 98.2, "beatOffsetSeconds": 1.3, "beatsPerBar": 4}}`.
   For musical material use `snap: "bar"` (or `"beat"`) with the report's
   `composition` as `grid`; edges then land on the bar lines. Leave snap out
   for speech or a storyboard.
3. **Place the result.** It is a new source like the other tools' results
   (`sourceId`, `kind`, `duration`); the source is unchanged. Probe it, or run
   `genobi_audio_analysis` on it again.

Rooms (`preset`): `small_room` (0.67 s decay), `empty_club` (1.2 s),
`medium_room` (1.9 s) and `cathedral` (4.8 s, the node pack's estimate).
`level`: `low`, `mid` (the default) or `high`, the wet level at −25, −12 or
0 dB. One to 16 segments, each at least 0.1 s, inside the clip. A video keeps
its picture as it is (copied, not re-encoded) and gains the treated sound; an
audio clip comes back as 48 kHz stereo WAV.

Say these limits plainly:

- **No outdoor ambience and no delay.** `outdoor_day`, `outdoor_night` and
  `dual_delay` are refused: they are birdsong, crickets and a delay patch, not
  rooms. Only the LoRA has them.
- **The whole mix is treated.** On a finished clip, music, voice and effects
  all go into the room. Prefer the dry voice or stem when there is one.
- **A change of room mid-clip is heard as a crossfade of tails.** Each
  segment fades over 20 ms at its edges and its tail rings on past its end
  (to the clip's end at most), over the next segment's room.
- It is a synthetic room (decaying filtered noise), not a measured space or
  the LoRA's trained sound.

## Into the person's project

The person's studio does not list your session's files. To give them a
trimmed, joined, crossfaded or spaced result, link their project
(`genobi-director`) and hand it in:

1. Hand in the takes it was cut from first:
   `genobi_take_to_project {"id": "<job id>", "copyId": "<copyId>", "baseRevision": <revision>}`.
2. Then the result:
   `genobi_take_to_project {"sourceId": "<result sourceId>", "copyId": "<copyId>", "baseRevision": <new revision>}`.
   It returns the `assetId` and a `derivation`: the operation and its inputs,
   each with the project asset that holds it. An input the project lacks has
   no `assetId`, and the render report says its models are not recorded.
3. Place it: `replace-plate` or `add-clip` for video, `add-clip` on an audio
   track for a sound cut.

Only video and audio results go in; a frame is a still. A result made from
media your session does not own is refused. Every hand-in is a new revision,
so read the project again if the person edits in between.

For a cut you may want to change later, the Director is often better: hand
your take in, then `add-clip` with `sourceStartFrame` (the in-point) and
`durationFrames`, or `trim-clip` on a placed clip. Those edits are
non-destructive and the person can undo them.

## Re-run from a frame: not yet

A still made by `genobi_media_frames` cannot yet become an image reference for
a quoted Klein or FLUX request: `genobi_quote` takes `imageReferences` only as
PNG, JPEG or WebP data URLs, and no tool turns a frame source into one. Do not
paste image bytes into a quote. Tell the person they can save the frame from
Dual Swords (Export to assets, which puts it in the project's assets) and drag
it from the Assets rail into the studio's Image or Edit reference tray
themselves; then quote as `genobi-camera` says.

## Errors

- `ffmpeg_missing` (503): ffmpeg is not installed; see Check first.
- 404: the id is not a source of this session or the library.
- 400: a time outside the clip, a result over its cap, mixed video and audio,
  or an image where a clip is needed. Read the message; fix the request.
- `ffmpeg_failed` (422): ffmpeg could not make the file. Do not loop the same
  call; probe the inputs and tell the person.

## Terminal commands

The CLI uses the same implementations: `genobi swords probe`, `frames`, `trim`,
`concat`, `crossfade`, `space` and `tools` alias the corresponding media MCP tools.
Read `genobi schema swords frames` and pass JSON with `--input @request.json`.
Load `genobi-cli` for profiles so derived sources remain accessible across calls.
Studio-started agent mode still exposes only the check and probe.

## Arena: compare workflow results

For two to four approaches, use **Project Tools → Arena**. `genobi_arena`
keeps the comparison prompt, approach models, reference media, video or image
results, observations and preferred slot together. Read
[Arena](../../../../docs/arena.md) for bounds and the HTTP contract.

Link using the one-use code supplied by the person or active Arena context:
`{"action":"link","code":"<code>"}`. Read the returned comparison before
changing it. For a fresh agent-owned comparison, use `action=create` and a
validated draft; do not assume that creates it in the person's browser session.

- **Change one approach** with `action=set_slot`, `id`, `slot` and a `patch`
  (`label`, `prompt`, `notes`, `model`, `workflow`, `guide`, `entry`). `entry`
  picks what it runs: `ltx-2-5-fast`, `ltx-2-5-pro`, `flux-3-video`,
  `flux-3-image` (sends the comparison's image references), `flux-3-klein-api`,
  or `ltx-2-5-akuspace` / `flux-3-klein` as workflows on the run location;
  `null` is record only.
- **Bring media in** with `action=add` and a studio `sourceId` (an upload, a
  finished run's job id, or a catalogue clip such as `library-02`), or
  `action=upload` with a local `filePath`. Add `slot` to make it that approach's
  result; leave it out for a reference.
- **Run** with `action=request_run` (optionally `slots`). You never spend: the
  person sees a Review and run banner, which quotes and confirms the total.
  Confirmed runs go out together, join the studio queue, and each finished
  video or image attaches to its approach. Read the comparison to follow them.

Use `action=update` with the current `revision` and the full draft only for
whole-comparison edits. A conflict means re-read and reconcile; never overwrite
someone else's edits. A free-form model/workflow label is not a runnable
adapter. Report unavailable routes honestly. Compare identity, camera, movement,
style and failures separately; keep source/output duration differences visible.
Never retry an uncertain paid run.
