---
tags: [studio, backend, models]
summary: Installing local voice — a verified Qwen3-ASR already on the machine found and offered before any download, setup's Save & set up as the confirming click and the agent it starts once voice connects, plain sentences, a faint Rain and an optional intro video while it installs, the mic's guided panel with Use this one and Install new, the step list with per-step outcomes and pip's progress, cancellation, and manual setup with environment variables.
---

# Voice setup

How Genobi installs local voice: from the first-run setup's **Save & set up**,
from the header mic's panel, or by hand. What voice does once installed is in
[voice mode](voice-mode.md).

## From setup: Save & set up

Ticking **Add local voice, too** in setup installs nothing. When the summary
step opens with voice ticked, the page reads voice status and the installer's
own check (`GET /api/voice/setup`, which only mints a grant): Python 3.11 and
ffmpeg present. Only on a local server where voice is not set up yet and that
check says `supported` does the primary button become **Save & set up**;
otherwise the summary shows the check's reason and the primary is **Save &
start Genobi** (below). That click is the explicit confirmation. The page saves
the setup choices, asks the server for a fresh grant (`GET /api/voice/setup`),
then starts the install (`POST /api/voice/setup` with `confirmed: true`, the
grant's token and the folder typed on the summary step, or the server's
default folder when it is empty). On a hosted studio, or where voice is already
connected, the button does not appear.

