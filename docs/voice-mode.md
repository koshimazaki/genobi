---
tags: [agents, studio, backend, models]
summary: Local voice transcription with an agent-first remembered destination, pinned conversations, explicit prompt dictation, language selection and hosted limits.
---

# Voice mode

Agents use `genobi_voice_status` and `genobi_voice_transcribe` over MCP, or
`genobi voice-status` and `genobi voice-transcribe` in the CLI. Transcription takes
a session audio source, linked audio asset or external-agent local file, checks
the worker's duration limit and returns text without executing it. Hosted has no
transcription worker. See [agent voice inputs](genobi-cli.md#project-references-deployments-and-voice).

Voice directs the configured agent by default. The header microphone, agent
bubble and activity deck share one recorder. Qwen3-ASR transcribes on the local
machine; the chosen agent harness receives the resulting text.

## On the hosted studio

Voice mode runs in the local studio — speech is transcribed on your own machine.
On the hosted site, the header mic, Genobi bubble and setup explain this and link
to [local setup](https://github.com/koshimazaki/Genobi/blob/main/README.md#run-locally). Typed prompts remain available. The
hosted studio sends no `/api/voice` requests, never asks for the microphone and
keeps `Permissions-Policy: microphone=()`. No cloud speech service is used.
If the studio cannot confirm where it runs, voice stays unavailable and asks
you to check the connection and reload.

## In the local studio

Press **Voice** in any section, or **Speak to agent** in the Genobi bubble or
activity deck. The pill opens and records immediately. Stop ends the note and
transcribes it. **To** remains visible while the transcript panel is folded.

**Agent is the default destination.** A new transcript goes to the configured
agent even when its words resemble a Camera generation request. If no session
is running, the existing setup/start flow opens; once configured, further notes
reuse the same selected conversation. A new note needs no destination dialog.
The selected runner and a short conversation title appear in **To**.

The destination preference is remembered in this browser. Conversation and
project identities remain in page memory, including after closing/reopening
the pill. No session identity or transcript is placed in this preference's
browser storage. Automatic selection skips sessions known to belong to a
different project. After reload, a running conversation with an unknown project
needs one explicit selection through **Shown conversation** or its log's
**Speak to agent**; it is never silently assigned to the open project.

### Choosing a destination

| Destination                 | Result                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------- |
| Agent                       | Send the entire transcript as a direction to the selected agent.                        |
| Current agent / new session | Explicitly release the previous conversation and use the current session, or start one. |
| Shown conversation          | Select the different conversation currently shown in the bubble.                        |
| Current prompt              | Dictate into the last focused editable prompt, or the first visible prompt.             |
| A named prompt              | Dictate only into that field, including an LTX gap or World Builder scene direction.    |
| Camera request              | Interpret a medium/model/subject request with the existing Camera parser.               |

Choose while speaking or between notes. Once transcription begins, the note's
destination is frozen until delivery completes. Changing **To** after delivery
sets the next note's destination; it never resends the displayed transcript.
**Send to selected destination** explicitly sends the displayed words again.
**Copy** remains available whenever there is a transcript.

A named prompt that closes does not redirect into a different prompt. Its words
stay in the panel until a destination is selected. **Update prompt** corrects
the original field and its Scroll document/cell; **Send correction** targets the
conversation that received the original note. Typing a correction alone does
not send anything.

### To World Builder

Select **World Builder scene direction** to edit the recipe's `prompt`. It
continues to work when World Builder is open with its Scene panel closed,
through the existing registered scene-direction action. The recipe's
4,000-character limit still applies. This only edits the direction; it captures
or renders nothing. Choose Agent to ask for scene manipulation instead.

### To a running session

The selected conversation remains the destination across notes even if another
session becomes the latest one in the bubble. A conversation's **Speak to agent**
action explicitly selects that conversation. Each send checks the selected
session again. If it finished, is unavailable, or the open project changed, the
transcript stays visible and the person chooses a destination again. It is not
sent to another session or inserted into an unrelated prompt.

The studio uses the same `POST /api/agent/sessions/:id/messages` route as typed
directions, with `source: "voice"`. Headless Claude Code takes it as its next
turn. Hermes and a Terminal runner can receive the message through their next
Genobi tool call; the panel says when it is queued. An idle Terminal runner may
need to call `genobi_status` to collect it. A hosted relay does not add a speech
worker or a follow-up-message transport.

The Director project prompt is held while a live agent edits that project.
A failed or uncertain send is never retried automatically. Recording another
note is held while the current delivery or initial agent setup is pending.

**Paid generation still needs approval.** Direct prompt dictation and Camera
request mode end at the priced Generate button without pressing it. Agent
requests use the existing quote/approval path. Escape from Generate closes
Voice and leaves focus there; it never runs generation.

## Spoken requests

**Camera request** must be selected explicitly. `shared/voice-intent.ts` then
reads the transcript without a model. A request names a medium and/or a model,
and a subject:

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
time is it" stay in the transcript until another destination is selected.

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
reading the words ever fails, the transcript stays visible without changing a prompt.

**Which entry.** A named model is that entry. A family or a medium alone is the
first runnable entry that fits, in registry order: Klein first among FLUX
stills, LTX-2.5 Fast first among LTX video. What the composer already holds
stays when it fits: Klein on the API stays on the API when Klein is named, and
FLUX 3 Image stays when you ask for a FLUX still. A medium the model cannot
make ("a video with Klein") selects nothing and keeps the transcript.

**How it lands.** `src/voice/voice-intent-target.ts` hands the request to the
composer, which registers itself from `useComposer`, and the composer applies
it with its own `update`, as a model menu choice and typing would: the reducer
fits the controls to the entry, and the edit marks the composer as the
person's, so a restore does not overwrite it. If the composer is not on screen,
the shell selects Camera. The subject is cut to the prompt's limit (1,200
characters for video, 4,000 for a still). Mode changes keep the hero,
composer, toolbar and gallery where they are, as AGENTS.md requires.

## What is local

Transcription is local. The microphone audio goes from the browser to the local Genobi
server on `127.0.0.1`, then to a Python worker on the same machine, which reads
a model folder on disk with the Hugging Face libraries set offline. No speech
service is called and nothing is downloaded at run time. The decoded audio is
written to a private temporary folder for the worker and deleted when it
answers. The transcription worker logs no audio, transcript or path. Sending the
text to an agent uses that harness's configured model/provider and records the
message in its conversation; it does not send the microphone audio.

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

The first Agent-directed transcript becomes a request to the local server, in the shape
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
hero. While recording it shows Stop (a square), the LEDs, the destination, the chevron
and close; the state ("LISTENING 00:04") is still spoken to screen readers. The
panel under it opens by itself for the transcript, a message or the loader,
and the chevron folds or opens it. Focus goes to Stop; Escape or the close
button returns it to Voice; closing drops a recording in progress. A refused
microphone, a missing microphone and an unconfigured server each show a
message in the panel; a refusal is asked once per opening, never in a loop,
and Record in the pill tries again. The header mic, bubble and deck all open
the same recorder; conversation entry points also select their agent.

## Verification

The revised routing is **implemented**, with 113 focused fixture tests across
12 suites passing on 31 October 2026. It is not yet verified end to end in a
capable browser or with a real microphone. The earlier voice implementation's
verification record does not establish those changed interaction paths.

The routing regressions use fake sessions and synthetic transcripts; they
make no model or paid-generation request:

- `tests/voice-destinations.test.tsx`: agent-first Camera-shaped requests,
  StrictMode duplicate prevention, refusal without prompt fallback, pinned
  corrections, repeated notes, explicit rerouting and unavailable prompt fields.
- `tests/voice-session-route.test.ts`: selected-session sends, ended/refused
  session holds, pending messages, transcript validation and project changes
  before and during a lookup.
- `tests/voice-destination-store.test.ts`: validated preference persistence,
  agent default, session identities kept out of storage, late-result selection
  protection and refused browser storage.
- `tests/voice-hosted.test.tsx`: the hosted microphone explanation and no
  microphone or transcription request, including uncertain runtime detection.
- Existing capture, language, dictionary, intent-parser, server, setup and
  agent-send tests cover their respective unchanged boundaries.

These checks do not establish microphone hardware quality, browser layout or
GPU execution. Desktop/phone overflow, keyboard focus, repeated recording and
bubble/deck entry points need a capable-browser visual check before release.
`node scripts/check-voice-overlay.mjs` includes the explicit destinations,
repeated agent notes and corrections, prompt dictation, recording, language and
paid-approval fixtures. Its browser execution remains a separate visual gate.

## Not yet

- A message reaching a Terminal agent that is idle at its prompt: it arrives
  with the agent's next Genobi tool call, not as typed input in the window.
- Direct transcript-to-command execution: the selected agent drives tools;
  explicit prompt dictation and Camera parsing only prepare inputs.
- Spoken confirmation ("generate", "go") to press Generate: voice stops at the
  priced button for now.
- Spoken Edit and Upscale requests, and a spoken camera move or duration ("a
  five second video"): the parser reads a medium, a model and a subject only.
- A dictionary editor in the studio, and suggestions from corrections (X
  Console has both).
- Holding a key to talk.
- Real microphone hardware: earlier browser checks used Chrome's fake device
  and fixture routes; the transcription pipe used synthesised speech through
  the server, not a person at a microphone.
