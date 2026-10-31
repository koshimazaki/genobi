---
tags: [architecture, cloudflare, backend]
summary: Hosted deployment on Cloudflare Pages, with the runtime, D1 and R2 limits, lifecycle, reproduction and deployment.
---

# Cloudflare deployment

Live: [Genobi](https://genobi.pages.dev).

The hosted app uses your own BFL key. Connect it in the header: the balance check verifies the connection and shows the remaining account credits as USD. Generation/upscale estimates are separate from that balance. No shared provider key is configured or stored. The key exists temporarily in page/request memory during use; it is not persisted by the app.

## Runtime

- Pages static frontend + advanced-mode Worker: same-origin API with the existing D1/R2 bindings.
- Comfy deployments can be registered per browser session in Settings. The endpoint
  must be an HTTPS `*.run.comfy.app` origin. The visitor supplies its workspace's
  Comfy key on each upload, quote, submission and poll; no provider key is persisted.
  The owning workspace pays. Standard Router/Cloud generation remains available
  without a custom endpoint. Hosted deployment uploads are capped at 32 MB each.
- D1: session-owned jobs, unique submission IDs, copy leases, source metadata and temporary input links.
- R2: private uploaded/generated MP4s. The public library is not in R2: its clips are static assets under `/media`, listed in `public/media/gallery.json`. Recorded runs carry their prompt, camera terms, settings and confirmed cost; supplied clips carry model provenance without an invented setup. Cards use separate small previews; imports and upscales keep the full files ([media preparation](media-previews.md)).
- Icons: `public/favicon.svg` is the Genobi mask from `src/components/GenobiMark.tsx` with its colours fixed (lime outline and band, dark face), so it reads on light and dark tabs. `npm run favicon` renders it into `public/favicon.ico` (one 32 px PNG in an ICO container) and the 180 px `public/apple-touch-icon.png` with the Playwright Chromium the browser checks use; rerun it after changing the SVG. Pages serves all three as static assets outside `_routes.json`, and the local server serves them from `public/` (Vite) or `dist/` (production).
- MP4Box: bounded range inspection of stored videos for trustworthy upscale dimensions, duration and estimates. No Python, no FFmpeg and no system binary on either adapter.

Keep the tab open and visible until a generated clip is saved. Refreshing, navigating away or closing the tab clears its in-memory key; re-enter it to resume polling. No credential is read from or written to browser storage. An uncaptured provider link may expire after approximately one hour. A job nobody returns to is closed as `expired` after 30 minutes rather than left unfinished; see Limits and lifecycle. The adapter does not claim durable unattended completion or cross-device accounts.

Standard, non-fragmented MP4s with one video track are supported. Uploads: 50 MB, 20 seconds, at most 2560 × 1440 pixels and no dimension above 2560. Generated downloads need a known byte length and must be below 250 MB. Unsupported metadata produces an error instead of an invented estimate. The provider controls exact output rounding and final charges.

## Limits and lifecycle

Submissions, credits, job polling, history and private media have per-minute limits. The health endpoint is not rate-limited by the application. `shared/limits.ts` holds the numbers once; the Worker counts them in D1 so all isolates share a window, and the local Express server counts the same buckets in memory. The local server reads `localRateLimit`, which raises only `history` to 600: its reads are memory reads on the owner's machine, and one page load makes about twenty of them, so the hosted 60 ran out after a few reloads.

| Bucket           | Per minute                | Route                                            |
| ---------------- | ------------------------- | ------------------------------------------------ |
| `submit`         | 8 per session             | `POST /api/jobs`, `POST /api/uploads`            |
| `submitPerIp`    | 20 per IP                 | the same writes, hashed client IP (Worker only)  |
| `settingsPerIp`  | 30 per IP                 | unpaid deployment endpoint/preset settings       |
| `settingsGlobal` | 300 across the deployment | the same settings writes                         |
| `credits`        | 20 per session            | `GET /api/credits`                               |
| `poll`           | 120 per session           | `GET /api/jobs/:id`                              |
| `history`        | 60 per session            | `GET /api/history`                               |
| `media`          | 600 per session or link   | `GET`/`HEAD /api/clips/:id`, `/api/input/:token` |

These bound this deployment's own Worker, D1 and R2 usage. They are not a spending control: generation is charged to the visitor's own BFL key, which the pre-submission balance check covers separately.

Unpaid deployment settings apply the hashed-IP and deployment-wide limits before
their per-session limit or body parsing, so a fresh cookie does not reset the
caller’s allowance. Settings bodies are limited to 2 KB while streaming, including
requests without `Content-Length`. At most 10,000 session settings records can
exist. At that ceiling a new session displaces the least recently saved record in
the same transaction instead of being refused, so rotating cookies cannot lock
every visitor out until records expire; existing sessions update in place, and
jobs keep polling the endpoint recorded on their take. Choosing the default Cloud setting does not
create a record for a new session. Settings expire after 30 days.

Every hosted workflow quote records its location and template, including ordinary
Comfy Cloud runs. `Genobi-Run-Location` and `Genobi-Workflow` expectations must
match before pricing or submission; a mismatched Cloud request is refused too.
Paused chains also compare their quote with the current location, template and
deployment endpoint. After a settings change, reading a chain with its caller key
quotes the stage again without submitting it; a keyless read hides the stale quote
and asks for the key. The refreshed quote still needs a separate approval.

**Project media is a local limit.** The Editor's per-file and per-project limits
(`DIRECTOR_MEDIA_BYTES` and `DIRECTOR_PROJECT_BYTES` in `shared/director/types.ts`,
both 150 MiB) bound the in-browser bundle and the local server's project copy. The
Worker compiles that module but reads neither constant: it has no project copy, takes
no project media, and keeps its own upload limit (`MAX_INPUT_BYTES`, 50 MB above). On
the hosted site the 150 MiB limit therefore bounds browser memory only. Before any
hosted route accepts project media, give the Worker its own limit, set from
Cloudflare's rules for the plan in use (the Workers request-body limit and R2's
single-request upload size), rather than reusing the local constants.

