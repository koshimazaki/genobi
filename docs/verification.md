---
tags: [architecture, verification]
summary: What has been tested in the studio and what has not, from automated checks to paid provider calls.
---

# Verification

What has been tested, and what has not. Current as of 22 September 2026.

The architecture under test is Cloudflare Pages with an advanced-mode Worker,
D1 job state, R2 private media and a four-clip static first-run library. The
Express adapter remains the local development path.

## v0.14 agent and recovery checks · 31 October 2026

The regression suites cover runtime capability discovery on both adapters,
hosted onboarding and voice routing, supported run-location choices, current
Words and reference cleanup, and adapter-specific deployment upload limits.
Local MCP integration tests exercise project-reference quote/submit, staged
Comfy inputs, voice transcription, companion import, and the owner's explicit
approval of an agent-prepared deployment. These use fake providers and a fake
voice worker; they do not establish that a paid model or GPU deployment ran.

Worker tests inject failures before and after source persistence and before the
final Ready save, then verify that polling restores companion audio without
another generation. Settings tests cover streamed size limits, rotating-session
abuse, aggregate write limits and concurrent insertion at the settings ceiling,
which displaces the oldest record rather than refusing new visitors.
Paused-chain tests require a fresh quote after an endpoint or preset changes.
3D take tests retain the saved receipt's recipe and stop an import when its
project changes during conversion.

Browser checks exercised the workspaces at 1440, 390 and 320 px, a nine-frame
colour/depth capture with moving geometry, and a 241-frame orbit from Walk.
Successful Editor MP4 export is not claimed for this pass: the test Chromium
lacks AAC encoding and reaches the existing export capability guard. Real voice
model execution and paid provider/deployment runs were not performed.

The development dependency refresh pins patched Miniflare/Wrangler transitive
packages and overrides minimatch to 11.0.3 until ESLint's dependency range
includes its security fixes. Both production-only and complete-tree npm audits
report no known advisories with this lockfile on the date above. The full lint,
type, test and build checks remain the compatibility gate for that override.

## Automated checks

Counts go stale; what each command guarantees does not.

| Command                     | What a pass means                                                |
| --------------------------- | ---------------------------------------------------------------- |
| `npm test`                  | Every rule below still holds on both adapters                    |
| `npm run typecheck`         | No type errors                                                   |
| `npm run lint`              | No errors (three known hook-dependency warnings remain)          |
| `npm run format:check`      | Formatting is unchanged                                          |
| `npm run check:size`        | No tracked source file over 500 lines outside the allowlist      |
| `npm run build`             | The production bundle builds                                     |
| `npm run check:worker`      | The portable layer compiles with no Node and no DOM types        |
| `wrangler deploy --dry-run` | Bundle, bindings and asset config are valid, without an API call |
| D1 migration replay         | Every migration applies in order to a scratch SQLite database    |

The suite covers camera geometry across all 729 selection combinations, prompt
composition and restore, which run the main view shows, idempotent replay across
both adapters, session ownership, rate limits, storage ceilings, lifecycle
expiry, and that the two MP4 readers agree so an upscale cannot be priced
differently on each adapter.

The composer and the main view are pinned to one run: the opening composer is
built from the first catalogue clip's recorded setup and is asserted to compose
that clip's prompt verbatim, `heroMedia` is asserted across the transitions that
used to leave the two apart (a loaded catalogue clip, an upscale choice over it,
a generated clip presented as the run it is), and `activeRun` is asserted to keep
the visitor's chosen run when they hide its card and to fall back to the newest
visible run otherwise. Every edit the visitor makes is asserted to travel one
path, `markEdit`, and `src/App.tsx` is read to check that no control dispatches
an update of its own. `src/App.tsx` itself is not rendered in the suite, so the
browser checks below cover the rest of the wiring.

## Browser checks

First-run library, title-based prompt reuse, full-setting Recreate, lightbox
prompt and download actions, explicit unavailable-media messaging, and
responsive desktop and mobile layouts.

A later pass in headless Chrome against the local adapter at 1440 × 980, and
across viewport widths from 320 to 1440, checked that the composer and the main
view stay on one run: the studio opens with the first catalogue clip's own scene
under that clip, Recreate and a clip-title click move the clip whose prompt was
loaded into the main view (its lightbox carrying the same recorded prompt), and
a finished run of the visitor's own takes the main view back when they select it
again. It also checked that the two generator names and their icons read the same
in the model menu, the mode badge and the composer foot, and that the rim light
on Camera controls travels with the animation on and rests under reduced motion.

