---
tags: [licences, agents, director]
summary: teardown — a Claude Code skill for interactive 3D machine simulators and 60 fps explainer films; usage, provenance and licence boundaries.
---

# teardown

**Created by [elvarofficial](https://github.com/elvarofficial)**, built on
[whaleyxbt/claude-motion](https://github.com/whaleyxbt/claude-motion).
[Visit the project](https://github.com/elvarofficial/teardown).

## Why it belongs in our taste layer

It is a Claude Code skill that builds a real machine as one offline HTML page
(three.js, under 1 MB) that people can take apart: an engine, a landing gear,
a walking linkage. The same code records the page's auto tour frame by frame to
a 60 fps MP4, with a procedural score read from the same timeline. Its rules
are worth borrowing for any 3D workflow here:

- **Start from a reference, never from imagination.** A photo, a manual's
  cutaway or a clip, compared frame by frame.
- **Real numbers, one source.** One input (crank angle, stroke, wind) poses
  every part, and every gauge reads the same function, so nothing on screen
  disagrees with the motion. Nothing is keyframed by hand.
- **`render(t)` is pure.** No `Math.random`, no `Date`, no carried state;
  stateful motion is simulated once at load. That is what lets a capture seek
  to any frame and get the same picture.
- **Review from sheets.** Contact sheets per timeline beat, zoomed strips
  around transitions, then a sheet of the encoded file; done only when a full
  pass finds nothing.
- **Taste, with numbers.** One accent that marks the working part, the subject
  at 60–70% of the frame, labels never under 34 px at 1080, fixed easing curves.

It also records three.js traps worth knowing before a cutaway: ANGLE's
`smoothstep` with reversed edges, `polygonOffset` for shadow decals inside
post-processing, NaN pixels through bloom, and clipping planes for GTAO.

## How it is built (code read at `a91262a`)

Read on 3 November 2026 from a clone; nothing was run.

- **Code, not models.** No GLB or other model file is loaded. Every part is
  three.js geometry made in code: mostly primitives (38 cylinders, 13 boxes,
  12 planes, 8 rounded boxes, 5 tori, 2 cones, a sphere), plus 2D profiles
  extruded into gears, crank webs and bulkheads (10 extrusions), 2 lathed parts
  and tubes along curves for springs and pipes. Repeated parts, such as the
  Strandbeest's 20 legs, are instanced.
- **Each machine is split into one file per job.** `kin.js` is pure maths in real units with no three.js
  (the V8's slider-crank, valve lift and a pressure model; Jansen's linkage
  solved by circle intersection in 67 lines). `engine.js` builds the parts and
  `update(input, ops)` poses them. `stage.js` lights the scene, `console.js`
  draws the panels, `film.js` is a `SCRIPT` of timed events (camera, isolate,
  throttle) read by a pure `render(t)`, `live.js` is the same machine driven by
  hand, and `score.py` is the sound.
- **The size of one machine.** The V8 is about 1,800 lines across its six
  JavaScript files; `engine.js` alone is 624. The shared kit (runtime, capture,
  HUD, shader warm-up) is small. Most of the work is per machine.
- **Explode is written by hand for each machine.** `ops.explode` runs from 0
  to 1. Each layer has its own start (`lay(a) = smoother((ex − a) / 0.45)`),
  outermost first, so nothing passes through anything. Each layer has its own
  axis and distance in millimetres (the cage 390, the camshaft 300, the head
  200, the pistons 110 along each bank, the sump and crank down). It is not a
  generic exploder.
- **It is not audio-reactive.** The sims read no audio. Sound follows the
  picture: `score.py` places a thud on every power stroke by re-running the
  film's crank model in Python and reading `timeline.json`. That second copy
  of the model is the weak point, since the JavaScript and Python versions must
  be kept in step by hand.

## What we took, simpler

- **A generic explode, as data.** `shared/scene/explode.ts` takes any list of
  part positions and an amount from 0 to 1. Each part moves away from the
  centre (or along one axis), as far again as it already sits, and the
  outermost part starts first with teardown's staggered timing, so nothing
  crosses. It is about a hundred lines, pure and deterministic, in place of a
  hand-tuned block per machine. It needs only positions, so it works for
  `shared/scene` primitives and World Builder props alike.
- **Audio-reactive explode.** `explode` is a property of the World Builder
  [audio mod matrix](../../../world-builder-sound.md#audio-mod-matrix) on
  `primitives` and `prop:<id>`: a band opens the set on the beat and the tail
  closes it, with the usual amount, gate, invert and response. The envelope
  is computed once from frame zero, so a take is frame-exact, which is
  teardown's `render(t)` rule.
- **The UI variant.** The [`ui-teardown`](https://github.com/koshimazaki/Genobi/blob/main/plugins/genobi/skills/ui-teardown/SKILL.md)
  skill applies the same idea to an interface: the real UI rebuilt in HTML or
  React, split into layers lifted apart in CSS 3D, with a numbered sheet per
  part. It comes from the owner's FLUX Studio Lite case study.
- **Not taken.** Our primitives (`box`, `sphere`, `cylinder`, `cone`,
  `torusKnot`, `icosahedron`, position, size and Y rotation) cannot express
  teardown's extruded gears, lathed parts, tubes or full rotations, and its
  machines are three.js code rather than scene data. Bring them in as
  rendered MP4s. The [Exploded house](../../../scene-examples.md) example is
  still placed apart by hand. If we score an explode, picture and sound should
  read one timeline rather than copy the motion model into the audio code.

## What Genobi uses

Status: **recommended**. Selected for 3D explainer, cutaway and exploded-view
work; not installed and no source copied (the explode timing is our own code,
written from the approach). A teardown film is an ordinary MP4,
so it enters the Director as a project asset like any other render. teardown itself is
not a Genobi plugin skill; the [`genobi-3d`](https://github.com/koshimazaki/Genobi/blob/main/plugins/genobi/skills/genobi-3d/SKILL.md)
skill points to it, and our own explode and `ui-teardown` are above.

Installing it is a separate, user-requested setup step:

```sh
npx skills add elvarofficial/teardown -g -a claude-code
# then, once, in the installed folder:
npm install && npx playwright install chromium
```

It needs Node.js 20+, `ffmpeg` for the film and Python 3 for the score. Read the
installed `SKILL.md` before running it; its build and capture scripts run with
your user's permissions.

Recommendations and references are not installed or executed merely by listing
them here. Agents should check the actual deliverable's dependency graph and
credit only what they used. Users may replace this recommendation.

## Licence and provenance

- Licence: **MIT** (copyright elvarofficial and whaleyxbt).
- Source: https://github.com/elvarofficial/teardown
- Reviewed version / commit: `a91262ac1109051e014662d42ecb0b7bc1f113b1`.
- Checked: 2026-11-03.
- [Original licence](LICENSE.txt)

Preserve both MIT notices if adopted. The runtime, frame capture, sound engine
and review rules come from claude-motion (MIT). Bundled Inter and JetBrains
Mono are OFL-1.1; recorded samples are CC0 from Freesound, prepared by
[Barty-Bart/motion-graphics](https://github.com/Barty-Bart/motion-graphics),
with sources in its `sfx/samples/SOURCES.md`. three.js, Playwright and esbuild
keep their own licences. Machine names, photos and manuals used as build
references keep their own rights.

These saved licence texts document the reviewed source; they do not license
unrelated artwork, demos, fonts, models or trademarks. For package dependencies,
`package-lock.json` and `LICENCES-npm.md` record the shipped package version.

- `LICENSE.txt` SHA-256: `489451d9c7bd0c07b21c7f094f24d290d52c757bf71fc988ec880aa673fb3820`

## Changes and collaboration

No modifications to this upstream skill are introduced by the taste catalogue. Integration and recommendation text are original Genobi work.

Contribute useful fixes upstream when appropriate, with a focused patch and
validation. A credit is not an endorsement or a statement that the creator has
approved Genobi. No creator has been contacted as part of this change.