Stored media targets 250 MB per visitor and 3 GB per deployment. `saveSource` enforces the session target after an arrival; the sweep enforces the deployment target in bounded passes. Oldest clips are evicted first, preserving the newest clip. A single result is capped at `MAX_RESULT_BYTES`, with a test requiring it to fit within the session target. These are cleanup targets, not transactional reservations or protection against concurrent growth.

Quota eviction removes the R2 object and source metadata, but retains the generation record and idempotency key until normal retention. The record keeps its successful outcome and cost for daily counts, clears the playback URL and marks media unavailable. History can explain that the video is no longer stored without presenting a dead player. Replaying the original request still returns the original job rather than submitting again. Download clips to keep a copy beyond storage limits.

`shared/lifecycle.ts` holds the matching time limits. Only a browser with the visitor's key can advance a job, so nothing in the runtime can finish one on a closed tab. `worker/sweep.ts` closes the record instead:

- Jobs still non-terminal 30 minutes after creation become `expired`, with their polling and delivery links cleared. The same rule runs when a returning tab reads the job, so a reader and the background sweep never disagree. This also ends the case where a stored result whose metadata could not be read was re-inspected on every future poll.
- Capability links past their two hours, and closed rate-limit windows, are deleted.
- Job and source records, and the R2 objects those sources own, are eligible for deletion after 30 days. This matches the cookie duration; activity can renew the cookie, but does not extend record retention.

Job expiration, media cleanup and job deletion each select at most 100 rows per run. Closed capability-link and rate-window deletion, and the daily aggregation query, are not subject to that row limit. Storage eviction is also bounded per invocation, so a backlog may need more than one pass.

Before it deletes anything, the sweep aggregates each UTC day into `daily_stats`, so retention costs the detail and not the counts. That is the whole of this deployment's own measurement, and it lives in [`observability/`](https://github.com/koshimazaki/Genobi/blob/main/observability/README.md) — the module, the reader and the policy it follows.

The sweep has two triggers. `wrangler.jsonc` registers a five-minute cron trigger for the Workers deployment. Cloudflare Pages has no cron trigger, so on the Pages deployment the same function also runs in the background from `GET /api/health` and `GET /api/history` — the two routes a page load hits once each, never the four-second poll. A conditional D1 write claims the interval, so whichever trigger arrives first does the work and the other returns immediately. On Pages this means housekeeping costs scale with visits rather than with time.

A durable background runner that could actually finish an abandoned job is a separate design: it needs key custody, which this deployment deliberately does not have.

## Reproduce

