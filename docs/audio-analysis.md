---
tags: [sound, backend, agents, mcp]
summary: Audio analysis on the local server — tempo and a fitted beat grid, a downbeat estimate, onsets per band, intensity and key moments, with no Python; the optional librosa worker; the agent flow through genobi_audio_upload and genobi_audio_analysis.
---

# Audio analysis

The last box of the backend issue (#12): **tempo and beat grid, onsets per
band (kick, snare), intensity curve, and key moments (build-ups, crescendo,
drop)**, on the local server. The core analysis is TypeScript in `shared/` and
needs no Python. librosa is an optional extra that an agent can ask for when a
venv is set up. The owner set this rule on 22 October 2026.

The hosted studio (Cloudflare) has **no audio analysis route**. There is no
ffmpeg in a Worker, and the analysis is CPU work on the person's machine.

## What the report holds

`POST /api/audio/analyze` and the `genobi_audio_analysis` tool return one shape
(`AudioAnalysisReport`, `shared/audio-report.ts`). All times are in seconds
from the start of the audio, rounded to the millisecond.

| Field         | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beatFound`   | False when fewer than four tracked beats, or fewer than half of them, land within 50 ms of a detected onset. A sustained tone, a drone or silence has no beat, so `grid`, `downbeat` and `composition` are then null                                                                                                                                                                                                                                              |
| `grid`        | A straight grid fitted by least squares over the detected beats: `bpm` and `periodSeconds` at full fitted precision (rounding 60.0049 BPM to 60 would put the 1,200th beat about 98 ms late; round only for display), `firstBeatSeconds` (the first grid beat at or after 0 s), `beatsPerBar`, detected and kept beats, `residualMs` (median distance of the kept beats from the line), `confidence` (kept share × closeness of fit × share of beats on an onset) |
| `downbeat`    | Which beat of the bar is the downbeat, from low-band (<150 Hz) energy per beat. It is always `estimate: true`, with `contrast` and `confidence`: **the person confirms it**                                                                                                                                                                                                                                                                                       |
| `composition` | `bpm`, `beatOffsetSeconds` and `beatsPerBar`, the composition's own field names (`shared/director/beat-grid.ts`). `beatOffsetSeconds` is the estimated first downbeat, in [0, one bar)                                                                                                                                                                                                                                                                            |
| `onsets`      | Onset times per band from spectral flux: `kick` (30–150 Hz), `snare` (200 Hz–5 kHz), `hat` (above 5 kHz), at most 5,000 per band (`truncated` says if more were found)                                                                                                                                                                                                                                                                                            |
| `intensity`   | RMS level in dBFS per step (0.1 s, longer for long tracks so there are at most 1,000 points), mapped to 0–1 between `floorDb` and `peakDb`                                                                                                                                                                                                                                                                                                                        |
| `moments`     | `build-up`, `crescendo` and `drop`, each with start, end and the change in dB that found it                                                                                                                                                                                                                                                                                                                                                                       |
| `librosa`     | `status`: `not-requested`, `unavailable`, `failed` (with a fixed `code`) or `used`. When used, it adds librosa's `beatFound`, `grid`, `downbeat`, `composition`, `onsets` and `sections` in the same shapes, under the same onset-evidence rule                                                                                                                                                                                                                   |

`beatsPerBar` is **assumed to be 4**, not detected. The tempo search covers 60
to 200 BPM.

## The agent flow

1. Call `genobi_audio_upload` with `filePath`, the absolute path of a local
   WAV, FLAC or MP3. The MCP server runs on the same machine. It checks the
   path (a string under 4,096 characters, no control characters, absolute, a
   regular file, at most 50 MB), reads the header with the shared reader
   (`inspectAudio`), and uploads only the bytes into the agent's own session.
   The path never reaches the studio, a log or an error message. It returns a
   `sourceId`, and the same file again returns the same id. This tool is marked
   as a write (`readOnlyHint: false`) because it stores a copy.
2. Call `genobi_audio_analysis` with that `sourceId`. It is read-only. It also
   takes `copyId` with `assetId` (an audio asset of a linked Director project).
   Add `librosa: true` for the optional worker. Add `detail: "summary"` to get
   200 onsets per band and a 200-point curve instead of the whole report; the
   summary keeps the counts and each onset set's `truncated` flag.
3. Check `beatFound`, then read `grid` and check its `confidence` and `residualMs`. A live performance
   with tempo drift fits a straight grid badly, and the residual shows it.
4. Show the person `downbeat` and ask them to confirm it. On most music the
   low-band contrast is weak: the MorphingTwins test in #12 measured 373 against 339. If the person hears the bar start elsewhere, add or subtract whole beats
   (`grid.periodSeconds`) to `beatOffsetSeconds`.
5. Apply `composition` to a linked Director project with
   `genobi_director_command` and `{op: "set-beat-grid", ...composition}`
   (`bpm`, `beatOffsetSeconds`, `beatsPerBar`; each optional, held to the
   bundle schema's bounds). Use `genobi_project` to read the current values
   first. The person can still change them in the Director's beat grid
   fields.

Cutting on the kick or the snare uses `onsets.kick` or `onsets.snare` directly.
A kick's beater click can also show in the snare band, so a band onset marks
where that band's flux peaks. It is not a drum transcription.

## How it works

ffmpeg decodes the stored file to mono float32 at 22.05 kHz
(`ffmpegArgs.pcm`). The decode uses fixed arguments, goes through the media
service's one-at-a-time queue, and writes to a private temporary folder that is
removed afterwards. `shared/audio-analysis.ts` then runs these steps:

- **Spectral flux** (`audio-dsp.ts`): 1,024-sample Hann frames every 256
  samples (11.6 ms). It is the positive change of log magnitude, summed over all
  bins and over each band's bins. A flux peak comes 7–11 ms before the attack,
  because the attack rises while it slides into the window. That lag was
  measured on clicks and kicks, and 9 ms is added back.
- **Tempo** (`audio-tempo.ts`): autocorrelation of the onset envelope,
  weighted by a log-normal prior around 120 BPM, as in librosa. Then dynamic
  programming places raw beats on strong onsets (Ellis 2007, the method behind
  librosa's `beat_track`).
- **Grid** (`gridWithEvidence`, `audio-report.ts`): a beat tracker finds a
  period in any steady texture, so the grid is given only when at least four
  tracked beats, and half of them, land within 50 ms of an onset. Raw beats
  wobble (the issue's test saw about 50 ms), so the grid is a least-squares
  line over them. Beats further than three robust deviations are dropped and
  the line is refitted. The librosa worker's raw beats go through the same
  function.
- **Onsets**: peaks of each band's flux over its surroundings, at least 50 ms
  apart, and only where the band's power over the next 46 ms is at least 1.5
  times its power over the 200 ms before. A steady tone's flux still ripples,
  most of all under 50 Hz, where one cycle is longer than a frame. Its power
  ripples by under 1%, so it gives no onsets. Before this check, a review
  found that a 20 Hz drone read as 122.65 BPM.
- **Key moments**, from the 10 Hz level curve, with silence floored at −60 dB.
  A **drop** is where the next 2 s are 6 dB louder than the 2 s before, or the
  low band is up 9 dB with the level up 3 dB, landing at or above the track's
  median. Drops are at least 8 s apart and snap to an onset within 150 ms. A
  **rise** is where the 2 s-smoothed level climbs faster than 0.5 dB/s. A rise
  that a drop follows within 2.5 s is a **build-up** (4 dB or more). A rise
  with no drop, 4 s or longer and 6 dB or more, is a **crescendo**.

These thresholds are heuristics. They were checked on synthetic signals only
(`tests/audio-analysis.test.ts`), not tuned on a music corpus.

Reports are cached in memory by the file's SHA-256 (64 entries).

### Off the event loop

An uncached analysis runs on a worker thread (`server/audio-thread.ts`), so the
server keeps answering polls, saves and health checks while it works. The
thread loads `shared/audio-analysis.ts` unchanged
(`server/audio-thread-entry.mjs`, through tsx's own import, so it works under
`npm run dev` and under the test runner alike), and its report equals the
inline one. The decoded samples are transferred to the thread, not copied, and
come back with the report for the librosa worker.

- **One at a time, four at most.** One analysis runs and up to three wait. A
  fifth request gets 503 `audio_busy` and can retry, so a burst cannot pile up
  decodes or threads. A thread is started per analysis and always stopped when
  it answers.
- **Failures answer, never hang.** A refusal keeps its 422 and is not cached. A
  thread that throws, exits, answers in the wrong shape or runs past its limit
  (30 s plus 0.1 s per second of audio, about 35 times the measured time) is
  stopped, and the request gets the server's usual 500 with its fixed message;
  nothing is cached and the next request starts a fresh thread.
- **Shutdown** (SIGINT or SIGTERM) stops a running thread, and the requests
  waiting on it answer 500.

Measured on 22 October 2026 on an M1 Max, Node 22.22, with a 98 BPM click
track: inline, a twenty-minute analysis took 3.5–3.8 s and held the event loop
for all of it (`monitorEventLoopDelay` max 3,555–3,819 ms; four minutes, 740
ms). On the thread it took 3.6–3.9 s and the loop's worst delay was 11.3–11.6
ms, which is the monitor's 10 ms sampling interval plus about 1.5 ms. The
hosted Worker has no audio analysis, so it needs no thread.

### Libraries checked

The decided stack (#12) named web-audio-beat-detector for the beat grid. It
and realtime-bpm-analyzer both need a browser: the first loads a Web Worker
from a Blob URL, and both filter through `OfflineAudioContext`. Neither runs in
Node without a DOM, so the tempo and grid code is Genobi's own. Meyda was
already dropped (ledger 352), and Essentia.js is AGPL. No npm dependency was
added.

## Routes (local server only)

| Route                     | Does                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/audio/status`   | `{ available, ffmpeg, python, librosa }`, booleans only                                                                                                                                                                                                                                                                                                  |
| `POST /api/audio/analyze` | `{ sourceId }` or `{ copyId, assetId }`, optionally `librosa: true`. Other keys, both forms or neither give 400; a non-audio source 415; samples that are NaN or infinite (an IEEE-float WAV can hold them) 422 `audio_not_finite`, and nothing is cached; audio over 20 minutes or 50 MB 413; four analyses already running or waiting 503 `audio_busy` |

A `sourceId` must be an audio upload or derived source of the session. Library
clips and other sessions' sources give 404. A project asset must be `kind:
"audio"`, and its stored file is read again with the shared header reader. The
routes are unpaid and local, so they count against the `history` rate bucket,
not the paid-write one.

## The optional librosa worker

`server/audio-worker/audio_worker.py` runs librosa 0.11.0 (ISC). It runs one
process per request and is killed after 120 s plus one second per second of
audio. The server writes a header line and the float32 samples to its stdin,
so no path crosses. The worker prints one result or a fixed error code. Its
stderr is discarded, and it gets only `PATH`, `HOME`, `LANG` and `TMPDIR`. It
returns raw beats, low-band power per beat, band onsets (librosa's onset
detection on each band's spectrogram) and section boundaries (agglomerative
clustering of MFCCs). The server builds the grid and downbeat from these with
the core's own code.

Set it up in its own venv:

```sh
python3.11 -m venv ~/.genobi/audio-env
~/.genobi/audio-env/bin/pip install --no-deps -r server/audio-worker/requirements.txt
~/.genobi/audio-env/bin/python -I server/audio-worker/audio_worker.py --check
GENOBI_AUDIO_PYTHON=~/.genobi/audio-env/bin/python npm run dev
```

`requirements.txt` pins the whole set and is installed with `--no-deps`. It
leaves out **soxr** on purpose. librosa imports soxr when it loads, but the
worker never calls `librosa.load` or a resampler, because ffmpeg has already
decoded the audio. So the worker puts a stand-in module in soxr's place. This
avoids the failure seen in the #12 test, where Homebrew's soxr was built
against NumPy 1 and broke under NumPy 2. It also keeps the LGPL resampler out.
`pip check` will report that soxr is missing; that is expected.

Unless `GENOBI_AUDIO_PYTHON` names an executable whose `--check` passes, a
request with `librosa: true` returns the core report with `librosa.status:
"unavailable"`.

## Verification

Run on 21 October 2026, macOS 14.6, M1 Max (local evidence, nothing deployed):

- `tests/audio-analysis.test.ts`: click tracks at 72, 98, 128 and 174 BPM
  recover the grid within 1 BPM and 10 ms. Kicks and noise hits land in their
  bands within 15 ms. A rise into a drop gives a build-up and a drop. A swell
  gives a crescendo. Silence and sustained 20 Hz, 60 Hz and 1 kHz tones give
  no beat, and the bundle's 120 BPM pulse fixture still does. A
  sample of NaN or infinity is refused, as the librosa worker refuses it. (Before
  the onset gate, a review found that the tone read as 97.52 BPM at
  confidence 0.99.)
- `tests/audio-server.test.ts`: ownership, refusals, the cache, status
  booleans, and the worker unavailable, used and failed (fake ffmpeg; one case
  uses the real ffmpeg with a 44.1 kHz file).
- `tests/audio-thread.test.ts` (22 October 2026): during a four-minute
  analysis through the route, a 20 ms timer was never more than 2 ms late and
  `/api/health` answered within 6 ms (the test allows 100 ms), against about
  740 ms of blocking inline; the report equals the inline one. A thread that
  throws, exits, answers in the wrong shape or hangs past its limit gives the
  fixed 500, twice in a row; a fifth queued request gets 503, and closing the
  analysis stops a hung thread and answers every waiting request.
- `tests/audio-worker.test.ts`: the worker protocol against a stand-in script,
  and result validation. With `GENOBI_AUDIO_PYTHON` set, the real worker
  recovered a 98 BPM click track.
- `tests/mcp-audio.test.ts`: upload by path then analysis, analysis by linked
  project asset, the tools' read-only hints, the truncation flags in a summary,
  and bad paths refused without echoing them.
- `scripts/check-audio-mcp.mjs`, against a dev server with no key and with the
  librosa venv set. It uses ffmpeg to make a 30 s click track at 98 BPM from
  0.37 s, runs the built plugin server over stdio, uploads the file with
  `genobi_audio_upload` and calls `genobi_audio_analysis` on its `sourceId`. The core grid read 98 BPM, first
  beat 0.370 s, residual 0.4 ms, confidence 0.99. librosa read 98 BPM, first
  beat 0.387 s (its 23 ms frames), residual 5.6 ms. The downbeat confidence was
  0.07, which is right for clicks that are all alike.

```sh
PORT=4317 npm run dev        # in one terminal; no key needed
GENOBI_URL=http://127.0.0.1:4317 node scripts/check-audio-mcp.mjs
```

Not yet verified: commercial music, metres other than 4, tempo drift, and the
key-moment thresholds on real build-ups.