Before that, ticking voice looks for the model already on this machine
([below](#before-any-download-a-model-already-on-this-machine)). Each verified
copy is a choice, **Use this one** and its folder, with **Download a new copy**
last; the first copy found is chosen by default, and **Save & set up** sends it
as `model` so nothing is downloaded. When none is found the summary says so and
**Save & set up** downloads. A click before the search answered waits for it.

The default folder is visible, never a dot-folder: `models/` inside the
repository checkout the server runs from (ignored by git), or the `Documents/Genobi` folder in the user's home directory
when the checkout cannot be written (`defaultVoiceFolder` in
`server/voice-discovery.ts`). The summary and the mic's panel show it; the
folder field overrides it. Earlier installs in `~/.genobi`, the old default,
are still found.

The summary step shows the installer's own progress, rendered by the same
component as the mic's panel (`src/voice/VoiceInstallProgress.tsx`). The
dialog may be closed while it runs: the install lives in a page-wide store
(`src/voice/install-store.ts`) that keeps reading `GET /api/voice/setup/progress`,
and the header mic marks it (`data-installing`) and opens on the same steps and
Cancel. When the install reaches Ready the page sends `POST /api/voice/prewarm`,
then tells the mic and the setup summary to read voice status
again, so voice reads connected and the mic is live.

### While it installs

The summary does not leave a first-time person with a step list alone. While
the install runs (`src/setup/InstallWait.tsx`):

- **Plain sentences, one at a time**, under the progress: the welcome first
  (`shared/welcome.ts`, the same text the agent bubble can show), then what is
  installed, what voice does and what it will feel like
  (`VOICE_MESSAGES` in `shared/install-messages.ts`): the model and its
  runtime, "you press the mic and speak, and a local model writes down what
  you said", that the recording never leaves the machine and only the text
  goes where it is sent, that nothing runs until Generate, the model's size
  and that a checked copy is used instead of a download, that the window can
  be closed, and when the browser asks for the microphone. Fixed text, no
  model call. Each stays for a reading pace (300 ms a word, 6 to 30 seconds);
  after the last the install's sentences start again, without the welcome.
  **Pause** holds one and **Next** moves on.
- **The deck's Rain behind the progress**, drawn as characters only at a tenth
  of the accent's strength on the panel (`src/deck/AsciiBackdrop.tsx`, the
  same `rain` program from `shared/ascii/programs.ts` at 12 frames a second),
  hidden from assistive technology and still under reduced motion. The running
  step's mark is the cli-spinners `dots` frame the studio already ships
  (`src/components/Spinner.tsx`). Both are decoration: bytes appear only on the
  download step and package counts only on the runtime step, as the installer
  reports them, and the backdrop and sentences add no figure.
- **"Watch the video while it downloads"**, a card with the intro video,
  only when the local server has an address for it: `GENOBI_INTRO_VIDEO_URL`,
  an https address or a path on the studio such as `/media/intro.mp4`, read at
  start and answered by `GET /api/settings/intro-video` (`{ "video": … }`,
  `null` when unset; the studio's header required). An address that is not
  https or a studio path, holds a user name or password, or is longer than
  2,048 characters reads as none (`shared/intro-video.ts`). With none, or on
  the hosted studio, which has no such route, the card does not exist. The
  video has controls and never plays by itself.

`tests/setup-install-wait.test.tsx` checks the sentence order (the welcome
first and once, then round the install's sentences), the hold, the welcome's
length, the Rain backdrop hidden from assistive technology, the spinner on the
running step with no figure the installer did not report, and the video card
absent without an address and without autoplay with one;
`tests/intro-video-route.test.ts` checks the route.
`node scripts/check-install-wait.mjs` (against a local studio, `STUDIO_URL`;
every API request a fixture, so nothing installs and no video is fetched)
opens the summary at 1440 and 390 pixels wide, before an install and during
voice's and Hermes' installs, without and with a video address, and checks
the welcome first, Next, the faint hidden rain, the running step's spinner, no
sideways overflow, named controls, and a video that is paused with no
autoplay.

The browser asks for the microphone only on the first press of the mic. Setup
never calls `getUserMedia`; if the mic's panel is open when the install
finishes, it shows **Start using Voice Mode** instead of starting a recording.

Cancel, on the summary step or the mic's panel, sends `DELETE /api/voice/setup`.
The server stops the step, removes this attempt's folder and leaves the saved
configuration alone; **Save & set up** returns, and the next attempt asks for a
new grant and installs into a new folder.

The authority model is unchanged: the grant is server-issued, bound to the
browser session, used once and expires after ten minutes, and the server
refuses a start without `confirmed: true`. The change is only where the
confirming click lives. The mic's **Install Voice Mode?** panel stays as the advanced path, with the
macOS folder picker. Taste no longer contains voice settings.

### Setup ends by starting the agent

The summary has one primary action, and it ends by starting one agent
(`src/setup/start-store.ts`). The step reads `GET /api/agent/status` and the
harness sign-in rows: with the chosen harness available (and not reported
signed out), the primary is **Save & set up** when voice is ticked and
installable, otherwise **Save & start Genobi**. It saves the choices, installs
voice when ticked and waits for the install to reach connected (`VOICE_READY`,
after the prewarm), then reads the agent status again and starts a Project
prompt session (`POST /api/agent/sessions`, typed, `setup: true`, the choices
as the studio context). The session opens in the Genobi bubble; the dialog
closes, and may already have been closed while voice installed. If the install
fails or is cancelled, the primary becomes **Start Genobi anyway**, and nothing
starts until it is pressed.

The page never hands the agent a folder. The folder typed here only says where
to install; the server adds the folder it is configured with, once a model is
found there, to the agent's brief ([agent sessions](agent-setup.md)).

When the harness cannot start (status unavailable, another harness set by
`GENOBI_AGENT_RUNNER`, signed out, or Codex, which the studio cannot run yet)
the summary shows the reason with **Sign in** and **Check again** in place of a
link, and nothing starts; **Save & set up** still installs voice when ticked.
The agent and run-location parts of the summary link no guide. When voice is
ticked but the installer's check says this machine cannot install it, the
prompt says so ("requested, but this machine cannot install it").

Setup's start is local only. On the hosted studio there is no sign-in route,
so the summary says setup starts the agent from the local studio and starts
nothing, even when a paired runner is online and the relay reports it
available. The relay refuses `setup` too (`relayRequest` in
`shared/runner-relay.ts`, which both the Worker and the local runner
connection apply), and the local server drops the voice folder from the setup
facts of any relayed start regardless, so a machine path can never reach the
hosted session view or D1.

## Before any download: a model already on this machine

When voice is ticked in setup, or the mic's install panel opens, the page asks
`GET /api/voice/setup/found` (the studio's same-origin header required, so
another site cannot start a search; refused to an agent's session; never
cached).
The server (`discoverVoiceModels` in `server/voice-discovery.ts`) collects
candidates in this order, without duplicates:

1. `GENOBI_VOICE_MODEL` and the model the server is configured with.
2. Earlier Genobi installs: private `genobi-voice-*` children of the default
   folder and of `~/.genobi`.
3. A bounded search of the home folder for folders named exactly
   `Qwen3-ASR-0.6B`: on macOS Spotlight (`/usr/bin/mdfind -onlyin ~ -name
Qwen3-ASR-0.6B`, through `execFile` with a 10 s timeout and no shell), kept
   only for exact names under home outside hidden, `node_modules`, `.git` and
   `Library` folders; elsewhere, or when Spotlight fails, a breadth-first walk
   six folders deep that reads at most 20,000 folders, never follows a link and
   skips the same folders. At most eight candidates.

A candidate is offered only when it verifies: a real folder (not a link) owned
by this user and not writable by group or others, holding every pinned file as
a regular file at its pinned size (checked first, so a wrong copy costs no
hashing) and pinned SHA-256, each read through one `O_NOFOLLOW` handle. A
verified folder whose files have not changed (inode, size and change time) is
not hashed again while the server runs. Only folders the last search verified
may be adopted: `POST /api/voice/setup` refuses any other `model`.

Adopting a copy ("Use this one") is the existing reuse path: a new private
`genobi-voice-*` install in the chosen folder, each file verified again and
hard-linked (copied where linking is refused) from the found folder, which is
left as it was. Paths go only to the person's own local studio session; they
are never logged.

## Guided installation

On a local server without voice configured, the header mic opens **Install Voice
Mode?** It shows Qwen3-ASR-0.6B, the model-only download (1,880,560,703 bytes,
1.88 GB decimal), the additional runtime download (about several hundred
megabytes; the pinned wheels are not measured) and a destination folder. It
first looks for the model on this machine: each verified copy gets **Use this
one**, and **Install new** (the download path) is enabled only once the search
has answered, as the primary when nothing was found. Choose a folder with the
native picker on macOS, or enter an existing absolute folder path. Nothing
installs before **Use this one**, **Install new** (or setup's **Save & set up**).

Setup requires Python 3.11 and ffmpeg already on this machine; when either is
missing the dialog explains the prerequisite and disables Install. It creates a
new private child folder, then runs six steps in this order, each reported with
its outcome (`done`, `skipped`, `running`, `pending` or `failed`;
`shared/voice-install.ts`):

1. **Prepare your voice environment**: an isolated virtual environment.
2. **Check for the model**: the chosen copy, or an earlier install in the
   chosen folder, linked in when every file verifies. It reads "Model found
   locally" with the folder, or "Not found on this machine".
3. **Download Qwen3-ASR**: shown as "skipped, model found locally" (ticked,
   greyed) when step 2 found it; otherwise it downloads, keeping any partial
   files that verify, with a byte progress bar.
4. **Install the voice runtime**: `pip install` of the pinned requirements
   with `--progress-bar off`. Its stdout lines go to a parser and nowhere else
   (`pipProgress`), which keeps only package names: the step shows "Collecting
   torch · 12 packages so far", "Downloading …" and "Installing 38 packages".
5. **Load the model**: the worker's `--check`, then a real load and warm-up.
6. **Activate Voice Mode**.

Progress uses those completed steps and actual bytes, never a timer, and "You
can close this and keep working." stays under it. A failure marks the step
that failed and removes only that new installation folder; a cancellation
removes it too.

After validation it atomically saves private `.local/voice.json` configuration
and restarts the voice worker in-process. No manual environment editing or app
restart is required. The user can close setup while it runs and reopen it to
inspect progress or cancel. Other sessions cannot cancel the job. The existing
loopback/Host/Origin checks apply. Hosted builds have no installer or
transcription routes.

### Earlier installs in the chosen folder

At step 2, without a chosen copy, the installer looks in the chosen folder for
earlier installs: its own `genobi-voice-*` children that are real directories owned by
this user and not writable by group or others. Each of the eight pinned files
must be a regular file owned by this user, at the pinned size, with the pinned
SHA-256 (`MODEL_FILES` in `server/voice-model.ts`). The model folder inside each
install passes the same directory checks, and each file is opened with
`O_NOFOLLOW` and checked and hashed through that one handle. A file that
verifies is hard-linked into the new install (copied if linking fails); a file
that is missing, partial, the wrong size or the wrong hash is downloaded again.
When every file verified, nothing is fetched: step 2 reads "Model found
locally" and the download is skipped. When only some verified, the download
step keeps them and fetches the rest.

The runtime is still built fresh each time (a new virtual environment and the
pinned requirements), so a run with the model present skips the 1.9 GB
download but still spends the time `pip` takes; step 4 now shows what pip is
doing while it does.

The pinned official snapshot is
`5eb144179a02acc5e5ba31e748d22b0cf3e303b0`, checked against
[Qwen's model files](https://huggingface.co/Qwen/Qwen3-ASR-0.6B/tree/5eb144179a02acc5e5ba31e748d22b0cf3e303b0)
on 21 October 2026. `server/voice-model.ts` records the eight runtime files,
their sizes and their SHA-256: the weights' hash is the Hub's LFS id, and the
seven small files were hashed from that revision on 27 October 2026 (their git
blob ids match the Hub's tree). Downloads are checked against the same hashes.
Setup uses the network only for installation; recording and transcription
remain local. This installs speech recognition, not speech synthesis or an
agent runner.

### Verification

Fake subprocess, download and worker adapters check confirmation, saved
configuration, cancellation cleanup and failed model loading
(`tests/voice-install.test.ts`). A fake three-file model with its own hashes
covers a model already on disk (verified and linked, no request), absent
(downloaded), partial, wrong-size or wrong-hash files (downloaded again), a
linked file (not trusted) and cancel then a clean retry, both through
`downloadVoiceModel` and the installer (`tests/voice-model-reuse.test.ts`,
`tests/voice-install-reuse.test.ts`). `tests/setup-voice-install.test.tsx`
clicks setup's **Save & set up** and checks the grant read, then the start with
`confirmed: true`, progress to Ready, the prewarm and that the microphone was
not requested. `tests/setup-start-agent.test.tsx` clicks the summary's primary
with a fake server: with voice off one setup session starts with the expected
prompt and no key or folder; with voice on it starts only after
`VOICE_READY`; a failed install starts nothing until **Start Genobi anyway**;
an unavailable harness shows its reason and Sign in, and starts nothing; the
hosted studio with a paired runner online starts nothing.
`tests/agent-setup-brief.test.ts` checks that the brief's licence stance and
voice folder come from the validated context and the server's own voice
settings, and that a relayed start never names the folder;
`tests/runner-relay.test.ts` checks that the relay refuses `setup`.
`tests/voice-discovery.test.ts` covers the search with fake candidates: a
verified copy offered with its `~` label, a wrong-size copy, a linked folder, a
linked file and a shared-writable folder refused, `GENOBI_VOICE_MODEL` and
earlier installs first, the walk's depth, folder count, result count, skipped
and linked folders, Spotlight's answers filtered and the walk used when it
fails, the default folder, and **Use this one** linking the copy into a new
install with the download skipped and never called, while an unsearched folder
is refused. `tests/voice-runtime-progress.test.tsx` parses pip's lines, passes
a child's stdout lines (not stderr) to the callback, folds them into the
install's state and renders the step list found locally and not found.
`tests/voice-found-panel.test.tsx` renders the panel's search states.
`tests/setup-voice-install.test.tsx` checks that **Save & set up** searches
first, sends the first found model, and sends none for **Download a new
copy**.

On the owner's machine the real search (Spotlight) found one folder named
`Qwen3-ASR-0.6B` under the home folder in about 0.2 s, and it verified against
the pinned sizes and hashes in about 1.2 s (read-only; nothing was linked or
installed). The second Qwen3-ASR folder there is the 1.7B model, which the pins
do not cover, so it is not offered. A full model and runtime download, a real
`pip install` read through the parser, an adopted copy loading in the worker,
real transcription from this installer, and a real harness started from setup
have not been run.

## Manual setup and existing installations

You need ffmpeg, a Python 3.11 virtualenv for the worker, and a Qwen3-ASR model
folder. [Qwen3-ASR-0.6B](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) and
[1.7B](https://huggingface.co/Qwen/Qwen3-ASR-1.7B) are Apache-2.0 (model cards
checked 21 October 2026); see
[the licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md). The pins in
[`server/voice-worker/requirements.txt`](https://github.com/koshimazaki/Genobi/blob/main/server/voice-worker/requirements.txt)
are X Console's, verified there with Qwen3-ASR-0.6B on Metal (M1 Max, macOS
14.6).

```sh
python3.11 -m venv ~/.genobi/voice-env
~/.genobi/voice-env/bin/pip install -r server/voice-worker/requirements.txt
# Download a model once, by hand; the worker itself never goes online.
~/.genobi/voice-env/bin/huggingface-cli download Qwen/Qwen3-ASR-0.6B \
  --local-dir ~/.genobi/models/Qwen3-ASR-0.6B
# Check the packages, Metal and the folder:
~/.genobi/voice-env/bin/python server/voice-worker/voice_worker.py \
  --check ~/.genobi/models/Qwen3-ASR-0.6B
```

### Configuration

Three environment variables, read when the server starts. Absolute paths.

| Variable                | Holds                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GENOBI_VOICE_PYTHON`   | The worker's Python, with the requirements installed                                                                |
| `GENOBI_VOICE_MODEL`    | The Qwen3-ASR model folder (it must hold `config.json`)                                                             |
| `GENOBI_VOICE_LANGUAGE` | Optional: the language hint for a request that names none, such as `English` or `auto`; detected per chunk if unset |
| `FFMPEG_PATH`           | Optional, shared with the media tools; otherwise `ffmpeg` on `PATH`                                                 |

```sh
GENOBI_VOICE_PYTHON=~/.genobi/voice-env/bin/python \
GENOBI_VOICE_MODEL=~/.genobi/models/Qwen3-ASR-0.6B \
GENOBI_VOICE_LANGUAGE=English \
npm run dev
```

If X Console's voice mode is already set up, point these at the `pythonPath`,
`modelPath` and `ffmpegPath` in its `Voice/engine.json`; the environment and
model are the same. A successfully installed `.local/voice.json` takes precedence for the Python and
model paths on startup. Remove that private settings file to return to manual
environment paths. Language and ffmpeg still use the environment.

`GET /api/voice/status` says whether each part is in place, as booleans, and
what to set when one is missing. It also lists the languages a transcription
may name (`languages`, `auto` first) and the server's default (`language`). A
`GENOBI_VOICE_LANGUAGE` the model does not know leaves voice not set up, with
that variable named in the message. The unconfigured Voice button opens guided installation. Manual environment
changes still require a server restart; a `GENOBI_VOICE_MODEL` that verifies is
also offered by the guided installation's search.