Requires Node 22+ and a Cloudflare account with Workers, D1 and R2 enabled. The initial deployment uses the account’s Free plan defaults; no custom CPU allowance or plan upgrade is configured. Complex metadata can hit runtime limits even below the input byte ceiling.

```sh
npm ci
npm test
npm run check:worker
npm run build
npx wrangler d1 migrations apply flux-studio-lite --local
npx wrangler dev
```

## Deployment

Production is deployed from this public repository. The `Deploy production`
job in [CI](https://github.com/koshimazaki/genobi/blob/main/.github/workflows/ci.yml) runs only on a push to `main` of
`koshimazaki/genobi`, after the verify and Cloudflare jobs pass. It builds the
Pages bundle, applies pending D1 migrations to `flux-studio-lite`, deploys that
exact bundle to the `genobi` Pages project and checks `/api/health`. The same
workflow file lives in the private camera-director repository, where a
repository guard keeps the job from running even if a credential is added
there, so production has one deployment path. The Pages project, D1 database
and R2 bucket are the existing ones; the older resource names are kept on
purpose, so no data moves.

The job reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from a GitHub
environment named `production`. Without them it skips rather than fails, so
`main` stays green on a fork. Cloudflare's `Cloudflare Pages: Edit` and
`D1: Edit` are account-scoped, so restrict that environment to the `main`
branch and add a required reviewer: a merge then waits for an explicit
approval before production data is touched. The token reaches only the
migration and deploy steps — never pull-request CI, `npm ci` or the build — and
fork pull requests are never given secrets at all. Keep production migrations
additive, so the previous deployment keeps working while Pages switches
versions.

`npm run deploy:pages` remains the manual fallback from a clean checkout of
`main`; it records the checkout's commit hash on the Pages deployment.

For another account, set `CLOUDFLARE_ACCOUNT_ID` and update the database/bucket bindings in `wrangler.pages.json`. The original Workers target still uses `wrangler.jsonc`. The earlier catalogue kept its clips in R2 under `library/`. Those objects are now unreferenced: the app serves library clips as static assets, and the sweep only collects keys it can derive from a job, so they will not be cleaned up automatically. Delete them by hand once the new catalogue is live:

```sh
npx wrangler r2 object delete flux-studio-lite-media/library/library-01.mp4 --remote
# and the same for the other retired library objects
```

Create the corresponding D1 database and R2 bucket, apply every file in `migrations/` remotely before deployment. `0002_lifecycle.sql` adds the indexes and the `sources.created_at` column the sweep needs; `0003_stats.sql` adds the `daily_stats` table. `0004_takes.sql` adds the nullable `jobs.take` column each reservation writes; apply it before deploying code that names the column. `0005_quotes.sql` adds the `quotes` table the quote route and the sweep use. `0006_source_hashes.sql` adds the nullable `sources.sha256` column uploads write. `0007_chains.sql` adds the `chains` table the chain routes and the sweep use. The catalogue needs no seeding: library clips are deployed static assets, and an upscale of one lends BFL the public asset URL instead of a private R2 object, so no capability token is minted for it.

```sh
npx wrangler d1 migrations apply flux-studio-lite --remote
# Add future curated clips to public/media with their recorded inputs; no R2 seeding.
```

Do not provision a BFL secret: each visitor supplies their own key. Do not log request headers or provider bodies. The Worker only forwards keys to allowed BFL API hosts and refuses redirects. Input-video capability links expire after two hours. Normal clip playback requires the owning browser's HttpOnly cookie.

Apply additive migration `0009_deployments.sql` before publishing this version.
It creates session endpoint/preset settings, two-hour input receipts and temporary
companion-output delivery records. Housekeeping removes expired receipts/delivery
records and settings older than 30 days. It introduces no provider secret or binding.

Companion delivery receipts remain until the job’s Ready state and all audio
links are durably saved. If that final save fails, the next poll reconstructs
the links from the receipt and the already saved audio sources without another
generation. Cleanup after a successful save is best-effort; the retention sweep
reclaims a receipt whose immediate deletion failed.
Each recovered audio source must also have its R2 object. A missing object is
copied again from the retained receipt. If source insertion succeeds but quota
eviction fails, cleanup preserves the verified bytes owned by that source;
invalid bytes and a failed insertion with no source row are removed.

## Verification boundary

### Paired agent runners

Apply `0008_runner_relay.sql` before deploying the runner relay. It adds private
pairing/session tables and a unique active-request index; no binding or secret
is added. `/api/runner/*` and `/api/agent/*` are keyless control routes with
their own ownership, custom-header and bearer checks. Existing generation routes
still require the visitor's provider key. Pairing creation/claim uses the
`runnerPair` bucket (10/minute per hashed client IP); authenticated heartbeats use
`runnerPoll` (120/minute per pair). Agent starts use the existing submit bucket.

Pairings expire in 24 hours. Relay sessions are eligible for deletion after 24
hours; existing cron/Pages housekeeping removes at most 100 sessions and 100
expired pairings per sweep. It stores neither provider credentials nor raw
terminal transcripts. Session prompts and bounded progress are private D1 records,
separate from count-only statistics and optional operational history.
See [runner pairing](runner-pairing.md) for the manual acceptance procedure,
failure semantics and the current local asset/approval boundary.

Workerd tests exercise real isolated D1/R2 bindings with fake upstream BFL responses: concurrent idempotency, canonical replay comparison, uncertain-submission protection, account checks, MP4 upload validation, upscale URL/estimate, library-clip upscale without a capability token, result copying, byte ranges, session isolation, read-route rate limits, job age-out and a cron-triggered sweep. They spend no provider credits. Live paid generation, real-device playback and load testing are separate checks.

## Temporary-key decision

The app uses temporary key entry. No native helper, key database or shared Wrangler BFL secret is included. The app retains the key only in page/request memory. Refresh and Disconnect clear it. The backend receives it transiently and must not be described as unable to access it.

Finished videos and job records remain in D1/R2 under the anonymous browser cookie, independent of the key. Download links create user-owned copies. Clearing the cookie loses access; a new hostname has a separate browser library. Pending jobs need the key again after refresh.

## Pages deployment details

Set `CLOUDFLARE_ACCOUNT_ID` and run `npm run deploy:pages`. `scripts/build-pages.mjs` builds `.pages/_worker.js` (leaving `node:*` imports external for `nodejs_compat`, which `@comfyorg/sdk` needs) and writes the standard configuration into ignored `.pages-project/`; Pages rejects custom configuration paths and `account_id` in its config. The deployment script supplies the account through the CLI environment. Local Pages smoke check: `npx wrangler pages dev ../.pages --cwd .pages-project --port 4322` after `npm run build:pages`. No paid provider request is part of deployment.

Public static videos follow [Pages' documented range behavior](https://developers.cloudflare.com/pages/configuration/serving-pages/):
a `Range` request currently receives the full asset with `200`, rather than
`206` partial content. The Worker's private `/api/clips/*` delivery has its own
byte-range handling. A healthy public video URL does not verify seeking on
every device.

Pages accepts at most **25 MiB per static file** (26,214,400 bytes), including
full project media. Keep masters within that ceiling without replacing them
with card previews. `preload="metadata"` can fetch a whole public MP4 under
the range behaviour above: gallery cards, the Camera library/hero, Taste videos
and watch/embed players use `preload="none"` and show posters until interaction.

Pages routes `/watch/*` and `/embed/*` through the Worker for server-rendered
preview metadata and a branded player. The routes accept only catalogue IDs
and use bundled public clips, including explicitly labelled demo footage under
`/media/template-gallery/`; they do not publish private R2 objects. Worker
responses set their own security headers: only `/embed/*` allows framing, and
both disable microphone access. `_headers` does not apply to Worker responses,
so the studio's `frame-ancestors 'none'` cannot block the embed. The hosted
studio keeps `microphone=()`: it has no voice route, and its Voice pill says so
without asking for the microphone. No retention quota or remote migration
changes accompany these routes. See [template gallery](template-gallery.md#headers).

## Taste previews

The static page permits sandboxed frames from the curated Taste example origins
listed in `public/_headers`, including the direct Alien.js, Space.js and
p5.brush demo hosts. Cards mount only visible demos and release off-screen
frames. Credited preview images are allowed only from `raw.githubusercontent.com`
and `claudia.gallery` in addition to local images. Custom references are never embedded. The existing
script, connection and ancestor restrictions remain in effect; upstream sites may
still reject framing. Personal shelf persistence and agent context are local-only.
