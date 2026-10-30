---
name: genobi-teaser-run
description: Recreate the Genobi teaser end to end as a reproducible run - analyse the track, derive every shot and overlay from the brief's storyboard, the analysis and the capture log with the decision rules, keep every on-screen word to the claim rules, write and verify the cut JSON, render it, review the contact sheet and save memory - then repeat it from the first run's memory alone. Written for a weaker open model (Hermes on DeepSeek). Nothing is generated or paid for.
license: MIT
compatibility: Needs this checkout with npm ci done, npm run build:mcp, a terminal, Node 22 or later, Chrome and FFmpeg for the render, and the local studio started with keys that cannot spend.
metadata:
  version: "0.1.0"
  template: "genobi-teaser"
  tier: "Open"
  tags: "agents, director, sound, verification"
  docs: "docs/genobi-teaser-run/README.md, docs/genobi-teaser-run/decision-table.md, docs/genobi-teaser-run/claims.md, docs/genobi-teaser.md"
---

# Genobi teaser run

You recreate the Genobi teaser: a two-minute cut of the studio in use, set to
the owner's track, written as one JSON file (`cut.json`) that the Director
renders. You do not generate, quote or pay for anything. Every number you
need is in a file or comes from a command below. **Do not guess a number.
If a step's output differs from what this skill says to expect, stop, write
what you saw in `memory.json` (a checkpoint with `step` and `summary`) and
tell the person.**

The kit is `docs/genobi-teaser-run/` (its README is the overview). Files you
read: `brief.json`, `track-analysis.json`, `decision-table.md`, `claims.md`,
`examples/*.json`, and the capture log through the helper. Files you write:
only inside your run folder. Step 9 builds and imports a separate bundle.

**Never open another cut.** You derive the teaser; you do not copy it. Do not
read `shared/templates/genobi-teaser.cut.json`, anything under `tests/fixtures/`, another run's folder (run B reads
only `from-a.memory.json`), or old versions through `git show` or `git log
-p`. The verifier fails a copied cut (`copied-reference`).

## Rules (read before step 1)

1. Never run `genobi quote`, `genobi submit`, an upscale or any command not in
   this skill. Never press Generate, Submit, Approve or Start anywhere.
2. Write only inside `.local/teaser-runs/<run>/`. Step 9 imports a ZIP;
   it never changes a tracked template.
3. Every on-screen word comes from `claims.md`'s approved table. New words
   need the person's yes first (step 7).
