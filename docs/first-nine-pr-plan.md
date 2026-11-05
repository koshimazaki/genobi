---
tags: [architecture, agents, studio, workflows]
summary: Sequential implementation PRs for the first nine maintenance priorities, with dependencies, acceptance gates and explicit remaining scope.
---

# First nine: implementation PR queue

This queue implements the first nine entries in [Maintenance priorities](maintenance-priorities.md):
**#107 → #108 → #47 → #37 → #12 → #39 → #48 → #14 → #38**.
The baseline is public `main` at `16142fff`, checked on 5 November 2026.
Read each live issue and its latest owner comments before starting its slice.
One implementation agent works through the queue sequentially; a completed PR
means code and verification are ready for review, not merged or deployed.

## PR sequence

The identifiers below are plan identifiers, not assigned GitHub PR numbers.
Use separate branches and PRs. A dependent PR names its prerequisite in its body
and targets that prerequisite branch until it is merged. Independent PRs target
the planning branch while its README formatting repair is unmerged, then `main`.
Never include unrelated preceding implementations merely because they ran first.

| Order | Issue                                                    | Proposed PR title                                           | Dependency                                 |
| ----- | -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| 01    | [#107](https://github.com/koshimazaki/genobi/issues/107) | Refuse invalid GPU boxes and refresh live readiness         | Planning baseline                          |
| 02    | [#108](https://github.com/koshimazaki/genobi/issues/108) | Preserve recorded Recreate mode and disclose missing setup  | Planning baseline                          |
| 03    | [#47](https://github.com/koshimazaki/genobi/issues/47)   | Align Cloud availability warnings and workflow cost wording | Planning baseline                          |
| 04    | [#37](https://github.com/koshimazaki/genobi/issues/37)   | Stage owned agent media with inspected upload receipts      | Planning baseline                          |
| 05    | [#37](https://github.com/koshimazaki/genobi/issues/37)   | Attach, replace and relink owned media through agent tools  | 04                                         |
| 06    | [#12](https://github.com/koshimazaki/genobi/issues/12)   | Make local project archives complete and recoverable        | 05, for agent-imported media acceptance    |
| 07    | [#39](https://github.com/koshimazaki/genobi/issues/39)   | Export Director projects through the paired browser         | 06                                         |
| 08    | [#39](https://github.com/koshimazaki/genobi/issues/39)   | Export Scroll documents with completion receipts            | 07, shared export lifecycle                |
| 09    | [#48](https://github.com/koshimazaki/genobi/issues/48)   | Choose BFL or Comfy for FLUX video and upscale              | Planning baseline                          |
| 10    | [#14](https://github.com/koshimazaki/genobi/issues/14)   | Give CLI sessions studio inbox and activity parity          | Planning baseline                          |
| 11    | [#14](https://github.com/koshimazaki/genobi/issues/14)   | Explain unavailable agent operations before execution       | 10; verify the new media/export tools too  |
| 12    | [#38](https://github.com/koshimazaki/genobi/issues/38)   | Inspect and edit the mounted Scroll document safely         | 08, reuse browser connection and ownership |
| 13    | [#38](https://github.com/koshimazaki/genobi/issues/38)   | Attach Scroll media and confirm Director handoffs           | 12, including the media contract from 05   |

Split a row further only when the actual diff needs a smaller review boundary.
Do not create empty implementation PRs. If acceptance proves a feature already
works, retain the useful regression/evidence and report what remains instead of
rewriting it. A cross-branch check is verification, not permission to copy every
unrelated change into that PR.

## 01 — GPU destination correctness

Start at `server/workflow-settings.ts`, `src/components/RunModeLine.tsx` and the
existing GPU-box/readiness tests. An invalid saved box must fail with an
actionable message; it must never become the default Local destination.
Refresh the destination check when live reachability changes even if settings
revision and model remain unchanged. Ignore late checks for a previous target.

Gate: simulate the studio claiming the saved tunnel port, a tunnel connecting,
a tunnel dropping, and a stale readiness response. Assert no submission to an
unselected destination. Cloud warnings belong to 03.

## 02 — Honest Recreate

Start at `src/director/recreate-in-camera.ts`, `src/useComposerRecreate.ts` and
`src/run-restore.ts`. Preserve `settings.generator: edit` through both recipe
construction and handoff; missing Klein references must leave an incomplete
edit. Explain missing project workflow identity instead of presenting the
currently selected template as restored. Prefer a recorded actual route when
describing Auto. Distinguish restored run inputs from newly chosen Inspiration.

Gate: unavailable Klein references, H3 duplicate reference slots, an upscale
without a text prompt, camera-only prompt composition, actual provider read-back,
workflow mismatch and project switches during load. Recreate never submits.
The durable [recipe library](recreate-library-plan.md) remains a separate series;
this fix cannot recover historical prompts or images that were never saved.

## 03 — Cloud preflight and cost disclosure

Reuse `shared/comfy/preflight.ts` and the fully filled graph checks in
`server/comfy-sdk.ts`; generalized dependency blocking is already implemented.
Bring unknown-availability disclosure to direct Generate and hosted quotes.
Keep missing, unknown and checked states distinct. Describe workflow GPU-time
estimates separately from per-image BFL pricing.

Gate: local/Worker quote parity, direct UI warning, unavailable inventory,
different account inventories, H3 RGB/Canny/Depth/Combined, AKUSPACE and SeedVR2
fixtures, and zero charged submissions when a required dependency is missing.
Do not advertise Music or custom-node deployments as newly Cloud-qualified.
Add caching only if a measured repeated-read problem justifies it; keys stay
transient and a timeout never causes a paid retry or provider substitution.

## 04–05 — Agent media input

Extend existing owner/grant checks, media inspection, file storage and project
commands. 04 adds bounded binary staging with inspected type, content hash,
ownership and a stable receipt; interrupted uploads must not become valid assets.
05 consumes that receipt for revision-checked attach/replace/relink and reports
the resulting asset/clip IDs. Reuse browser mutation rules and expose the same
validated operations through HTTP, MCP and CLI. Include supported World audio
and texture attachment without treating the renderer as a headless service.

Gate: supported image/audio/video, malformed bytes, size limits, content-hash
mismatch, upload interruption/retry, wrong session/project, stale revision,
missing reference, in-use removal, and lost acknowledgement without duplicate
attachment. Generated-take and owned-derived imports still pass. No machine
path enters a saved project. Hosted capability remains explicit where ownership
is unavailable. Add user/agent documentation and regenerate the tool registry.

## 06 — Portable local archives

Follow [the owner's local-only scope](https://github.com/koshimazaki/genobi/issues/12#issuecomment-6644775412).
Inspect `src/director/bundle.ts`, `server/project-bundle.ts`, World companions
and brief/media references before adding storage. Verify a representative cut
with agent-imported image/audio/video, a brief and a World companion can be
archived, then restored in a fresh session without its browser cache.

Gate: same project structure, file hashes and referenced bytes after round trip;
explicit missing-media failure before writing an apparently complete archive;
invalid paths, corrupt hashes and interrupted restore preserve the existing
project. Fix only proven gaps and recovery UX. Workspace membership, hosted
canonical projects and cross-device revisions remain outside this slice.

## 07–08 — Browser export receipts

Reuse the paired-browser command lifecycle and existing Director and Scroll
exporters. Request a format against a source ID/revision, then expose status,
progress, cancellation and errors through HTTP/MCP/CLI. Publish a completed
artifact receipt only after packaging/rendering and owned artifact storage finish.
The receipt identifies the actual source revision, format, file and download.

Gate: a real small Director MP4 plus project ZIP and a Scroll bundle open from
their receipts; cancellation, concurrent export, source change, browser close,
lost acknowledgement and another session's artifact all behave explicitly.
Do not report success for merely clicking Download. Keep `headlessExport: false`
and existing World capture behavior. Browser absence is an actionable capability
failure. 08 may establish the minimal mounted-Scroll registration reused by 12;
it does not claim general live editing is finished.

## 09 — Explicit FLUX video/upscale provider

Add a distinct validated video/upscale provider override in the shared request
contract; do not reuse the image-only field. Preserve legacy canonical hashes
when the new field is absent. Carry the chosen route through quote, reservation,
submission and original-provider polling in Express and Worker.

Gate: Auto still prefers BFL when both keys exist, explicit selection identifies
the payer/destination, missing key fails before submission, changed provider
invalidates a quote, ambiguous submissions never fall back, and legacy replay
and original-provider polling remain valid. Reuse the compact accessible menu
only for FLUX 3 text-to-video and upscale; check desktop/phone dimensions and
keyboard behavior. Single-provider models never offer an inapplicable menu.

## 10–11 — CLI and capability parity

10 reconciles `cli/run.ts` with MCP's `trackedTool`/`withMessages` wrapper in
`mcp/server.ts`. Use a shared execution envelope or explicit structured inbox
interface while preserving existing machine-readable output and grant checks.
Gate: a correction sent during a CLI-only studio session reaches the intended
session exactly once, task activity is visible, cross-session access fails,
and quoted submissions retain their one-use/no-retry behavior.

11 checks advertised operations against the selected runtime and paired browser,
with actionable local/hosted/connection diagnostics before an unsupported action.
Keep the runtime manifest and plugin feature catalogue distinct. Verify media,
export and voice handoffs and ensure skills describe actual commands. Ordinary
request deadlines may be added only with explicit uncertain-write behavior.

These slices advance #14 without closing its umbrella. Hosted planner, canonical
hosted project access, follow-up delivery, additional field protections, QC and
physical-microphone qualification remain separately tracked work.

## 12–13 — Live Scroll editing

12 returns mounted document identity, revision, selected cell and owned assets,
then applies existing validated commands against that exact revision. Preserve
human edits and bind conversation context to the original document/cell.
13 reuses owned-media receipts and existing Director conversion, returning the
resulting project identity and read-back rather than an unconfirmed handoff.

Gate: inspect → edit → attach → handoff in the browser, stale edits, document
switch, disappeared cell, disconnect, two tabs, foreign media and repeated
acknowledgement. No request silently opens a different document. Pure JSON
tools remain supported; generated assets retain quote and approval requirements.

## Completion and review gates

For every PR, report the exact base/head, changed behavior, tests run and any
acceptance that remains unverified. Read the [review checklist](review-checklist.md).
Run focused regressions and affected adapter checks, then formatting, lint,
size, types and the required CI checks. Regenerate registry/wiki/plugin bundles
when their sources change; rebuild the scene adapter for World Builder changes.
Use browser acceptance for changed controls and renderer/export behavior.
Source tests do not establish provider, microphone or production behavior.

Preflight every commit, push and PR write against live refs. Publish each tested
implementation as its own reviewable PR before starting the next slice. Keep
dependent PR bases explicit, do not force-push another branch, and reconcile
actual refs after an upstream merge. Implementation does not include automatic
merges, production approvals, remote migrations or paid qualification.
Use issue references, not closing keywords, for partial or unverified acceptance.

After these nine priorities, continue the durable recipe-library series: save
original prompt/input/setup, prove cache-independent restore, then add Recreate
and Make similar to reusable creature examples. Missing originals stay marked
unknown until recovered from authoritative records.