A later pass in the same setup checked the transitions where the two runs used to
drift apart. In a browser session with nothing of its own: the main view showed
`library-01.mp4` and the composer held that clip's own run — its scene, its three
camera clauses, 10s, HD, 16:9, draft off — with the composed prompt reading back
as the prompt `public/media/gallery.json` records for it. Recreate on library-03
moved that clip to the main view with its recorded prompt in the lightbox.
Clicking Upscale on library-01 put library-01 on screen, with the foot reading
`FLUX Video Upscale · precise`; switching the model back to video returned the
main view to library-03, the run the composer still held. And a returning session
with an existing finished run and no explicit selection opened with that run in
the main view and the composer on that same run (its scene, camera terms, 5s and
draft on), where it previously opened on the run under an untouched opening
composer.

The same pass checked two smaller claims. The header renders the studio's name in
full — `FLUX Studio Lite`, the same words as the document title and the
aria-label, which a test now pins together — and the composer's two outer rows
share one inset: the mode badge starts on the model column's line and Camera
controls closes on the generate button's right edge, measured at 0px difference
from 1440 down to 390, where the toolbar wraps.

A later pass in the same setup checked the two ways a control could still move
the composer behind the main view, both with the run stubbed at the network layer
so no paid call was made. With the run on screen and its card hidden, the main
view kept that run (`library-02.mp4` under its own status caption) while the
composer kept its scene — the same probe on the previous commit fell back to
`library-01.mp4` under a composer still holding the hidden run. And with the
session history held at the network layer for nine seconds, a camera phrase
edited in the dialogue and applied was still in the composer after the held run
arrived — the run took the main view and the edit stood in the composer, which is
the one run the two do not share, since the visitor's edit is the composer's
subject and the arriving run is the newest one — while the same probe on the
previous commit lost the edit to the arriving run's own camera and scene.

Generation was exercised against an isolated mock provider with a real bundled
MP4 and the real job API: queued and waiting states, Ready, decoded playback,
job-link reload, and a clear fallback for an unavailable job.

## Privacy boundary

Public media carries recreate inputs and confirmed costs, with no provider job
identifiers and no private provenance file — a regression test rejects both.
Visitor keys stay in page and request memory and are never persisted.

## Paid provider calls

Live paid generation is verified on both adapters.

Two early runs went through the local Express adapter: one text-to-video and
one precise upscale, the source 1280 × 704 at 5.042 s and the upscale 2560 ×
1408 at the same duration. The four catalogue clips are hosted runs on Pages,
and each ships the cost BFL confirmed for it — $1.70, $0.85, $1.70 and $0.30,
$4.55 in total. Later review sessions added further hosted runs.

Every provider interaction in the automated suite is mocked, so the checks
above spend nothing.

## Not verified

- Reliability at scale. Generation is verified to work, not measured
  across repeated runs of the same setup.
- Native-device playback on Safari and iOS.
- Load and concurrency testing.
- An independent stranger test.
- **Camera fidelity.** The geometry tests check that poses are finite,
  grounded and closed. They are illustration tests, not measurements of how
  closely the model follows a camera term. One run per combination
  demonstrates the pipeline and the wording, not reliability across subjects.

## Size

About 90 KB gzip of JavaScript and 10 KB gzip of CSS for the app, plus 124 KB
gzip for the lazily loaded Three.js scene. The four library clips ship as
960px previews totalling roughly 3.5 MB rather than the 25.8 MB of originals.

## Continuous integration