4. Save memory as you go (step 11's format): a decision when you build a
   section, a checkpoint after every step. Never mark a step done that did
   not finish.
5. Run commands from the checkout root. Set `GENOBI_URL` to the studio the
   person named (for example `http://127.0.0.1:4417`); only the render
   (step 9) and project memory (step 11) use it.
6. Use `node plugins/genobi/server/genobi-cli.mjs` for genobi commands. Below
   it is written `genobi`. Run it with `GENOBI_AGENT_SESSION=1` in front, as
   the prompt shows: that marks you as an agent, so the studio refuses spending
   for you. The hard stops are the studio's dummy keys and `genobi submit`
   needing an accepted quote and `--confirm`; the mark is one more, not the
   only one.

## Step 1. Make the run folder

```sh
mkdir -p .local/teaser-runs/a/render
cp docs/genobi-teaser-run/brief.json .local/teaser-runs/a/brief.json
```

Write `.local/teaser-runs/a/memory.json` with this content, filling `date`
and the runner from your own session (the profile and the model id exactly as your banner
shows it):

```json
{
  "schema": "genobi-teaser-run-memory/1",
  "runId": "a",
  "date": "YYYY-MM-DD",
  "runner": {
    "agent": "hermes",
    "model": "deepseek/deepseek-v4.1-flash",
    "provider": "nous",
    "profile": "<the Hermes profile you run in>"
  },
  "startedFrom": "docs/genobi-teaser-run/brief.json",
  "brief": { "text": "<copy brief.json's text>" },
  "analysis": {},
  "decisions": [],
  "corrections": [],
  "checkpoints": [
    {
      "step": "brief",
      "summary": "Run folder made; brief copied.",
      "at": "<UTC time>"
    }
  ],
  "outputs": { "cut": "cut.json" }
}
```

Copy the three owner corrections from `examples/memory.example.json`
(`corrections`) into yours. They apply to every run.

## Step 2. Analyse the track

```sh
node scripts/teaser-run-helper.mjs analyse public/media/director-templates/genobi-teaser/teaser-track.mp3 > .local/teaser-runs/a/analysis.json
node scripts/teaser-run-helper.mjs sections .local/teaser-runs/a/analysis.json
```

`analyse` runs the studio's own analyser (`shared/audio-analysis.ts`, the
code behind `genobi audio-analysis` and the Editor's beat grid) on this
machine; it needs FFmpeg, not the studio. (The person's studio gives the same
report through `genobi audio-upload` then `genobi audio-analysis`, but an
agent-marked terminal cannot upload audio.) Read these numbers from
`sections`:

| Field                  | Expect                     | Means                                                     |
| ---------------------- | -------------------------- | --------------------------------------------------------- |
| `bpm`                  | 135                        | The cut's tempo (the measured 134.99, rounded)            |
| `firstDownbeatSeconds` | 1.775                      | The first bar line; cut beat 4 (`firstDownbeatBeat` 3.99) |
| `totalBeats`           | 269                        | The cut's length in beats (119.5 s)                       |
| `drops[].bar`          | 36, 76, 124, 156, 188, 236 | Drops on bar lines: each starts a section or a shot       |
| `offBar`               | 17.64, 57.68               | Drops between bars: do not cut on them                    |

A cut beat is seconds × 135 / 60; `node scripts/teaser-run-helper.mjs beat
<seconds>` and `seconds <beat>` convert. If `bpm` is not 135 or a bar differs,
stop (rule at the top). Otherwise copy `bpm`, `firstDownbeatSeconds`, the
drop bars and `offBar` into `memory.json` `analysis`, add `requiredCuts`
from `track-analysis.json` (12, 20, 36, 76, 92, 124, 140, 156, 188, 236, 260:
the drops plus the section changes the analyser does not report), and a
checkpoint `analyse`.

## Step 3. Read the storyboard

Open `brief.json` and read `storyboard.segments`. Each segment has `from`
and `to` (cut beats: the required cuts from step 2 and the owner's
timestamps), a `section` name, and one of: `cards` (no shots), `shots` (in
order) or `montage` (generation clips, 2 beats each). A shot with `shows` is
a studio recording: the two capture-log labels it must show. A shot with
`source` and `move` is the owner's ComfyUI recording. A shot with only an
`asset` is one of the owner's generations. `box`, `status`, `callout`,
`reveal`, `slam` and `hud` say which overlays go there and which approved
words they carry.

| Section       | Beats   | Music and timestamps                                        |
| ------------- | ------- | ----------------------------------------------------------- |
| `open`        | 0–12    | Intro                                                       |
| `first-shot`  | 12–20   | Intro                                                       |
| `generations` | 20–36   | Break 28–36                                                 |
| `make`        | 36–76   | Drop 36; camera controls at 60 (0:27); break 72–76          |
| `direct`      | 76–140  | Drop 76; Three.js at 81 (0:36); biggest change 92; drop 124 |
| `build-remix` | 140–192 | Drop 156; Paper Shaders and the taste layer from 172        |
| `agents`      | 192–236 | Break 232–236                                               |
| `final-drop`  | 236–260 | Final drop                                                  |
| `end-card`    | 260–269 | Outro, no bass                                              |

Record a checkpoint `sections`.

## Step 4. Derive the shots and save them

Follow `decision-table.md` rules 1 to 3, segment by segment. For each studio
shot with `shows` run `slice`, and for its camera move run `move` on the
box's target (or on `shows[1]` when there is no box):

```sh
node scripts/teaser-run-helper.mjs slice ui-camera families "h3 family"
node scripts/teaser-run-helper.mjs move ui-camera "upscale family"
```

Expected: `"sourceSeconds": 0.2, "beats": 11`, then
`{"x": 0.31, "y": 0.74, "zoom": 2.2, "ease": 2, "drift": 0.03}`. The owner's
ComfyUI recording (`ui-comfy`) has no capture log: take its `source` and
`move` from the storyboard. Then fit the segment (rule 2.5): add or remove
beats one at a time until the segment's shots add up to `to − from`. Write
each shot as:

```json
{
  "asset": "ui-camera",
  "label": "Camera · families",
  "sourceSeconds": 0.2,
  "startBeat": 43,
  "beats": 11,
  "cropY": null,
  "move": { "x": 0.31, "y": 0.74, "zoom": 2.2, "ease": 2, "drift": 0.03 }
}
```

A generation shot gets its `sourceSeconds` from rule 3 (0 on its first use;
later uses continue on), `cropY` 200 for `mix-*`, `"zoom"` only for the wide
clips, and no `move`. Check as you go: each shot starts where the previous
one ended, except across a segment of cards (172 to 192), where the cards
hold the frame.

**Save the shots now.** Write `.local/teaser-runs/a/cut.json` with the header
below, every shot and `"layers": []`. Step 5 reads the shots back from it.

```json
{
  "id": "genobi-teaser",
  "bpm": 135,
  "inPointSeconds": -0.037,
  "fps": 24,
  "width": 1920,
  "height": 1080,
  "beats": 269,
  "track": { "asset": "teaser-track", "seconds": 119.59 },
  "trackName": "Track · Trailer-Genobi",
  "shots": [],
  "layers": []
}
```

After each segment add one decision to `memory.json` (step 11) with the
numbers and the rule, for example:

```json
{
  "id": "d-make-1",
  "section": "make",
  "choice": "ui-gallery 36+7 from 0.2 s, ui-camera 43+11 from 0.2 s, ui-camera 54+6 from 6.9 s.",
  "because": "slice gives 7, 11 and 4 beats (22); rule 2.5 adds the missing 2 beats to the last studio shot that can grow, the prompt.",
  "source": "rule"
}
```

## Step 5. Derive the overlays

Follow `decision-table.md` rules 4 to 9. For every studio shot with `shows`:
a pointer and, when the storyboard has a `box`, a focus box, each pasted from
the helper and given the `view` of its shot's camera move:

```sh
node scripts/teaser-run-helper.mjs cursor ui-camera 0.2 11
node scripts/teaser-run-helper.mjs view .local/teaser-runs/a/cut.json 43
node scripts/teaser-run-helper.mjs labels ui-camera
node scripts/teaser-run-helper.mjs focus ui-camera "upscale family" "MODEL FAMILIES · LTX FLUX H3 UPSCALE" 8
node scripts/teaser-run-helper.mjs view .local/teaser-runs/a/cut.json 43 45
```

Add the printed `view` string to the layer's `parameters` as `"view"`. The
pointer path is `time:x,y` keys in seconds from the shot's start; the pointer
holds, then glides 0.7 s into each target the log moved to, and `view` keeps
it on the control while the picture moves. `labels` gives each log event's
time, which sets where a box starts (rule 4.2; for the one above:
floor((1.517 − 0.2) / 0.44444) = 2 beats in, so beat 45). Then the cards,
reveals, HUDs, statuses, callouts, slams and glitches by rules 4 to 8.

Start each layer from the example layer of the same recipe and change only
what the rules name:

| Recipe                                                | Lane               | Example file                   |
| ----------------------------------------------------- | ------------------ | ------------------------------ |
| `gen-title` (title)                                   | `cards`            | 01-open-title.json             |
| `gen-image`                                           | `cards` / `reveal` | 01-open-title.json             |
| `gen-status`                                          | `status`           | 01-open-title.json             |
| `ui-cursor`, `ui-focus`                               | `cursor`, `focus`  | 02-ui-move-beat.json           |
| `hud`, `slice-glitch`                                 | `hud`, `glitch`    | 03-montage-drop.json           |
| `kinetic`, `end-card`                                 | `impact`, `end`    | 04-end-card.json               |
| `gen-title` (callout)                                 | `callout`          | 05-comfy-callout-slam.json     |
| `paper-shader`, `space-hud`, `gen-image`, `gen-title` | `cards`            | 06-shader-and-taste-cards.json |

Every layer has `"opacity": 1` and a `"kind"`: `"filter"` for `slice-glitch`
(it changes the picture below it), `"graphics"` for every other recipe. A
wrong kind stops the Director loading the cut, so the render waits for ever
(the first dry run hit this). Cards carry `"card": true` (rule 5). Names and
ids are in rule 9. List the layers grouped by lane in rule 9's order; the
verifier refuses any other.

Record a decision per section for its overlays and a checkpoint `overlays`.

## Step 6. Save the cut

Put the layers into `cut.json` and save it. Record a checkpoint `cut` with
the counts (45 shots and 59 overlays when you followed every rule).

## Step 7. Check every word (claim rules)

Go through every layer's `text`, `line`, `steps`, `done`, `label`,
`eyebrow`, `title`, `subtitle`, `credit`, `credit1` and `credit2`. For each
string, answer `claims.md`'s checklist:

1. Is it in the approved table? Copy it exactly; next string.
2. Does it describe something the studio visibly does in this shot?
3. Does it name a model? Only "FLUX 3", only as the approved wording does.
4. Does it name a provider, claim "open", say where a clip was made, give a
   duration or result nobody produced, or boast? Then remove it.
5. New words: ask the person, quote their answer in `corrections`, and pass
   `--allow-new-wording` in step 8.

Record a checkpoint `claims`.

## Step 8. Verify

```sh
node scripts/verify-teaser-run.mjs .local/teaser-runs/a | tee .local/teaser-runs/a/verify.txt
```

You verify without a reference: the comparison with v2 is the person's, after
the run. Pass looks like:

```text
Teaser run check: .local/teaser-runs/a/cut.json
cut.json sha256 <64 hex characters>
269 beats, 119.54 s, 45 shots, 59 overlays, 127 layers in the Director
RESULT: PASS (2 warnings)
```

(The two warnings before step 9 are the missing render files.) On `RESULT:
FAIL`, fix the first failure, then run it again. Fix one failure at a time;
each has a `Fix:` line. The common ones:

| Code               | Usually means                                     | Do this                                                    |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------- |
| `shape`            | A field missing or a number written as a string   | Compare the object with the example's                      |
| `mix` gap/overlap  | A `startBeat` that is not the previous end        | Set it to the previous `startBeat + beats`                 |
| `mix` past source  | `sourceSeconds + beats × 0.444` > the clip        | Redo rule 3's `sourceSeconds` (the 0.5 restart)            |
| `parameters`       | A recipe parameter missing or out of range        | Copy the example layer whole, change only the named values |
| `layer-order`      | Layers not grouped by lane in order               | Reorder the list (rule 10)                                 |
| `kind`             | A filter recipe written as graphics, or back      | `slice-glitch` is a filter                                 |
| `copied-reference` | The cut matches v1, v2 or the bundled cut         | Derive it again from the rules; never open another cut     |
| `missing-cut`      | No shot starts on a required beat                 | Each segment must fill exactly `to − from` (rule 2.4)      |
| `claim`            | Words not approved, or forbidden                  | Step 7                                                     |
| `readable-hold`    | A studio shot under 3 beats, or words under 1.3 s | Boxes and statuses last at least 4 beats (rules 4.3, 4.4)  |

Record a checkpoint `verify` with the result line and the sha256.

## Step 9. Render

Build a separate editable bundle from your cut and v2's media
(`docs/genobi-teaser-run/media-v2.json`: the takes teaser v3 re-recorded
come from their archived v2 bytes), so the run verifies and renders on the
media v2 was cut on. The studio template and any local edits stay intact.

```sh
node scripts/prepare-teaser-run.mjs .local/teaser-runs/a
TEASER_BUNDLE=.local/teaser-runs/a/project.zip TEASER_URL=$GENOBI_URL node scripts/render-genobi-teaser.mjs .local/teaser-runs/a/render
```

The renderer imports that bundle before exporting. Expect 2869 frames. If a
cold studio times out preparing the preview, retry the render command once;
any other failure stops the run. Record the frame count and elapsed time in
a `render` checkpoint. No tracked file is replaced or restored.

## Step 10. Review the contact sheet

Open `.local/teaser-runs/a/render/contact-sheet.png` (twelve frames, 4 × 3,
one every 10 s). Show it to the person. Check each, and write what you see:

1. Frame 1 (0 s): the GENOBI title on black.
2. Frames 2–3: a generation, then the gallery or Camera with a pointer.
3. Every studio frame: one detail readable; nothing blurred into a smear.
4. No frame is a light page filling the screen (Scrolls must be zoomed in).
5. No words except approved ones; nothing cut off at an edge.
6. Frame 12 (about 110 s): the final-drop montage or the end card.

Then run the verifier once more with `--require-render`:

```sh
node scripts/verify-teaser-run.mjs .local/teaser-runs/a --require-render | tee .local/teaser-runs/a/verify.txt
```

Ask the person: keep, or what to change. Quote the answer in
`corrections`; a change goes back to the step that owns it. Record a
checkpoint `review`.

## Step 11. Memory format

Each decision: `id` (`d-<section>-<n>`, unique), `section` (one of the nine
ids in step 3), `choice` (what you wrote, with the numbers), `because` (the
rule, example or owner words that made you), `source` (`rule`, `example`,
`owner` or `memory`). Each checkpoint: `step` (`brief`, `analyse`,
`sections`, `cut`, `overlays`, `claims`, `verify`, `render`, `review`),
`summary`, `at` (UTC). Keep `outputs` up to date: `cut`, `verify`,
`render`, `contactSheet`. `examples/memory.example.json` is a whole one.

If the person linked a studio project (they give you a link code), also save
to the project's memory: redeem it with `genobi link-project`, read
`genobi context`, then one `genobi decision` per decision with `"source":
"interpretation"` (quoting the person when it is their correction) and a
`genobi session-checkpoint` after each step. Read `genobi schema decision`
first; never present your choice as the person's preference.

## Run B: repeat from memory

Run B proves the run repeats. It starts from run A's `memory.json` only.

1. Do step 1 with `b` for `a`, `"runId": "b"` and `"startedFrom":
"from-a.memory.json"`. Do not open any file of run A except
   `.local/teaser-runs/b/from-a.memory.json`.
2. Step 2: run the analyser again and compare with run A's `analysis`. They
   must be equal; if not, record both and stop.
3. Steps 3–6: build each section from run A's decision for it (same
   `choice`), using the decision rules and the helper as run A did. Copy run
   A's decision into yours with `"source": "memory"`.
