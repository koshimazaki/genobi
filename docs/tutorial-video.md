---
tags: [director, templates, studio, voice]
summary: The screenplay and recipe for a 45-second tutorial video of the studio (with a 30-second cut), made in Genobi itself - eight beats from voice to the end card, what each says and shows, and how to capture, cut and render it.
---

# Tutorial video

**Status:** screenplay and recipe only, 3 November 2026. Nothing has been
captured or rendered yet, and no paid step is part of the piece.

A short tutorial someone can watch to learn how the studio works, going
section by section: this part is for this, this part is for that. The owner's
words (3 November 2026): _"thirty seconds or one minute, so they can just watch
it as a tutorial how the app works, which might be worth generating with Genobi
as well, just going slide by slide: this section is for this, this is for
this, this is voice first, you can do this, but you also can just use your own
favourite harness, you don't have to use voice. UI is for inspection mainly,
and then for viewing the assets."_ So the piece says three things: Genobi is
voice first; any agent harness works just as well; the interface is where you
inspect results and look at your assets. It is cut in the Director as a
**mix** template, like the [Genobi teaser](genobi-teaser.md), from the
studio's own screens.

## The beats

The full cut is 45 s; the 30 s cut keeps all eight beats and shortens each
(column **30 s**). Spoken lines are at most 12 words. Every claim is checked
against the [capability map](capabilities.md) as of 3 November 2026.

| #   | Seconds (45 s) | 30 s | On-screen section                          | Spoken line                                                           | What the viewer sees                                                                                                                                                                                              |
| --- | -------------- | ---- | ------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 0–5 (5)        | 4    | Studio header, the mic                     | "Say what you want. Genobi listens on your machine."                  | The header microphone opens the voice pill with its LED waveform; the transcript fills in and goes **To** the agent. Caption: "Voice · local studio · transcribed on this machine".                               |
| 2   | 5–11 (6)       | 4    | Genobi bubble; Project Tools · Development | "Don't want voice? Bring your own agent: Hermes, Claude Code, Codex." | The same direction typed instead; the bubble shows the agent's updates. Three labels: Hermes (open source, on an open model), Claude Code, Codex, each "through the Genobi plugin".                               |
| 3   | 11–17 (6)      | 4    | Assets rail (Project, Inspirations)        | "Drop your files into Assets, then tell the agent what they are."     | Files imported into the Assets rail land under Project and Inspirations; the next line to the agent says "the PNG is the hero, the MP3 is the track".                                                             |
| 4   | 17–23 (6)      | 4    | Camera and its gallery                     | "The studio is for inspection: what came back, recreate, queue."      | A finished take plays in the gallery; **Recreate** restores its prompt, settings and references; one word changes and Generate shows its price before anything runs. Caption: "Paid steps wait for your Approve". |
| 5   | 23–29 (6)      | 5    | Director, then Editor                      | "Director and Editor hold the cut you keep editing."                  | The project in the Director, then the same document as Editor lanes; a clip is trimmed by hand and the agent's next read shows the edit.                                                                          |
| 6   | 29–35 (6)      | 3    | 3D World Builder                           | "Build the shot in 3D, and hear the room."                            | A World Builder set, the camera moving through it, the acoustics readout; **Capture take** puts the MP4 and its WAV into the project's assets.                                                                    |
| 7   | 35–41 (6)      | 4    | Taste (/taste), a result's credits         | "Taste and licences: every result says how it was made."              | The Taste page with its references and creator credits; a result's licence report and its "How it was made" list.                                                                                                 |
| 8   | 41–45 (4)      | 2    | End card                                   | "Genobi: the studio for AI ninjas."                                   | The GENOBI wordmark traced glyph by glyph, then the line; the matrix dot loader settles.                                                                                                                          |

Totals: 5 + 6 + 6 + 6 + 6 + 6 + 6 + 4 = **45 s**; the 30 s cut is
4 + 4 + 4 + 4 + 5 + 3 + 4 + 2 = **30 s**. Both are snapped to the track's beat
grid when cut (step 3 below), so a beat may move by a fraction of a second.

### What the piece may and may not say

