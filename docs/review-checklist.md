---
tags: [architecture, review]
summary: Questions to answer from source and tests when reviewing a change, including agent and independent review passes.
---

# Review checklist

Use these questions when reviewing changes, including an agent or independent review pass.
Answer from source and test evidence. Report concrete failures with a file,
trigger, consequence and proposed fix; a passing build alone is not evidence
that a paid or destructive operation is safe.

## Architecture and paid requests

- Do Express and the Worker validate and canonicalize the same inputs, including
  old defaults, omitted fields and reordered camera selections?
- Is the idempotency reservation durable before the provider submission? Do
  concurrent requests, lost responses, quota eviction and retries preserve it
  until its documented retention boundary?
- Can polling, refresh or recovery accidentally resubmit a paid request? Do
  terminal states stop polling and release leases without hiding uncertainty?
- Are upscale dimensions and prices derived from trusted media metadata or the
  validated static catalogue, rather than browser assertions?
- Does a Cloud job send anything the visitor did not choose?
- Is a take's recipe and input hashes recorded with the reservation, kept out of
  public job data, and served only once the output is in storage we own?
- Can one quote pay for two runs, under concurrency or replay? Does a quote price
  exactly what the submission reserves, and refuse what it would refuse (route,
  budget, session limit, balance)?
- Is an upload stored and served only as a type its bytes proved? Can an image or
  audio source reach a path that expects video?
- Can any request text reach an ffmpeg argument, or an ffmpeg error reach a
  response? Is every ffmpeg output measured by the shared readers?

See [architecture](architecture.md), `shared/idempotency.ts`,
`shared/lifecycle.ts`, and the server/Worker tests.

## Ownership, storage and counts

- Are private media, history and jobs restricted to the owning session, the
  only exception being the local server's Ready terminal and agent takes, read
  by the studio alone (`server/shared-takes.ts`) and never by an agent-marked
  request or the hosted Worker? Are
  provider input links scoped and time-limited, with redirects rejected?
- Can a key, provider identifier or private lineage leak through assets, logs,
  errors or public job responses? Inspect the built assets as well as source.
- Does cleanup remove the intended R2 objects and source rows while preserving
  replay protection and historical counts? Is unavailable media presented honestly?
- Do daily counts survive deletion, repeated sweeps and later jobs on the same
  day without losing, double-counting or reclassifying completed generations?
- Do rate limits, batch bounds and retention claims match the actual code paths,
  including Pages request-triggered housekeeping and failure recovery?
- Does the production job remain restricted to a successful `main` push, keep
  secrets out of pull requests, serialize deploys and apply only
  backward-compatible migrations before publishing the new bundle?

See [Cloudflare operations](cloudflare.md), [observability](https://github.com/koshimazaki/Genobi/blob/main/observability/README.md),
`worker/storage.ts`, `worker/sweep.ts`, and migrations. Apply migrations in an
isolated test database; remote migration is a separate operation.

## Composer and library

- Does a clip-title click switch to the matching generator and restore only its
  prompt/camera text while preserving current settings? Does Recreate restore
  the full saved setup without submitting it?
- Do the composer and the main view stay on the same run: does the studio open
  on the featured clip's own scene _and settings_ (the composed prompt should
  read back as the prompt that clip shipped with), or, when the featured clip
  has no recorded run, on an empty composer with Open only unticked rather
  than another clip's run? And does a Recreate or title
  click move that clip to the main view instead of leaving another run's video
  under it? The clip is presented as a catalogue source there, so it must still
  stay out of session-job selection and polling.
- Does the main view show the clip the composer is upscaling, including when a
  different catalogue clip was just recreated, and does it return to the run the
  composer holds when the model switches back to video? Does a returning session
  with no explicit selection open the composer on the same run the main view
  shows, without a later arrival overwriting an edit the visitor has made —
  through any control, including the camera dialogue's `Done`?
- Does hiding a card leave the studio on the run it is showing when that card is
  the one selected, with only the fallback selection drawn from the visible cards?
- Do both directions between video and Upscale work? Do library clips stay out
  of session-job polling and saved-job selection?
- Does the header still name the studio in full — `Genobi`, the same
  words as the document title and the README — and do the mode badge, the model
  menu and the composer foot all take their names from `src/generators.ts`?
- Can a visitor select something the studio cannot run?
- Does any label promise more than the route it runs on?
- Does every control shown apply to the request that will be sent?
- Do the composer's rows share one inset, so Camera controls closes where the
  generate button closes and the mode badge starts on the model column's line?
- Is the next action, Generate, on the line the visitor's eye ends on?
- Does every shipped library setup still validate and reproduce its recorded
  prompt? Are provider identifiers and private provenance absent from public files?
- Can a first-time visitor inspect the library without a key? Check keyboard
  controls, a narrow viewport and reduced motion when affected by the change.

## Verification and documentation

```sh
npm run format:check
npm run lint
npm run check:size
npm run typecheck
npm test
npm run build:pages
git diff --check
```

`check:size` holds tracked source to 500 lines; a split should follow topics,
and an allowlist entry needs a reason that splitting would hurt cohesion.
`build:pages` includes the frontend build and Worker portability check. Worker
tests use isolated D1/R2 and a fake provider; they do not verify live paid
generation. Browser-check changed user flows separately; for layout, dialog or
control changes, run `scripts/check-phone-a11y.mjs` against a local Vite server
(phone and desktop overflow, names, focus, target size, dialogs, reduced motion
and stable composer modes). Keep generated Worker
typings excluded from formatting. CI workflow configuration is the source for
which checks run on a pull request; do not claim CI passed from local results.

When behavior changes, update its source of documentation in the same change:

| Changed contract                        | Documentation to revisit          |
| --------------------------------------- | --------------------------------- |
| User-facing flow or setup               | README and architecture           |
| API, state, replay, key handling        | Architecture and this checklist   |
| Storage, limits, migrations, deployment | Cloudflare operations             |
| Aggregates or privacy boundary          | Observability                     |
| Verification result or known limitation | Verification, with scope and date |

Keep documentation about the product and its implementation. Private preparation,
review transcripts and machine-specific evidence belong outside public files.
Remove stale claims and broken links rather than appending contradictory notes.