Every push to `main` and every pull request runs
[`.github/workflows/ci.yml`](https://github.com/koshimazaki/Genobi/blob/main/.github/workflows/ci.yml): the checks above,
plus a second job guarding the cloud boundary.

- `npm run check:worker` compiles `shared/` and the portable server modules
  under `"types": []`, so a Node-only import in the layer meant to move to
  Workers fails there while every other check stays green.
- `wrangler deploy --dry-run` bundles the Worker and validates its D1, R2 and
  asset bindings without contacting the API, so it needs no credentials.
- The D1 migrations replay in order against a scratch SQLite database.

Pull-request CI cannot deploy and is never given production credentials; it
uploads the frontend build as a short-lived review artifact. The production job
runs only on a push to `main`, and this deployment holds no credential for it,
so it skips: releases are run by hand. See [Cloudflare](cloudflare.md) for why,
and for the two secrets that would enable it.

## Library clips as evidence

The four library clips are real runs of this studio on the hosted deployment,
each shipped with the prompt, camera terms, settings and provider-confirmed
cost that produced it. They cover close-up and macro shot sizes, low, high and
worm's-eye angles, and orbit, pan, tilt and dolly-in movements, including one
draft-mode run at $0.30 against $1.70 for a full ten seconds. A controlled
same-subject movement grid remains to be run.

## Image/Edit canvas — 11 October 2026

The Image and Edit flows use the same FLUX image endpoint. Local and isolated
Worker tests exercise reference validation, request-only image bytes, replay
conflicts, owned image delivery, MIME types, and exclusion from video upscale.
Region tests cover clamped movement/resizing, normalized source/target boxes,
reference remapping and layout aspect-ratio alignment.

Browser verification covered a source upload, drawing, moving and resizing a
box, independent label movement, attaching a per-box reference, dragging an
existing thumbnail onto a box, and inspecting its serialized reference index.
At 430 px, 768 px and the desktop viewport, all four FLUX modes had equal hero
and composer heights, equal gallery positions, and no horizontal overflow.
References remain in tab memory and need reattachment after reload.

These checks used local fixtures and fake providers. No paid generation or
deployment was performed.

## Hosted deployment, Make it yours and Klein — 31 October 2026

The hosted studio can now register a Comfy deployment of its own. Reviewed and
run locally; nothing here was exercised against a live deployment, and no paid
call was made in this pass.

What the review confirmed in the code, each with a test in
`tests/worker-deployments.test.ts`:

| Claim                                         | Where it holds                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Only `https://<name>.run.comfy.app` runs      | `parseWorkflowDestination` requires one label, no port, no path, no credentials, query or fragment, and refuses a foreign host (`saves unpaid settings without a key, isolates sessions and refuses foreign hosts`)                                                                                                                                                  |
| The visitor key is never stored               | `deployment_settings` holds url/preset/revision only; `deployment_assets` holds a receipt id, session, endpoint, input role and expiry. Uploads use the caller key in request memory (`uploads through the real SDK with a transient caller key and stores only an owned receipt`)                                                                                   |
| No key reaches a log                          | No `console.*` call in `worker/` or `server/` takes a key or the `x-byo-key` header                                                                                                                                                                                                                                                                                  |
| One session cannot reach another's files      | Asset reads bind id, session, endpoint, token and expiry; inserts cap at 32 per session atomically; outputs are keyed by job and read only from the session-owned row                                                                                                                                                                                                |
| A paid run needs a quote and a claimed ticket | Quoting requires the endpoint and owned input picks, submission refuses without a confirmed quote, and an uncertain call is never resubmitted (`requires setup and owned tickets before quoting, and confirmation before submission`; `binds quotes to presets and endpoint and sends one reserved job under concurrency`; `never resubmits an uncertain paid call`) |
| A drifted setting cannot be submitted         | `requireExpectedPlan` answers 409 when the quoted location or workflow differs, before provider work                                                                                                                                                                                                                                                                 |
| Migration 0009 is additive                    | All nine migrations replay in order into a scratch SQLite database; 0009 adds `deployment_settings`, `deployment_assets`, `deployment_outputs` and two indexes, and alters nothing                                                                                                                                                                                   |

`Make it yours` feeds `Generate my version`: the panel takes the template's real
media, replacements and text, writes the brief, and the instruction names the
selected slot IDs, defers to the saved description and references, refuses to
infer prompts from demo footage, and asks for a quote before spending
(`tests/director-version-media.test.tsx`, `tests/director-generate-version.test.tsx`).
Klein takes a dropped image without a prior generation
(`tests/klein-source-edit.test.tsx`).

Locally run: `npm run lint`, `check:size`, `typecheck`, `check:licences`,
`check:registry`, `check:scene-adapter` and `build:pages` (which includes
`check:worker`) pass, as do `format:check` and `check:wiki` on the changed files.
`npm test` passes apart from tests that fail the same way before this change:

- `ffmpeg-render`, `space-render` and `upscale-parts-render` drive real ffmpeg
  and pass with a current ffmpeg (6.1 or 7.1). An old ffmpeg 4.x first on PATH
  rounds a cut's duration differently; put a current one first before treating
  those as regressions.
- A few agent-session tests (`agent-session-inbox`, `agent-sessions`,
  `agent-terminal-sign-in`) are timing-sensitive inside a full parallel run, and
  `voice-discovery` depends on the home folder layout. Both fail identically
  without this change.

Not verified here: a hosted run against a real `*.run.comfy.app` deployment, the
32 MB hosted input ceiling as measured against a live endpoint, and the browser
pass at phone and desktop widths after the settings and Help changes.

A follow-up hardening of hosted uploads holds each input once rather than
copying it into a second buffer, and refuses an unknown input role or a session
already at its 32-ticket cap before reading the body or calling the deployment
(`refuses an unknown input role, and a session at its ticket cap, before uploading`).