- **Voice is local-studio only.** Speech is transcribed on the person's own
  machine by Qwen3-ASR; the hosted studio has no transcription worker and never
  asks for the microphone ([voice mode](voice-mode.md#on-the-hosted-studio)).
  Beat 1's caption says "local studio"; no shot of the hosted site shows a mic
  that works. Real-microphone checks are still open in the capability map, so
  the piece does not claim voice is verified.
- **Approvals happen in the studio.** An agent's paid step appears in the
  bubble with its plan and price, and only **Approve** runs it, once
  ([quote, approve, then spend](agent-approvals.md)). The CLI equivalent is
  `submit --confirm`. The piece shows the caption, never a pressed Approve.
- **Hermes is the open-source harness.** Hermes runs on an open model (through
  Nous, or a local server such as Ollama); Claude Code and Codex run on the
  person's own subscription. The plugin under `plugins/genobi/` carries the
  skills and the MCP server for all three ([agent sessions](agent-sessions.md)).
- **"Every result says how it was made"** is the owner's line. On screen it is
  carried by what exists: a result's licence report (Taste layer, project
  memory and licences, implemented) and a gallery card's **How it was made**
  list (the teaser and the mixes). Do not add a claim beyond those two.
- **Name only the models on screen.** If a generated take appears in beat 4,
  its caption names the model that made it and nothing else, as in the teaser.
- **No Genobi feature is presented as planned-but-done.** The Desktop app,
  Gen-Mod and Layout-to-Render are planned; none appears.

## How to make it

The recipe an agent follows to make this piece, in the style of the teaser's
[How to repeat it](genobi-teaser.md#how-to-repeat-it). Save memory as you go
(AGENTS.md): the brief above as a `decision` interpretation quoting the owner,
a `session-checkpoint` after each capture, cut and render, and Taste proposals
for rules that generalise (the owner activates them).

**Start from:** the Genobi teaser mix, `/director?example=genobi-teaser`, on a
project copy. It already has what the tutorial needs: a cut written as data in
beats (`run: "mix"`), interface slices with camera moves, the pointer, focus
and zoom recipes, Transitions.dev titles and the GENOBI end card. The tutorial
is a new, shorter cut beside it, not an edit of the teaser:
[`shared/templates/genobi-teaser.cut.json`](https://github.com/koshimazaki/Genobi/blob/main/shared/templates/genobi-teaser.cut.json)
and [`genobi-teaser.ts`](https://github.com/koshimazaki/Genobi/blob/main/shared/templates/genobi-teaser.ts)
are the pattern for a `tutorial-video.cut.json` and its template, checked by
`checkMix` in [`mix.ts`](https://github.com/koshimazaki/Genobi/blob/main/shared/templates/mix.ts).
Neither file exists yet.

**Inputs:** the studio's own screens, the track, the recorded voice, the
bundled fonts and the free Transitions.dev transitions already vendored for
the teaser.

### Screen captures per beat

The render is 1920 × 1080 at 24 fps. Each take is recorded at 3840 × 2160 (2×
the render, the teaser's rule) so a camera move into one control keeps native
detail. Record from your own local server, on the branch being cut merged with
main, with keys that cannot spend, as
[`scripts/capture-genobi-teaser.mjs`](https://github.com/koshimazaki/Genobi/blob/main/scripts/capture-genobi-teaser.mjs)
describes; that script aborts every POST that could spend. Its shots live in
[`scripts/genobi-teaser-shots.mjs`](https://github.com/koshimazaki/Genobi/blob/main/scripts/genobi-teaser-shots.mjs);
a tutorial shot list beside it is needed for the beats the teaser has no take
for.

| #   | Take                                           | Source                                                                                                                                                                                              |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Header mic, voice pill, transcript, To         | The owner's own screen recording of a local studio with a real microphone (a headless capture has no microphone); one short note, sent To the agent.                                                |
| 2   | Bubble with a typed direction; Development tab | New shot: type the same direction, open Project Tools · Development to show the Hermes, Claude Code and Codex entries. Do not start a session in the capture.                                       |
| 3   | Assets rail, a drop, the line to the agent     | New shot: import a PNG and an MP3; they land under Inspirations and Project. The agent line is typed, not sent.                                                                                     |
| 4   | Camera gallery, Recreate, priced Generate      | `ui-camera` for the Camera view; a new shot for Recreate on a bundled result, ending on the priced Generate, not pressed. A Queued card only from the owner's own recording of a run they approved. |
| 5   | Director, then Editor                          | `ui-director` and `ui-editor` from the teaser, re-recorded on the current cards.                                                                                                                    |
| 6   | World Builder, capture take                    | `ui-world` from the teaser, plus the acoustics readout and Capture take.                                                                                                                            |
| 7   | Taste page, licence report                     | New shot: /taste, then one result's licences and its How it was made list.                                                                                                                          |
| 8   | End card                                       | No take: the `gen-title` recipe and the matrix dot loader, drawn in the Director.                                                                                                                   |

Never in any take: Generate, Submit, Approve or a queued prompt that reaches a
provider; never the owner's own server or ComfyUI. Check each take's first
frame shows the current cards.

### Title style

The teaser's look, unchanged: Transitions.dev free-tier titles (UI generation
text, shimmer text, texts reveal; the free tier only, run byte for byte) and
Genobi's own recipes (`teaser-gen-title`, `teaser-focus`, `teaser-zoom`,
`teaser-cursor` in
[`docs/director-bundle/example/graphics/`](https://github.com/koshimazaki/Genobi/tree/main/docs/director-bundle/example/graphics)).
The `gen-title` wordmark is the end card.
One label per beat, naming the section (VOICE, YOUR AGENT, ASSETS, CAMERA,
DIRECTOR · EDITOR, 3D · SOUND, TASTE), typed in from the left and held at
least 1.3 s once fully typed. Bundled fonts only (Instrument Sans, IBM Plex
Mono, Pixelify Sans, Nokia Cellphone FC), as the teaser uses them.

### The track

The owner picks it. The default is a 45-second section of "Trailer-Genobi",
already bundled with permission for the teaser (135 BPM, so a beat is 0.444 s
and 45 s is about 101 beats), starting on a bar line; the owner confirms which
section, or supplies another track. It sits under the voice, ducked while a
line plays, and the mix is normalised to about -14 LUFS, the mixes' convention.
MiniMax Music 3 is not used: it is a paid route with no song generated yet.

### The voice

**Recorded voice.** There is no text-to-speech node or tool in this
repository, so the eight lines are read and recorded by a person (the owner,
or a voice they choose), one WAV per line, then imported as production audio.
Place each line by measurement: its duration against its beat window, before
mixing; a line longer than its window shortens the line, not the beat.

### Export

- **Render:** Director **Render MP4** at 1920 × 1080, 24 fps, as
  [`scripts/render-genobi-teaser.mjs`](https://github.com/koshimazaki/Genobi/blob/main/scripts/render-genobi-teaser.mjs)
  does for the teaser (a tutorial render script would be its copy).
- **Master:** H.264 CRF 16, AAC 320 kb/s, both cuts (45 s and 30 s).
- **Gallery copy:** two-pass encode under 25 MiB (the Pages limit); the poster
  is a 1920 × 1080 JPEG of the end card with the wordmark fully drawn.
- **Captions:** an SRT of the eight lines beside the MP4, since many viewers
  watch muted.
- **Check:** a contact sheet of each render, and frames at every beat start;
  measure each spoken window's level so no line is buried.

### Steps

1. Record the brief as a `decision`; copy the teaser project.
2. Pick the track section; analyse it with
   [`shared/audio-analysis.ts`](https://github.com/koshimazaki/Genobi/blob/main/shared/audio-analysis.ts)
   and put a bar line on frame 0.
3. Snap the beat table to the grid: each beat starts on a bar where it can.
4. Capture the takes (table above); the owner records beat 1 and the voice.
5. Write the cut as data, both lengths; check frames in the Director preview.
6. Render, look at the contact sheet, and send it to the owner.
7. Log each correction below and checkpoint.

### Corrections log

One entry per correction, quoting the owner, dated, with what changed.

- _None yet._ The first cut has not been made.

**Rules carried from the teaser:** hold readable interface beats at least
1.3 s; record at 2× the render; bundled fonts only; free Transitions.dev
transitions only, unchanged; never spend in a capture; name only the models
that made what is on screen.

## Limits

- The beat table is a screenplay: nobody has timed the lines aloud, so a beat
  may need a shorter line once recorded.
- Beats 2, 3, 4 and 7 need shots the teaser does not have.
- Voice's real-microphone check is open; beat 1 shows the interface working
  in the owner's recording, not a verified claim.
