---
tags: [agents, director, verification]
summary: The teaser run kit - everything an agent on a weaker open model (Hermes on DeepSeek) needs to derive the Genobi teaser (version 2) end to end and prove it, with a repeat run from the first run's memory, a verifier, worked examples and a repeatable run sheet.
---

# Teaser run kit

The [Genobi teaser](../genobi-teaser.md) was cut by Claude. This kit lets an
agent on a weaker open model derive it again from a brief, prove it did, and
then repeat it from its own saved memory. A run never sees an earlier cut: it
derives every number from the brief's storyboard, the track analysis and the
capture log, and the verifier fails a copy. Hermes on DeepSeek V4.1 Flash is the
target ([Hermes runs](../hermes-runs.md)). Nothing in a run is generated,
quoted or paid for; the only cost is the agent's own tokens.

The procedure is the `genobi-teaser-run` skill
([`plugins/genobi/skills/genobi-teaser-run/SKILL.md`](https://github.com/koshimazaki/Genobi/blob/main/plugins/genobi/skills/genobi-teaser-run/SKILL.md)).
This page holds the files it reads, the repeatability protocol and the run
sheet.

| File                                                                                                             | What it holds                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brief.json`                                                                                                     | The brief and its `storyboard`: segments, what each shows, boxes, approved words                                                                      |
| `track-analysis.json`                                                                                            | The track measured with the studio's analyser: tempo, downbeat, drops, required cuts                                                                  |
| [decision-table.md](decision-table.md)                                                                           | The decision rules: how every shot length, source time, framing and overlay value is derived                                                          |
| [claims.md](claims.md)                                                                                           | The approved on-screen wording, what never to write, the checklist                                                                                    |
| `examples/01-open-title.json` … `06-shader-and-taste-cards.json`                                                 | Worked sections from the rule-derived dry run: inputs, decisions with their arithmetic, the cut excerpt; 06 holds the owner's cards to copy unchanged |
| `examples/memory.example.json`                                                                                   | A complete run memory, the shape run B starts from                                                                                                    |
| `prompts/run-a.txt`, `prompts/run-b.txt`                                                                         | The exact first message for each run                                                                                                                  |
| [run-log-template.md](run-log-template.md)                                                                       | The proof page each run fills in                                                                                                                      |
| [`scripts/verify-teaser-run.mjs`](https://github.com/koshimazaki/Genobi/blob/main/scripts/verify-teaser-run.mjs) | The verifier                                                                                                                                          |
| [`scripts/teaser-run-helper.mjs`](https://github.com/koshimazaki/Genobi/blob/main/scripts/teaser-run-helper.mjs) | The analyser run locally; sections; slice, move, view, pointer and focus values from the capture log                                                  |

**Owner side, never read by a run** (`tests/fixtures/teaser-run/`, with its
own README): `v2.cut.json`, the teaser as merged in the implementation update with the implementation update's typed-label holds, the target a run
is compared with (`--reference v2`); `v1.cut.json` and `v1-calibration.md`,
version 1 and its literal values (`--reference v1`); and `derived.cut.json`,
the rule-derived dry-run cut the tests hold the kit to. The prompts forbid
opening them.

The [showcase projects](../director-bundle/showcase/README.md) preserve v1
and v2 separately. This kit derives v2 (from the implementation update, with the 1.3 s hold on the
quote's box from the implementation update); v1 stays available as an option (below).

## The media a cut may use

Asset ids are the keys of v2's media (`media-v2.json`, the template's media
as v2 was cut; since teaser v3, the implementation update, the takes v3 re-recorded point at
their archived v2 bytes in `public/media/showcase/genobi-teaser/v2/`). The
verifier and the bundle both use it, so a run that verifies also renders;
lengths are what `checkMix` holds a slice to.

| Asset                                                         |                Seconds | Kind                                                                        |
| ------------------------------------------------------------- | ---------------------: | --------------------------------------------------------------------------- |
| `ui-gallery`, `ui-camera`, `ui-camera-control`, `ui-director` | 12, 13.625, 11, 10.167 | Studio footage (4K, 16:9), pointer log in `docs/genobi-teaser-footage.json` |
| `ui-editor`, `ui-directions`, `ui-world`, `ui-swords`         |  15, 10.208, 14, 8.625 | Studio footage                                                              |
| `ui-scrolls`, `ui-agent`, `ui-licences`, `ui-save`            | 9.167, 8.292, 9.083, 9 | Studio footage                                                              |
| `ui-comfy`                                                    |                     10 | The owner's ComfyUI recording; no pointer log                               |
| `character`, `product`                                        |            20.041 each | The owner's generations, wide: zoom 1.33                                    |
| `audio-visual`                                                |                 29.041 | Wide: zoom 1.317                                                            |
| `dimensions`, `signal`                                        |             23.145, 24 | Rendered pieces, 16:9                                                       |
| `library-01`, `library-03`                                    |            10.041 each | Library clips: zoom 1.023                                                   |
| `mix-01`, `mix-02`, `mix-03`                                  |              13.5 each | Square 1440 px: cropY 0–630                                                 |
| `teaser-track`                                                |                 119.59 | The track (audio)                                                           |

## What the verifier checks

`node scripts/verify-teaser-run.mjs <run folder | cut.json> [--reference v2 | v1 | current | <run folder>] [--min-similarity 0-1] [--allow-new-wording] [--require-render] [--json]`

It prints the cut's sha256, then exits 1 on any failure, each with a fix in
plain words. It never crashes on malformed input: a file that is not JSON, a
`null` or a wrong type anywhere is a `shape` finding.

- **Shape:** every field present with the right type.
- **Copied reference:** the cut matches the v1 or v2 cut or the cut bundled
  in `shared/templates` (90% of shots with their framing and 90% of layers with
  their values unchanged, whatever the names or order).
- **The Director's mix rules** (`checkMix`): shots tile on whole beats, no
  slice past its source, a card before the first shot and to the end, lanes
  never overlap, ids unique, the track long enough.
- **Limits:** 128 Director layers (each shot, a second layer for a shot with a camera move,
  each overlay and the track), 120 s.
- **Recipes:** every module registered, its kind (filter or graphics) as the
  registry says, its parameters valid against the registry's schema; stills
  exist under `public/`.
- **Timing:** `bpm` within 0.1 of the measured tempo; every shot start within
  50 ms of the analysed beat grid; a cut on every required beat (or a card
  holding it); slams on
  even beats; layers in lane order.
- **Claims:** every on-screen string approved, none forbidden ([claims](claims.md)).
- **Readable holds:** studio shots and words at least 1.3 s (slams exempt).
- **Memory:** `memory.json` in a run folder has the schema below and a
  decision per section.
- **Render:** `render/render.mp4` and `render/contact-sheet.png` exist
  (a warning, or a failure with `--require-render`).

With `--reference` it prints a similarity report: cuts on the same beats,
footage per section, overlay counts by recipe, wording kept, identical shots
(position, source time and framing), a score from 0 to 1, and the first 40
differences. `--min-similarity` turns a low score into a failure.

## The run's memory file

`memory.json` in the run folder, schema `genobi-teaser-run-memory/1`
(`scripts/lib/teaser-run/memory.ts`); `examples/memory.example.json` is a
complete one. Fields: `runId` (`a` or `b`), `runner` (`agent`, `model`,
`provider`, `profile`), `startedFrom`, `brief.text`, `analysis` (`bpm`,
`firstDownbeatSeconds`, `drops`, …), `decisions` (each `id`, `section` from
the storyboard, `choice`, `because`, `source`: rule, example, owner or
memory), `corrections` (`quote`, `rule`), `checkpoints` (`step`, `summary`,
`at`) and `outputs` (`cut`, …). A run writes it as it goes: a checkpoint
after each step, a decision as each section is built. When a project copy is
linked, the same decisions also go to the studio's project memory with
`genobi decision` and `genobi session-checkpoint` (AGENTS.md, "Save memory as
you go").

## Repeatability protocol

1. **Run A, from the brief.** The agent reads the skill, `brief.json` and
   this kit, analyses the track, derives `cut.json` segment by segment with
   the decision rules, writes `memory.json` as it goes, verifies (no
   reference), renders and shows the contact sheet.
2. **Run B, from run A's memory only.** A fresh worktree and a fresh
   session. The agent gets run A's `memory.json` (as `from-a.memory.json`)
   and the skill, and must not open run A's `cut.json`. It rebuilds the cut
   from those decisions, writes its own `memory.json` (`startedFrom` naming
   run A's) and verifies.
3. **Compare.** The person runs the verifier with a reference (run sheet).
4. **Proof.** Each run's folder (without the MP4) and a filled
   [run log](run-log-template.md) go into `docs/hermes-runs/`.

**The two bars.** Run A must pass the verifier and score at least 0.7
against v2, because v2 was cut by eye and these simpler rules land 0.773
from it, so A is meant to be similar to v2, not the same. Run B must pass and
score at least 0.95 against run A, because the same memory and the same rules
should give nearly the same cut, so B shows the run repeats.

## Run sheet (the owner runs Hermes)

Nobody but the owner starts Hermes: every chat on Nous is a paid model call.
The commands come from this repository's own launch code
(`server/agent-terminal.ts` starts Hermes as
`hermes -p <profile> chat -m <model> --provider <provider> --query-file <file>`),
Hermes v0.21.4. They were not run while writing this kit. `<repo>` is your
camera-director checkout; the run worktrees sit beside it.

**The role.** The run needs a terminal (the analyser, the verifier, the
render) and the genobi CLI. Today `hermes-developer` has one; `hermes-creative`
gets one in the role setup being built, and then runs this the same way, with
the same commands and nothing else. The skill is role-neutral; set
`ROLE=hermes-developer` (works today) or `ROLE=hermes-creative` (once it has a
terminal) and use it below.

**Once:** bind the role to DeepSeek V4.1 Flash and to the run studio's port
(4317), so its genobi MCP talks to that studio:

```sh
cd <repo>
GENOBI_URL=http://127.0.0.1:4317 GENOBI_AGENT_HERMES_MODEL=deepseek/deepseek-v4.1-flash GENOBI_AGENT_HERMES_PROVIDER=nous \
  npm run agent:hermes-roles -- --role developer --configure   # or --role creative; drop --configure the first time
hermes -p "$ROLE" auth add nous --type oauth                   # if not signed in
```

**Run A** (two terminals):

```sh
git -C <repo> fetch origin
git -C <repo> worktree add --detach ../teaser-run-a origin/main
cd <repo>/../teaser-run-a && npm ci && npm run build:mcp
# Terminal 1, the studio, with keys that cannot spend:
COMFY_API_KEY=comfyui-capture-only BFL_API_KEY=bfl-capture-only PORT=4317 node --import tsx server/index.ts
# Terminal 2, Hermes:
date -u +%FT%TZ   # note the start
hermes -p "$ROLE" chat -m deepseek/deepseek-v4.1-flash --provider nous \
  --query-file docs/genobi-teaser-run/prompts/run-a.txt
```

What you approve: the terminal commands the agent asks to run (all are listed
in the skill; none spends), any new on-screen wording it asks about, and the
contact sheet at the end (keep, or say what to change). Refuse anything that
generates, quotes or submits, and any attempt to open another cut; the skill
never asks for either. The hard stops are the studio's dummy keys and
`genobi submit` needing an accepted quote and `--confirm`; the prompts also
put `GENOBI_AGENT_SESSION=1` on every genobi command, so the studio treats
them as an agent's.

**Run B** (stop run A's studio first, or use another port here, in the role
binding and in the prompt):

```sh
git -C <repo> worktree add --detach ../teaser-run-b origin/main
cd <repo>/../teaser-run-b && npm ci && npm run build:mcp
mkdir -p .local/teaser-runs/b
cp ../teaser-run-a/.local/teaser-runs/a/memory.json .local/teaser-runs/b/from-a.memory.json
COMFY_API_KEY=comfyui-capture-only BFL_API_KEY=bfl-capture-only PORT=4317 node --import tsx server/index.ts
hermes -p "$ROLE" chat -m deepseek/deepseek-v4.1-flash --provider nous \
  --query-file docs/genobi-teaser-run/prompts/run-b.txt
```

**Verify and file the proof** (from run B's worktree):

```sh
node scripts/verify-teaser-run.mjs ../teaser-run-a/.local/teaser-runs/a --reference v2 --min-similarity 0.7 --require-render | tee ../teaser-run-a/.local/teaser-runs/a/compare-v2.txt
node scripts/verify-teaser-run.mjs .local/teaser-runs/b --reference ../teaser-run-a/.local/teaser-runs/a --min-similarity 0.95 --require-render | tee .local/teaser-runs/b/compare-a.txt
```

Then copy each run folder except `render/render.mp4` to
`docs/hermes-runs/<date>-teaser-run-a/` (and `-b/`), fill
[the run log](run-log-template.md) as `docs/hermes-runs/<date>-teaser-run-a.md`
(and `-b.md`) with each cut's sha256, link both from the wiki home and open a
pull request.

## Limits

- Not yet run by Hermes. The dry run below applied the rules by script
  (Claude acting as the weak model); Hermes on DeepSeek has not run it.
- The rules derive a cut in version 2's shape . If the teaser changes
  again, redo the storyboard, the rules' numbers and the examples, and add
  the new cut as a fixture.
- The v2 dry-run cut was verified (0.773 against v2, 127 layers) but not
  rendered: on 30 October the bundle import could not be completed on an
  overloaded machine. Render it once (`prepare-teaser-run.mjs`, then
  `TEASER_BUNDLE=… render-genobi-teaser.mjs`) before quoting a frame count.
- Since the implementation update the v2 cut on `main` breaks no rule the verifier holds runs to.
- A run can still read a forbidden file; the prompts forbid it and the
  verifier fails a copy, but nothing stops the read itself.
- The verifier checks a cut and its files, not the picture. The contact-sheet
  review is a person's (or the agent's own) look at twelve frames, and nobody
  listened to the cut here.

## Dry run, 30 October 2026

Three rounds. The first followed a table of v1's literal values and rebuilt v1
exactly, which proved the tools but not derivation (a copy would have scored
the same). The second, the one the kit now teaches, derived the cut from the
storyboard, the analysis and the capture log with the decision rules alone:
it passed the verifier, scored **0.742** against v1 (cuts on the same beats
0.714, the same footage in every section 1, overlay counts 0.994, wording 1,
identical shots 0). The
differences are by design: shot lengths come from the capture log and the fit
rule, not from an editor's eye. The third redid the rules for version 2 once the implementation update merged (camera moves on the slices, `view` on the pointer and box, cards in the middle, callouts, 1920 × 1080) and the implementation update set the typed-label hold: the derived cut passes, scores **0.773** against v2 (cuts on the same beats 0.826, the same footage in every section, overlay counts 0.974, wording 1, identical shots 0.067), builds 127 of the Director's 128 layers, and is the fixture now. Derived again from the same inputs (run B) it scores 1 against run A. What the rounds found, and what changed:

| Found                                                                                                                                                                                                                  | Changed                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A first rule set made the derived cut fail: 131 layers (a glitch on every slam), a slam on an odd beat, a box and a status shown under 1.3 s                                                                           | Glitches only on segment starts, the montage and the end card; slams round down to an even beat; boxes and statuses last at least 4 beats                                                                                                                                                                                                                                                                  |
| The verifier counted shots + overlays + the track, but the Director builds a shot with a camera move as two layers: the first v2 derivation was 133 layers, over the 128 limit, and still passed                       | The verifier counts layers as `mixProject` builds them; glitches now go only on the track's required cuts, the montage and the end card (127 layers)                                                                                                                                                                                                                                                       |
| A focus box types its label from draw × 0.5 for 0.4 s, and the reveal card covered the quote's box, so labels read well under 1.3 s while the verifier passed them (fixed in the implementation update for the teaser) | The helper draws a 5-beat box in 0.3 s and a shorter one in 0.1 s held to its end; a boxed shot keeps at least 6 beats; a box ends where a following reveal card starts; the reveal card is 2 beats                                                                                                                                                                                                        |
| The render's bundle import matched two `.zip,.json` inputs (Scrolls mounts one before the Director's), so it did not open the run's project                                                                            | `render-genobi-teaser.mjs` now targets `main.director > input`, the Director's own import; the v2 render with it is still to be confirmed                                                                                                                                                                                                                                                                  |
| Version 2 cuts in four places the music does not mark (owner timestamps 60, 81, 86; cards from 172) and lets the 188 drop fall inside the taste card                                                                   | Those edges are storyboard segments, and a card holding a required beat satisfies it                                                                                                                                                                                                                                                                                                                       |
| Version 2's overlays need the `view` of their shot's move, computed from the shot                                                                                                                                      | The helper's `view` command reads the shot back from the run's own `cut.json`, so shots are saved first (step 4)                                                                                                                                                                                                                                                                                           |
| The literal v1 table let a run pass by copying, and the verifier could not tell                                                                                                                                        | The values moved to an owner-side calibration file, the storyboard and rules replaced them, and the verifier fails a copy (`copied-reference`)                                                                                                                                                                                                                                                             |
| The pointer path rule (hold, then a 0.7 s glide into each logged target) reproduces all 19 v1 pointers exactly                                                                                                         | Pointers come only from the helper; on v2 it reproduces 15 of 16 pointers (the 16th writes `1.0` for `1`)                                                                                                                                                                                                                                                                                                  |
| v1's zoom centres and amounts were chosen by eye; the helper's (target centre, 2.2 / 1.8 / 1.35) differ                                                                                                                | A run uses the helper's values (as a shot's `move` in v2); v1's and v2's are only in the owner-side fixtures                                                                                                                                                                                                                                                                                               |
| v1's focus boxes follow no single rule (the quote is padded, the brief is not; one starts on its shot's first beat, one four beats in)                                                                                 | One rule for every box: it starts on the beat its target is reached and lasts at least 4 beats                                                                                                                                                                                                                                                                                                             |
| The analyser reports drops at 17.64 and 57.68 beats that are not on a bar line, and does not report the biggest change (92)                                                                                            | `sections` lists them as `offBar`; `track-analysis.json` adds the section changes from the per-bar pass to `requiredCuts`                                                                                                                                                                                                                                                                                  |
| The decision table gave each status's words and timings but not its height (`y`), so a cut built from it put two statuses in the wrong place                                                                           | Round one only: the literal table gained `y`. The rules now set one height for every status                                                                                                                                                                                                                                                                                                                |
| The skill said only `ui-zoom` is a filter, so the dry run marked the sixteen glitches `graphics`; the verifier passed it, and the Director never finished loading it, so the render timed out twice                    | The skill names both filters (`ui-zoom`, `slice-glitch`) and says to copy the example layer whole; the verifier checks each layer's kind against the registry, and the differences list shows kind and lane. With the kind fixed, the v1-round dry-run cut rendered through the swap in 217 s (2,869 frames), the bundled cut was restored, and the verifier passed with `--require-render` (all v1 round) |
| The first render on a freshly started studio timed out after 180 s waiting for "Ready · local preview" (the studio was still compiling); the second, on the same studio, rendered in 380 s, 2,869 frames               | The skill says to run the render once more on that exact timeout, and to restore the bundled cut either way                                                                                                                                                                                                                                                                                                |
| Layer order is not checked by the Director's mix rules, and a wrong order puts the pointer above the camera move                                                                                                       | The verifier checks lane order                                                                                                                                                                                                                                                                                                                                                                             |
| An agent-marked terminal (`GENOBI_AGENT_SESSION=1`, as the developer role runs the CLI) cannot call `genobi audio-upload`, so it cannot analyse the track through the studio                                           | `teaser-run-helper analyse` runs the same analyser code locally; it gave the studio's numbers exactly (134.99 BPM, downbeat 1.775 s, the same eight drops)                                                                                                                                                                                                                                                 |
| Rendering a run's cut needs the bundled cut file replaced (the Director opens the template's cut), which a weak model could leave changed                                                                              | The render step now prepares an independent ZIP and imports it via `TEASER_BUNDLE`; tracked files and existing edits remain intact                                                                                                                                                                                                                                                                         |

## Version 1, kept as an option

The kit derives version 2 by default: the v2 capture log, the v2 media and
`--reference v2`. Version 1 stays reproducible for comparison:
`footage-v1.json` freezes its capture log (the helper reads it with
`TEASER_RUN_FOOTAGE=v1`), `media-v1.json` points at the archived recordings
under `/media/showcase/`, and the verifier and bundle preparation adapt a
1280 × 720 v1 cut to the current recipes (`plate: 0`, `view: ""`, explicit
card flags) without changing its authored values. `--reference v1` compares
with the frozen v1 cut.

## Render

Prepare the run with `node scripts/prepare-teaser-run.mjs <run-folder>`, then
set `TEASER_BUNDLE=<run-folder>/project.zip` for `render-genobi-teaser.mjs`.
This imports an independent project instead of swapping tracked templates or
restoring them with git. The generated ZIP is the editable render input.
