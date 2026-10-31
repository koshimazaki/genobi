---
tags: [agents, studio, backend, models]
summary: Voice mode in the studio header — one-click recording, local Qwen3-ASR transcription through a Python worker, the WIE-style LED waveform, where the transcript goes (a spoken generation request to Camera, the prompt on screen, or an agent session), the language setting, setup and what stays on the machine.
---

# Voice mode

Agents use `genobi_voice_status` and `genobi_voice_transcribe` over MCP, or
`genobi voice-status` and `genobi voice-transcribe` in the CLI. Transcription takes
a session audio source, linked audio asset or external-agent local file, checks
the worker's duration limit and returns text without executing it. Hosted has no
transcription worker. See [agent voice inputs](genobi-cli.md#project-references-deployments-and-voice).

Voice is the main way to direct Genobi (issue #23, "Signal"). This page covers
the first four boxes: **local transcription** with Qwen3-ASR, reusing X
Console's voice worker approach, **the same look** as X Console's voice mode,
the WIE-style LED waveform, in Genobi's colours, **one click, two
destinations**, and **voice goes where it is meant**.

## On the hosted studio

Voice mode runs in the local studio — speech is transcribed on your own machine.
On the hosted site, the header mic, Genobi bubble and setup explain this and link
to [local setup](https://github.com/koshimazaki/Genobi/blob/main/README.md#run-locally). Typed prompts remain available. The
hosted studio sends no `/api/voice` requests, never asks for the microphone and
keeps `Permissions-Policy: microphone=()`. No cloud speech service is used.
If the studio cannot confirm where it runs, voice stays unavailable and asks
you to check the connection and reload.

## In the local studio

Press the mic (**Voice**) in the studio header, beside the theme and the key,
in any section. A thin pill opens under the header on the right (Stop, the LED
waveform, a chevron and close) and it is already recording. Speak, then press
the mic again, or Stop in the pill, and the local model transcribes.
Pressing the mic when nothing is recording closes the pill. The panel under
the pill opens with the transcript, which you can correct, and says where it
went. There is no picker; the transcript goes where it is meant, once, as it
arrives (`src/voice/VoiceDestinations.tsx`):

1. **A spoken generation request** opens Camera, selects the mode and model,
   and writes the subject into the prompt. See
   [spoken requests](#spoken-requests). Not while a Scroll prompt or World
   Builder's scene direction is where the words would go: there a spoken
   scene stays a direction ([to World Builder](#to-world-builder)).
2. **Otherwise, a running agent session** takes it as your next message
   (Box 1.8; [below](#to-a-running-session)): the session the bubble follows,
   while it is starting or running. The bubble opens and shows it in the
   session's conversation.
3. **Otherwise, the prompt on screen** takes the whole transcript: **Camera
   prompt**, **Image prompt**, **Upscale prompt**, **Project prompt field**
   (the Director's project prompt) or **World Builder scene direction**. That is the prompt you last worked in, or
   else the first visible one (`src/voice/prompt-target.ts`). It fills the
   field the way typing does, and the panel says which ("In the Camera
   prompt."). With an LTX gap's tab open (Scene, Character, Action or
   Audio), that gap is the prompt on screen: "In the Action gap.", and
   Update prompt goes back to the same gap. A spoken request still writes the
   main Prompt tab and shows it.
4. **With none of these**, as in Gallery with words that are not a request, the panel says "No prompt on this screen." and offers **Do it in
   a session**, the [project prompt](#the-project-prompt). It does not switch
   sections by itself.

After 1 or 3 the panel offers **Send to agent instead**, which hands the same
words to the agent (the running session, or a new one), so a transcript that
went the wrong way is not lost. The filled prompt stays as it is. After 2 it
offers **To prompt**, which puts the words in the prompt on screen instead.
Every panel also offers **Copy**, which writes the transcript to the clipboard
(never reads it) and says "Copied to the clipboard.", so the words can be used
by hand while the agent works on something else.

### To World Builder

With World Builder open, its **Scene direction** (the recipe's `prompt`) is
a prompt on screen (`src/voice/world-prompt-target.ts`). When a Camera
prompt is also visible (a layout showing both), the Camera prompt still takes
the words, and reads them as a request, unless the scene direction was the
last field you worked in. The textarea in the
Scene panel is filled the way typing fills it; with the Scene panel closed,
World Builder's own registration takes the words through its session's
`change`, as an edit of the field would, when no other prompt is on screen. Either way the panel says "In the
World Builder scene direction.", nothing is captured or rendered, and the
recipe's 4,000-character limit holds. "a ninja falling in the cathedral" is
not read as a Camera request there. Beside the field, **Send to Genobi**
hands the direction and a summary of the set to the agent
([agent hand-off](world-builder.md#agent-hand-off)); the voice panel's own
**Send to agent instead** sends only the transcript.

### To a running session

The order follows what the person is doing (Box 1.8): with a session working
on the project, what they say next is for the session, not the prompt
(`deliverTranscript`, `src/voice/session-message.ts`). The studio posts the
words to the session's message route ([a second
message](agent-sessions.md#a-second-message)) with `source: "voice"`, the
bubble opens on the conversation, and the panel says "Sent to your Hermes
session as your next message." A headless Claude Code session takes it on its
stdin as its next turn. A runner without live input (Hermes, a Terminal
window) gets it through its Genobi MCP server: the server keeps it beside the
session in memory (`server/agent-inbox.ts`: six kept, five unread at most,
never logged), the MCP server collects the unread ones once each with its
grant (`POST /api/agent/run/messages`) and appends them to the agent's next
Genobi tool answer as the person's next message (`withMessages`,
`mcp/server.ts`). The session's brief says so, and that `genobi_status`
collects any waiting.

A session that refuses (it ended a moment ago, or it was relayed from the
hosted studio) leaves the words to the prompt on screen, with its reason. A
corrected transcript offers **Send correction**, another message. The
Director's **Project prompt field** is not filled while a session runs: it is
part of the project copy the agent is changing, and filling it would push the
copy over the agent's revision; the panel says so and offers **Send to
agent**. Nothing is submitted: the session's paid steps still wait in the
bubble for Approve.

A Terminal agent waiting for typing in its window calls no tool, so the
message waits too; telling it in the window that you sent one makes it call
`genobi_status` and read it.

Correcting the transcript does not change the prompt by itself: once it
differs from what went in, **Update prompt** sends the corrected words to the
same place. After a spoken request it reads them again as a request (only
then, never per keystroke), so fixing "a penguin" to "a pelican" updates the
subject; words that no longer read as one fill the Camera prompt whole. After
a plain fill it replaces that same prompt's text. When nothing was placed (a
misheard "make an imag of a penguin" in the Gallery), a corrected transcript
offers **Try again**, which routes the words afresh, once.

**Nothing is spent by voice.** A Camera prompt, filled either way, ends with
focus on the composer's Generate button, its price beside it, and the panel
says "Nothing runs until you press Generate." One click or Enter runs it; voice
never presses it (AGENTS.md: generation is a paid side effect, and #23's
"Confirm before spending"). A Generate that cannot run yet (an Edit without its
reference) leaves focus on the prompt. The Director's prompt keeps focus where
it was. Escape on the Generate button (or prompt) that voice focused closes
the pill and leaves focus there; it never presses Generate.

## Spoken requests

`shared/voice-intent.ts` reads a transcript without a model: the same words
always route the same way, and nothing is sent anywhere to decide it. A
request names a medium and/or a model, and a subject:

| Said                                                  | Studio                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| "I want to generate an image with FLUX of a penguin"  | Camera, image, FLUX 3 Image Klein, prompt "a penguin"        |
| "make a video with LTX of a neon street at night"     | Camera, video, LTX-2.5 Fast, prompt "a neon street at night" |
| "image of a penguin"                                  | Camera, image, the default still (Klein)                     |
| "generate an image with client of a penguin"          | Klein: local ASR often writes "client" for Klein             |
| "make a video with LTX two point five pro of rain"    | LTX-2.5 Pro                                                  |
| "generate a penguin with FLUX", "a FLUX image of a …" | The model may come after the subject or before the medium    |

Openings such as "I want to", "can you" and "please" are skipped; the verb is
generate, make, create, render, draw and the like; the medium is image,
picture, photo, still, video, clip, film or movie; the model follows "with",
"using", "in" or "on", or comes before the medium; the subject follows "of",
"showing", "about", a colon or a comma, and is kept as said, case included,
less closing punctuation and a trailing "please". Without a medium or a model
it is not a request: "open the director", "make the video louder" and "what
time is it" go on to the prompt on screen.

**The vocabulary comes from the registry** (`shared/voice-vocabulary.ts`), not
a list kept by hand. Every runnable image or video entry in
`shared/registry.ts` gives its family ("flux", "ltx"), its label's version
("flux 3", "ltx 2.5") and the words that set it apart from its family, taken
from its label and id with the family, version and task words removed
("klein", "fast", "pro", "acoustic space", "akuspace"). Spoken numbers read as
digits, so "flux three" is "flux 3". A renamed entry is heard by its new name
with no edit here. A short table of mishearings sits beside it ("client",
"kline", "klien" for Klein; "L T X" for LTX), and the tests fail if one names a
word the registry no longer gives. A mishearing is never read at the end of a
subject, so "an image of a lawyer with client" keeps its client. Coming
entries, the upscale and Edit are never selected. The word tables are Maps
and Sets, so `constructor` or `__proto__` is an ordinary word; if
reading the words ever fails, the transcript is treated as no request and
fills the prompt on screen.

**Which entry.** A named model is that entry. A family or a medium alone is the
first runnable entry that fits, in registry order: Klein first among FLUX
stills, LTX-2.5 Fast first among LTX video. What the composer already holds
stays when it fits: Klein on the API stays on the API when Klein is named, and
FLUX 3 Image stays when you ask for a FLUX still. A medium the model cannot
make ("a video with Klein") selects nothing, and the transcript goes on to the
prompt on screen.

**How it lands.** `src/voice/voice-intent-target.ts` hands the request to the
composer, which registers itself from `useComposer`, and the composer applies
it with its own `update`, as a model menu choice and typing would: the reducer
fits the controls to the entry, and the edit marks the composer as the
person's, so a restore does not overwrite it. If the composer is not on screen,
the shell selects Camera. The subject is cut to the prompt's limit (1,200
characters for video, 4,000 for a still). Mode changes keep the hero,
composer, toolbar and gallery where they are, as AGENTS.md requires.

## What is local

Everything. The microphone audio goes from the browser to the local Genobi
server on `127.0.0.1`, then to a Python worker on the same machine, which reads
a model folder on disk with the Hugging Face libraries set offline. No speech
service is called and nothing is downloaded at run time. The decoded audio is
written to a private temporary folder for the worker and deleted when it
answers. Nothing is logged: not the audio, the transcript or any path.

The hosted studio (Cloudflare Pages) has no voice route. There the Voice button
says that voice mode runs on the local server only.

## Setup

Voice installs from the first-run setup's **Save & set up**, from the header
mic's **Install Voice Mode?** panel, or by hand with three environment
variables. [Voice setup](voice-setup.md) covers each path, the grant and
cancellation, how a model already on disk is verified instead of downloaded,
and the configuration table.

## Language

The panel under the pill has a **Language** control: English (the default),
Auto-detect, then the other languages Qwen3-ASR takes, in alphabetical order.
The choice is kept per browser in `localStorage` (`genobi.voice.language`);
if storage is blocked or holds something unknown, it is English. It goes with
every note as `POST /api/voice/transcribe?language=English` (or `auto`), read
when the note is sent, so a change while recording still applies.

The list is Qwen3-ASR's own, in `shared/voice-languages.ts`: the 30 names of
`SUPPORTED_LANGUAGES` in `qwen_asr/inference/utils.py` of qwen-asr 0.0.6, the
version the worker's requirements pin (read 21 October 2026). The model raises
an error on any other name, so the server takes only a listed name, exactly as
written, or `auto`, at most 20 characters; anything else, a repeated
parameter included, is refused with `400 voice_language` before the audio is
decoded. A request with no language takes `GENOBI_VOICE_LANGUAGE`, read in
any case as Qwen3-ASR normalises it (`english` → English), or detects when
that is unset.

The language travels in the worker's request on stdin, not on its command
line, because prewarm starts the worker before the note (and its language)
arrives. The worker checks it again (a name of letters, at most 20, or null to
detect) and it overrides the worker's own `--language`.

## How a recording becomes a prompt

| Step                | Where                                  | What happens                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Record              | `src/voice/useVoiceRecorder.ts`        | `getUserMedia` and `MediaRecorder`; a 24 Hz level meter feeds the LEDs. Recording also calls `POST /api/voice/prewarm`.                                                                                                                                                                                                                                |
| Prewarm             | `server/voice.ts`                      | One worker starts loading the model while you speak, and waits for the recording for at most four minutes. A discarded recording sends `DELETE /api/voice/prewarm`, which stops it; so does closing or reloading the tab mid-recording (a `pagehide` handler, sent with `keepalive`). One worker at most: prewarm checks again after its status check. |
| Send                | `src/voice/wav.ts`                     | The browser decodes the recording at 16 kHz mono, keeps at most the server's limit (a late stop loses its last moment, not the note) and sends 16-bit WAV.                                                                                                                                                                                             |
| Validate            | `server/voice.ts`, `shared/uploads.ts` | The declared type must be WAV, FLAC or MP3 and the bytes must prove it; 50 MB at most; `shared/audio.ts` measures the length, three minutes at most. Before any process starts.                                                                                                                                                                        |
| Decode, chunk, gate | `server/voice-audio.ts`                | ffmpeg decodes to 16 kHz float32. Chunks of at most 28 seconds, cut at the quietest 20 ms after 22 seconds. A chunk without 0.2 s of voiced audio is skipped.                                                                                                                                                                                          |
| Transcribe          | `server/voice-worker/voice_worker.py`  | Qwen3-ASR, fp16 on Metal or fp32 on the CPU, one chunk per call, the dictionary's words as context and the note's language as the hint (none for Auto-detect).                                                                                                                                                                                         |
| Clean               | `shared/voice-dictionary.ts`           | Context echoes dropped, heard → written words replaced, spoken numbers written as digits.                                                                                                                                                                                                                                                              |

`POST /api/voice/transcribe` answers with the text, what the model heard
before the clean-up, the model's name, how many chunks were sent, and timings
(decode, waiting for the model, transcription, total, and whether the worker
was prewarmed). One transcription runs at a time; closing the overlay or the
tab stops the worker, whether it is transcribing or still waiting as a
prewarm. A note that fails (refused, silent or undecodable) frees its
prewarmed worker too, whether it failed on the server or in the browser. A
recorder that cannot start after permission releases the microphone, and the
prewarm is only sent once recording is running. Voice requests count against the 60-a-minute read limit,
not the paid-write limit, so dictating never holds up a Generate.

### Why the silence gate

X Console found on 20 October 2026 that on a chunk with no speech the model
copies its dictionary context back word for word. Reproduced here on 21
October: six seconds of pink noise at amplitude 0.002 sent straight to the
worker came back as "Genobi, Ninja, Klein, LTX, AKUSPACE, Comfy." So the server
never sends such a chunk. A 20 ms window counts as voiced when its level
(rms × 0.78 + peak × 0.22) clears three times the recording's noise floor,
kept between 0.012 and 0.05; a chunk needs 0.2 s of voiced windows. Whatever
slips past is caught after the model: a chunk that is only a list of
dictionary words is dropped.

### The dictionary

`shared/voice-dictionary.ts` holds heard → written pairs. Written words go to
the model as context, which biases recognition; the model is not given rules,
because rules in the context do nothing. Heard words are then replaced, whole
words only, ignoring case, longest first, in one pass. Seeded with the studio's
own words: Genobi, Ninja, Klein, LTX, AKUSPACE and Comfy. The heard variants
("L T X", "aku space", "Kline") are guesses at likely mishearings, not measured
ones; extend them from real transcripts, using the `heard` field the route
returns. Comfy and Ninja are vocabulary only, so "a comfy sofa" stays as said.

Numbers are normalised deterministically: "six point one" → 6.1, "twenty four
frames" → 24 frames, "one hundred and twenty" → 120, "five seconds" → 5
seconds. A lone number under ten stays a word unless a unit follows it, so "one
shot" and "two characters" read as said.

## The project prompt

The transcript becomes a request to the local server, in the shape
`shared/agent-session.ts` defines (shared with the server's routes), through
the studio's spawn action (`src/agent/spawn.ts`,
[spawn the agent](agent-setup.md#spawn-the-agent)):

1. `GET /api/agent/status` first. It answers booleans and names only:
   `available`, the `runner` and a `message`. With no agent saved, Hermes'
   profile missing or the harness signed out, the spawn dialog picks, sets up
   or signs in the harness in place (Box 1.6) rather than ending on "Agent
   sessions aren't set up on this server." Where it cannot (the hosted studio
   without a paired runner, a missing harness), the panel shows the reason and
   nothing is sent.
2. The open Director project's copy, if this session holds one: the studio
   keys its copy by project id, and `GET /api/projects` gives the handle
   (`<project id>.<ten characters>`) that another session links with. With no
   project open, or no copy, the request goes without one.
3. `POST /api/agent/sessions` with `{ prompt, copyId?, source: "voice",
context? }`, where `context` is the studio's picks and settings
   ([Picks and context](agent-context.md)). The
   prompt is checked with the contract's own `parseAgentSessionRequest` first
   (not empty, at most 4,000 characters, control characters stripped), so an
   overlong transcript is refused before anything is sent.
4. A started session says so ("Session started with Claude Code on the open
   project.") and is announced on `window` as a `genobi:agent-session` event
   with its `id`, for the session panel to open. A refusal shows the server's
   message. One send per transcript: editing the transcript allows another.

With a session already running, none of this happens: the words go to
`POST /api/agent/sessions/:id/messages` as `{ prompt, source: "voice" }`, the
copy is not looked up or pushed, and the bubble shows the conversation grow
([a second message](agent-sessions.md#a-second-message)).

Every agent request carries `X-Genobi-Agent: 1`. A page on another site cannot
add a custom header without a CORS preflight, which the local server does not
grant, so only the studio itself can start a session. The session runs only
on the local server. Hosted runner pairing supports text prompts; microphone transcription still requires the local studio.

Nothing a spoken request starts can spend on its own: a paid step the agent
quotes waits in the session bubble with its plan and price for **Approve** or
**Decline** ([Confirm before spending](agent-approvals.md)).

### Picks and context

Every session start, spoken or typed, carries the person's recent picks and
the composer's settings, and "my last two picks" or "these settings" reach the
agent as real ids. [Picks and context](agent-context.md) has the block's shape,
its limits and the phrase resolution.

## The look

`src/voice/VoiceLEDWaveform.tsx` is X Console's `VoiceLEDWaveform` on a canvas,
after WIE's voice feedback. Each meter frame's level is WIE's:
`rms × 0.78 + peak × 0.22`, less a 0.006 gate, then `(x × 7.5)^0.72`. 48 LEDs,
the newest on the right beside Record, the mic. Quiet levels stay round dots
and speech lifts them into bars, each LED coloured by loudness along the
theme's ramp with a glow that grows with it. On Record the LEDs arrive one by
one from the right; while the model works the arrival repeats as the loader,
all dots, coloured by place.

| Theme             | Quiet → loud                                |
| ----------------- | ------------------------------------------- |
| Blackstone / Lime | graphite, machined grey, lime, lime readout |
| Cyberpunk         | deep cyan, intel cyan, coral, rose          |

The stops are `--voice-led-0` to `--voice-led-3` in `src/voice/voice.css`.
Reduced motion keeps a static meter: no arrival, no easing, and a still loader.

The pill hangs under the header against its right edge and opens downward
over the gallery or panels; it moves neither the toolbar, the gallery nor the
hero. While recording it shows only Stop (a square), the LEDs, the chevron and
close; the state ("LISTENING 00:04") is still spoken to screen readers. The
panel under it opens by itself for the transcript, a message or the loader,
and the chevron folds or opens it. Focus goes to Stop; Escape or the close
button returns it to Voice; closing drops a recording in progress. A refused
microphone, a missing microphone and an unconfigured server each show a
message in the panel; a refusal is asked once per opening, never in a loop,
and Record in the pill tries again. Voice has one entry point: the header mic.

## Verification

- `npm test`: the dictionary and numbers, the chunker and silence gate on
  synthetic samples, the level formula, the WAV the studio sends (measured by
  `shared/audio.ts`), the status route with and without configuration, and
  transcribe refusing a wrong type, an unreadable, overlong or oversized file and
  an unconfigured machine before anything is spawned. A recording past the
  limit is trimmed to exactly the limit, which the server accepts. Prewarm
  races are arranged with a held status check: a transcription or a second
  prewarm that starts meanwhile, or a cancel, leaves one worker or none, and
  cancelling stops the waiting worker. The page-hide hook runs the cancel and
  the cancel request is sent with `keepalive`. A stand-in script checks
  the worker's line protocol when `python3` is on `PATH`. No test needs Python,
  a model or ffmpeg.
- `tests/voice-languages.test.ts` and `tests/voice-server.test.ts`: the
  allow-list (exact names, `auto`, nothing else), the server default read
  from the environment in any case, the choice in the browser (English when
  missing, unknown or refused by storage), the query each note sends, the
  status listing the languages, each note's language reaching the worker
  request (`auto` as null, none as the server's default), an unknown language
  making the server not set up, and an off-list, repeated or overlong
  language refused before anything is decoded. With `python3` on `PATH`, the
  real worker's request check takes a name or null and refuses anything else.
- `tests/voice-agent-client.test.ts`: the agent status read (a missing route,
  a page or a network failure is "not set up"; unknown runners and extra
  fields are dropped), the copy handle (this session's own copy only, a valid
  handle only), and the session request (the header, the body, no copy when
  none is open, an empty or overlong prompt refused before sending, and the
  server's refusal shown).
- `tests/voice-intent.test.ts`: the parser on the examples above, mixed
  casing and punctuation, the spoken variants (flux three, Klein, client), a
  model before the medium, after the verb or after the subject, a mishearing
  never read at the end of a subject, Object.prototype's names (constructor,
  toString, `__proto__`, hasOwnProperty, valueOf) read as ordinary words in
  every slot, and refusals ("open the director", "what
  time is it", "make the video louder", an empty note); a transcript after the
  dictionary's clean-up; which entry each request selects, a held entry kept,
  a medium the model cannot make selecting nothing; the vocabulary drawn from
  the registry's labels and ids, following a renamed entry, and every
  mishearing tied to a word the registry still gives.
- `tests/voice-intent-target.test.ts`: against the composer's own reducer, a
  request from the Gallery selects Camera, image mode and Klein and writes "a
  penguin" as a marked edit, with the request Generate would send naming Klein;
  from Camera it stays and moves to LTX-2.5 Fast with LTX's controls; a medium
  alone takes the default still; words that are not a request, or that no
  model fits, change nothing; with no composer nothing happens; a long subject
  is cut to the prompt's limit.
- `node scripts/check-voice-overlay.mjs` against a dev server (helpers in
  `scripts/lib/voice-fixture.mjs`, the destinations in
  `scripts/lib/voice-destination-checks.mjs`, spoken requests in
  `scripts/lib/voice-intent-checks.mjs`; the transcription is a fixture
  answer): Chrome with a fake microphone records on one click of the mic,
  prewarms, and the mic again stops and transcribes; it sends WAV and shows
  the transcript; with no picker, the transcript goes into the prompt on
  screen (Ninja's and Camera's), says which, focuses the priced Generate in
  Camera and submits nothing; a corrected transcript reaches the prompt only
  through Update prompt, and Escape on the focused Generate closes Voice,
  keeps focus there and submits nothing; from the Gallery at 1440 and 390 px, "I want to
  generate an image with FLUX of a penguin." opens Camera on FLUX 3 Image
  Klein with "a penguin" in the prompt and focus on Generate, and submits
  nothing, and Update prompt turns a corrected "pelican" into the subject; a
  misheard "make an imag of a penguin" in the Gallery goes nowhere, and Try
  again on the corrected words opens Camera on Klein; in Camera at 1440 and 390 px a spoken image request and an LTX
  video request leave the hero, composer, toolbar and gallery where they
  were; Gallery with words that are not a request says "No prompt on this
  screen.", offers a session and stays in Gallery; Send to agent instead asks
  the status first and, with the route missing or `available: false`, sends
  nothing; when available it posts the transcript, the open project's copy
  handle and `source: "voice"` with `X-Genobi-Agent: 1`, says the session
  started and announces it once; a refusal shows the server's message. Voice
  is in the header of every section; the pill sits under the header on the
  right; the chevron folds the panel; the toolbar, gallery and panels do not
  move at 1440, 390 and 320 px; Escape returns focus to Voice; closing during
  a recording cancels the prewarm once, and a finished note cancels nothing; a
  `pagehide` mid-recording cancels it too; the loader is still under reduced
  motion; a refused microphone is asked once, and refusal, missing worker and
  hosted studio each show their message. The Language control offers English
  first, Auto-detect, then the server's list; a choice goes with the next
  note, survives a reload, and storage that refuses the key still works. API
  routes are fixtures.
- On an M1 Max with Qwen3-ASR-0.6B on Metal, 21 October 2026, a 7.7 s `say`
  recording ("Open Genobi and render with L T X at six point one seconds…")
  came back as "Open Genobi and render with LTX at 6.1 seconds. Then use the
  AKUSPACE preset for 24 frames." Cold, over two runs: 10.4 and 12.8 s, almost
  all of it loading the model. Prewarmed: 0.73 and 0.78 s. With 27 s of room
  tone appended, the tail chunk was gated and the text was unchanged; five
  seconds of room tone alone was refused as `no_speech` without starting the
  model; a request dropped after two seconds left no worker running.
  Cancelling a prewarm, while it loaded and again once it was warm, left no
  worker running either.

- Through the header pill on 21 October 2026, Qwen3-ASR-0.6B on Metal: a
  `say` clip ("a slow dolly in on a forest shaman") converted to 16 kHz mono
  WAV came back from `POST /api/voice/transcribe` as "A slow dolly in on a
  forest charmer." in 9.3 s cold (8.8 s of it loading the model, 0.37 s
  transcribing). "Shaman" was misheard, which a dictionary entry could fix if
  real speech shows the same. The same file fed to Chrome's fake microphone
  went from the header pill through Use as prompt into Camera's description.

- One click through the real pipe, 21 October 2026, Qwen3-ASR-0.6B on Metal,
  Chrome's fake microphone playing a `say` clip ("A slow dolly in on a forest
  shaman, then orbit the vessel for six point one seconds."): the mic
  recorded, the mic again stopped it, and 8.8 s after the first click the
  transcript read "A slow dolly in on a forest charman, then orbit the vessel
  for 6.1 seconds." (the fake device loops the clip, so a repeat followed);
  Camera prompt filled the scene description, and Project prompt said agent
  sessions aren't set up, as this server has no agent route yet. Through the
  route, a French `say` clip came back in French with `?language=French` and
  with `auto` (detected as French), and run together as "Unlentraveling
  avant…" with `?language=English`, so the hint reaches the model.
  `?language=Klingon` was refused with `voice_language`.

## Not yet

- A message reaching a Terminal agent that is idle at its prompt: it arrives
  with the agent's next Genobi tool call, not as typed input in the window.
- Director commands from the transcript: voice fills a prompt or sets up
  Camera; the agent session is what drives tools.
- Spoken confirmation ("generate", "go") to press Generate: voice stops at the
  priced button for now.
- Spoken Edit and Upscale requests, and a spoken camera move or duration ("a
  five second video"): the parser reads a medium, a model and a subject only.
- A dictionary editor in the studio, and suggestions from corrections (X
  Console has both).
- Holding a key to talk.
- Real microphone use in the browser was checked with Chrome's fake device and
  fixture routes; the full pipe was checked with synthesised speech through the
  server, not a person at a microphone.