4. Steps 7–10 as written, with `.local/teaser-runs/b`. The person compares
   B with A afterwards (`--reference <run A folder> --min-similarity 0.95`):
   the same memory and the same rules must give nearly the same cut.

## What worked, what did not (from the real runs)

Claude cut v1 (30 October 2026); the owner reviewed it twice. Each line is a
correction or a finding a run must keep:

- **Claims.** Cut 1 said "open weights" over a FLUX 3 shot, "Ready · local
  and open", "Shot ready · 10 s" and "Draft ready · 20 s on the beat" for a
  draft nobody made; all were replaced. Say what the studio did, never where a
  clip came from; the forbidden words are in `claims.md`.
- **Scrolls is light** (a paper page in a dark film): four beats at most,
  zoomed onto its dark cells or the camera dialog.
- **Readable holds.** Every interface beat zooms onto one readable detail and
  holds it at least 1.3 s.
- **3D presets.** The World Builder shots wanted a richer preset set;
  version 2 cut the repeated preset beats.
- **Recording UI takes.** The owner (30 October 2026): "the recordings
  should be made in higher quality initially, and use the new cards; all the
  animations, all the pace, everything is fine — they should be made exactly
  the same, but recorded in higher resolution". Replay the same takes with
  `scripts/capture-genobi-teaser.mjs` (3840 × 2160, CRF 18, refuses a smaller
  take, prints the commit) from a studio running the branch being cut, and
  check each take's first frame shows the current cards. Camera moves crop
  the take, so a low-resolution take becomes artifacts; an old branch shows
  old cards.
- **Resolution.** "A bit blurry, too low res": version 2 renders 1920 × 1080
  from interface footage recorded at 2×, with no AI upscale.
- **Version 2** (owner, after watching v1): 1920 × 1080 from 4K footage,
  camera moves on the slices, Paper Shaders and space.js at about 1:17, a
  TASTE LAYER credit listing what Genobi really ships, "camera controls" at
  0:27, "★ Three.js" at 0:36 where the vocal sings it, into the owner's own
  ComfyUI recording. The storyboard and these rules make a cut in this shape.
- **What worked first time:** cutting on the analysed grid (no listening
  needed for the cut points), the pointer path rule (all 19 v1 pointers
  reproduce from the log, and 15 of 16 v2 pointers; the 16th differs only in
  writing `1.0` for `1`), focus boxes from the log's element boxes, and
  generations on the drops.
- **Rules, not copies.** v1 and v2 were cut by eye. These rules are
  simpler, so a run that follows them lands about 0.77 similar to v2, not 1:
  that is the expected result, and the bar run A is held to.
- **Nobody listened.** Cut points are beat arithmetic on the analysed grid;
  say so if asked how the music fits.
