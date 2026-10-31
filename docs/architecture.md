---
tags: [architecture, backend, cloudflare, bfl]
summary: One API served by Express locally and a Pages Worker in the cloud, and how paid requests and keys stay safe.
---

# Architecture and the cloud boundary

The optional [Hermes profiles](hermes-profiles.md) and [local supervisor](supervisor.md)
reuse agent-marked MCP and private sessions without changing hosted execution or
paid approval. The supervisor grants no editing or approval rights.

Model and execution defaults from `/taste#setup` travel in validated agent context
as advisory `selection`, separately from licence preferences (`usage`). They do not
authorize generation or change the running agent. See [licence-aware direction](licence-strategy.md).

```text
                                      ┌─ Express → JSON + files + MP4Box
React composer → same-origin /api/* ──┤
                                      └─ Pages Worker → D1 + R2 + MP4Box
                    │                                  │
                    └──────── BFL submit / poll ───────┘
```

`shared/` owns model inputs, camera wording, pricing, lifecycle, replay rules, rate limits and catalogue validation. The browser and both adapters use the same composer and contracts, and each adapter validates every input again rather than trusting the last one. Neither fetches arbitrary media URLs; local workflows accept only registered, validated Comfy deployment URLs: an upscale takes a validated library entry or a session-owned clip id, and generation uses fixed, allowlisted provider endpoints. Image references are bounded inline data URLs, never arbitrary remote reference URLs.

`npm run check:worker` compiles `shared/` and the portable server modules with `"types": []` and no DOM, so a Node-only import in the layer meant to run on Workers fails there while every other check stays green. That gate is what keeps the boundary honest.

## Registered Comfy deployments

Both adapters bind validated Comfy URLs to quotes/takes and require confirmation before reserving and submitting once.
Local tickets stay in memory; hosted tickets stay in session-owned D1 rows for two hours. Outputs become private media. [Camera steps and deployment setup](comfy-deploy.md#use-it-from-camera).

## Browser Recreate inputs

`src/run-inputs.ts` caches references and editable Klein layouts in IndexedDB.
The private cache holds no credentials or provider ids: 30 days, 50 runs, 64 MiB.
Recreate restores the source and references; video/guide ids follow existing media
retention. Missing inputs need reattachment. Newer edits supersede pending reads.
Failed writes report a tab-only fallback without retrying a paid submission.
Only Klein exposes boxes. Other models omit parked regions; replay stays unchanged.

## Local comparison records

Arena uses session-owned records, measured media and explicit pairing. Its quoted
Generate path reserves each request key before submission; the hosted studio
hides it. [Ownership, revision and handoff contract](arena.md).

## Agent terminal transport

The [CLI](genobi-cli.md) invokes the MCP tool definitions over the same local API.
Private connection profiles retain a session capability between processes and
can be explicitly shared by MCP. Model selection defaults are advisory; paid
submission still requires a quote and stable idempotency key. Terminal and MCP
use the same project memory and Taste proposals. No CLI adapter runs in Pages.

## Taste layer and motion studies

`/taste` is a catalogue, credit page, personal reference selection and intended-use planner.
Its owner-only local shelf writes share the private, revision-checked Taste profile;
linked project context and built-in runner briefs expose the effective selection.
Curated defaults include all references; explicit exclusions and custom links persist.
Cards use curated direct demo URLs or local animation, drawing and type samples.
Only visible demos run; Stop/Play controls and reduced-motion defaults are respected.
Uncommon Web receives presentation-only credit in the lower lineage section.
See [Taste selection](taste-memory.md#curated-taste-selection).
`shared/licensing/` supplies the same curated data and report rules to the UI and
read-only MCP `genobi_licences` tool. Validated `usage` preferences enter the local
agent context; they do not override provider terms or enforce legal permission
at a generation endpoint. See [licence strategy](licence-strategy.md).

Signal motion previews use a decorative snapshot of the current section and a
vendored, separately licensed construction effect. The local GLB turntable and
ASCII sample use Three.js. No generation API is called. See [construction
motion](construction-motion.md) for capture and licence boundaries.

## Routes

The landing Gallery and Director read one `shared/templates/` catalogue.
`shared/gallery/` derives filters and presentation, and renders public watch/embed
HTML. Express and the Worker serve `/watch/<template-id>` and
`/embed/<template-id>` before private API handling. These routes use only curated
catalogue media, never visitor jobs or storage. The embed alone permits framing.
See [gallery and sharing](template-gallery.md). Voice mode's mic sits in the
same header, in every section; its routes are local only (below).

One Comfy key serves two routes, and the wording the studio uses for them is "partner and hosted models via Comfy Router; open workflows via Comfy Cloud (API v2)". `router` runs partner and Router-hosted models by id (`shared/comfy/router.ts`). `workflow` runs Genobi's own API-format graphs through the official SDK, `@comfyorg/sdk` (MIT), against Comfy API v2 (`server/comfy-sdk.ts` behind the `WorkflowClient` interface in `shared/comfy/workflow.ts`). Router cannot run a graph and does not front Cloud, so neither wraps the other. `bfl` is BFL's own API, used for Klein's API and for a FLUX Router entry when the key is BFL's.

The upscale is one of those Router entries: Router lists BFL's upscaler as `bfl/video-upscale-v1` ([schema](https://docs.comfy.org/router-schemas/bfl/video-upscale-v1.json), checked 23 October 2026), so one Comfy key covers draft, review and upscale. Both adapters build its body with `upscaleBody` (`shared/upscale.ts`): the local server sends the source inline as base64 (it is loopback-only, so Router cannot fetch from it), the hosted Worker sends its two-hour `/api/input/` link, and a Comfy key sends no `user` field, which Router's schema does not declare. The schema page documents only the synchronous route. `ComfyRouter` uses the queued route, which refuses models that answer in bytes; this model answers with BFL's JSON result document, so the queued route should accept it, but that is unverified until a real run, as is how large an inline body Router takes (it documents a `413` without a size; a 50 MB source is about 67 MB of base64). The quote keeps BFL's upscale price as an estimate, because Router documents no credit rate for this model; the charge is read from `X-Comfy-Credits-Used` on the result, as for every Router run.

MiniMax H3 is also a Router entry, `minimax-h3-router` on `minimax/minimax-h3` ([schema](https://docs.comfy.org/router-schemas/minimax/minimax-h3.json), version `c0e2e941ffff`, checked 27 October 2026): reference to video from two images and no guide, beside the four guided OmniRef workflows. `h3RouterBody` (`shared/comfy/h3-router.ts`) is the only place its body is built, for both adapters: `content` is one text item and the two references as `image_url` items with `role: "reference_image"` (the character sheet, then the storyboard), sent as the data URLs the person gave, which the schema accepts; `duration` 4 to 15 whole seconds; `resolution` `768P` for HD and `2K` for Full HD; `ratio` one of the schema's six, from the aspect. The schema states no image size or count, so the studio's own reference bounds apply (each under 5 MB, all under about 11 MB). The result is the terminal task document; `ComfyRouter.poll` reads `task.content.url` once `task.status` is `succeeded`, and any other status or a `task.error` is an error with its credits kept. That link lasts usually 12 hours (Router's signed re-host), shorter if Router falls back to MiniMax's own link, and has no refresh route; the job copies it on the first poll after completion, and a `403`, `404` or `410` from it marks the run expired rather than retrying. The quote uses Comfy's published H3 Reference to Video rate (27.16 credits a second at 768P, 39.22 at 2K, [partner-node pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing), checked 27 October 2026); Router states no rate of its own, so the first approved run's credits header shows whether Router bills the same. None of this has run against Router yet.

The SDK imports `node:crypto`, `node:fs`, `node:path` and `node:stream` at load, so it cannot sit in `shared/`. Both adapters import the same client; the Worker bundle leaves `node:*` external (`scripts/build-pages.mjs`) and workerd resolves it under `nodejs_compat`. `tests/worker-workflow.test.ts` runs that path inside workerd against a fake Comfy Cloud; it has not run against the deployed Pages project. The SDK hashes uploads with WebAssembly compiled at runtime, which Workers refuse; the hosted adapter therefore uploads through the official low-level SDK transport, omitting the optional dedup hint and letting Comfy hash the bytes. The local studio retains the high-level SDK upload path.

Where workflows run is the **run location**, one setting every `workflow` entry follows: Local ComfyUI, Comfy Cloud or a registered Comfy deployment ([run location](run-location.md)). The local server reads its default from `GENOBI_WORKFLOW_DESTINATION` and keeps a per-session choice the studio and agents share (`/api/settings`); the take records the location and template a run used, and a quote cannot be spent under another. Comfy Cloud runs through the SDK; a local ComfyUI runs through `server/comfy-local.ts`, a client of ComfyUI's own HTTP API (`/object_info`, `/upload/image`, `/prompt`, `/queue`, `/history`, `/view`), because the SDK reads a deployment URL only from the process-wide `COMFY_BASE_URL`. `server/workflow-destinations.ts` sends a run where its take says and a poll to the client whose address the handle names. A Comfy API deployment (a Comfy Developer Platform deployment's https URL, the server's default destination or `GENOBI_DEPLOYMENT_URL`) runs through the same SDK on its own base URL: the SDK reads a base only from `COMFY_BASE_URL` while a client is constructed, so the deployment client sets it for that one synchronous construction and restores it (`withBaseUrl` in `server/comfy-sdk.ts`), and its fetch reaches that origin only. The hosted Worker defaults to Comfy Cloud and also supports per-session registered Comfy deployments. `/api/health` identifies the runtime independently of editable workflow settings; `/api/capabilities` lists supported operations and their readiness probes on both adapters. The SDK client refuses to run while the operator's own `COMFY_BASE_URL` is set rather than let it redirect a visitor's key.

A template may list the only hosts that can run it (`WorkflowTemplate.hosts`): the [Openjutsu character swap](openjutsu-swap.md) needs a custom node pack, so it runs only on the server's Comfy deployment, built from the pins in `comfy-build/` ([Comfy Developer Platform deployment](comfy-deployment.md)), never on Cloud or a local ComfyUI. The take records it (`recipe.location`: `deployment`); the studio's Local or Cloud expectation does not apply to it. Its quote carries a `billing` line in place of a price. A take an earlier build recorded at a location this build has no client for (`isRetiredLocation` in `shared/comfy/destination.ts`) still loads: polling closes it as expired, holds no key slot and sends nothing.

Each workflow entry runs a template from `shared/comfy/workflows.ts`, which a session may swap for another template serving the same capability (text to video, image, upscale, acoustic space, layout to render).

A model offered both open and as an API carries both routes as two registry entries under one menu row: FLUX 3 Image Klein is `flux-3-klein` on `workflow` (Comfy's official Klein text-to-image graph, `workflows/flux-3-klein-t2i.json`, on Comfy Cloud or a local ComfyUI) and `flux-3-klein-api` on `bfl` (`POST https://api.bfl.ai/v1/flux-3-image-klein`, checked against BFL's API reference on 21 October 2026). Router publishes no Klein schema, so the API run takes a BFL key and the open run a Comfy key; `requireRoute` refuses the other pairing before a quote. On a local ComfyUI the open run needs no Comfy key and costs nothing, and `GENOBI_LOCAL_MODELS` (or `GENOBI_KLEIN_MODEL` for Klein's diffusion model) names its model files as ComfyUI lists them.

Router is not generally available yet; a key it has not switched on gets `403 not_enabled`, which the studio reports as such. `node scripts/check-router.mjs` (with the key saved in the studio, which macOS keeps in the Keychain, or `COMFY_API_KEY`, which wins) asks Router's free catalogue reads (`GET /v2/models` and each Router model Genobi runs), which generate and charge nothing, and prints whether any said `not_enabled`. It cannot see the queued submit's own `not_enabled` for a credential without a Comfy workspace; only a paid run shows that.

## Paid requests

Everything here exists because a request costs the visitor real money.

Comfy's customer balance includes Cloud subscription credits and prepaid credits.
Both adapters read it through `ComfyRouter.balance` after verifying the key with a
free catalogue request. The [customer API schema](https://api.comfy.org/openapi)
(checked 26 October 2026) defines `amount_cents` and the deprecated, misleading
`amount_micros` alias as fractional cents, not millionths of a dollar. The reader
prefers the effective balance after pending charges when present, preserves
fractional cents and accepts only USD. An unavailable or malformed balance stays
unknown; it is never reported as zero. This USD balance is distinct from a run's
`X-Comfy-Credits-Used` receipt and an operator's credit-denominated spending cap.

A submission is persisted with its idempotency key and budget reservation **before** the API call. An uncertain POST is never automatically repeated — polling and copying may retry, submission may not — and an interrupted `submitting` job becomes an explicit error asking the operator to check their BFL usage rather than quietly trying again.

A replay of an existing idempotency key is answered by one function for both backends (`shared/idempotency.ts`): fields are read in a fixed order, gaps left by older jobs receive the defaults a new request would get, and nested camera selections compare by value rather than key order. Omitting a field the original carried counts as a change, not a match. This mattered: the two backends previously disagreed, so dropping a field passed locally and conflicted in production. A song's `lyrics` are appended to that list only when the request carries them, so every run recorded before music keeps the settings hash it was stored with, while the same key with other lyrics is a `409`.

**Music** is a fifth generator, `audio`, with one entry, `minimax-music-3`: Comfy's official MiniMax Music 3 graph on the workflow route (`shared/comfy/music.ts`, `workflows/minimax-music-3.README.md`). It goes through the same lifecycle as video: `server/validate-audio.ts` keeps the caption (`description`), lyrics and whole seconds, then quote, reservation, one submission, poll on node `35`, and `server/job-output.ts` saves the song as `.mp3`, `.wav` or `.flac` by its proven header, measured by the shared `inspectStoredAudio` (no ffprobe), and keeps a song it cannot measure rather than fetch a paid result again. The entry is `localOnly`: the hosted Worker refuses it before any price, quote or reservation (`501 audio_local_only`, `worker/quotes.ts`), because its copy step stores MP4s and stills only, and its workflow catalogue and the hosted model menu leave it out. The studio shows the "MiniMax-Music3" credit its licence asks for ([licences](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md)).

In the Worker, D1's unique `(session, idempotency)` constraint reserves a request before its single paid submission, and an existing request id cannot be reused for different settings. This prevents duplicate submissions; it does not reserve funds in the visitor's BFL account, where BFL remains authoritative for the final charge. Costs returned as credits convert to USD at one credit per cent, and estimates and confirmed charges stay separate fields.

Both adapters measure an uploaded MP4 with the same bounded reader (`shared/mp4.ts`), reading metadata in 128 KiB ranges and skipping the media payload, so an upscale estimate cannot differ between local and hosted. Dimensions come from the stored object, never from a browser query parameter, because the price depends on them.

## Job lifecycle

`submitting → Pending → Reasoning / Generating → copying → Ready`

Errors, moderation and expiry are terminal, as is the retired `stopped` state that older rows may still carry. `Ready` means the file and its measured metadata exist, not merely that the provider returned a URL. Downloads use a bounded stream, a temporary file and an atomic rename, and only documented BFL hosts are allowed — redirects are rejected, and no key is sent to media delivery.

BFL can return HTTP 500 with a terminal task error. The client recognizes `status: Error` only when the response names the requested task; generic outages remain retryable. This prevents a failed job from keeping its last Planning state.

A failed Comfy Cloud workflow run carries the SDK's `job.error`. Its text is the provider's and is never shown as written: `server/comfy-run-failure.ts` matches it against a few known causes (GPU memory, a missing model, node or file, a content refusal, a rejected input) and names the failing node class only when it reads as a plain identifier, so the job says, for example, "Comfy Cloud ran out of GPU memory at the TextGenerate node." instead of the generic line.

There is no way to call off a run, and that is deliberate. BFL publishes no
cancel, abort or delete endpoint for an in-progress task, and its
[billing policy](https://help.bfl.ai/articles/5950329591-what-are-the-flux-tools)
is that "you are only charged for successful results. Failed or moderated
requests do not consume credits." A control here could therefore stop neither
the work nor the charge, only the collection of a result already paid for. Its
best outcome was to do nothing and its worst was to discard a clip you had
bought, so it was removed.

Any card can instead be hidden and restored in this browser. Hiding is a view
filter over the job list rather than a change to it, so a hidden run keeps
being polled, saved and charged exactly as a visible one does. It is also not a
withdrawal of the selection: hiding the card of the run the studio is showing
leaves that run in the main view and the composer, and only the fallback — what
the studio shows when nothing has been chosen — is drawn from the visible cards.

`stopped` remains a recognised terminal status so rows created before this
decision still read as cancelled rather than being polled again against a
cleared polling URL.

No state is open-ended. A job still running 30 minutes after creation becomes `expired` (`shared/lifecycle.ts`), whether a returning tab reads it first or the background sweep does. `expired` rather than `Error`, because the studio stopped watching, which is not a claim that BFL failed.

Quota eviction removes media without deleting the generation row or its idempotency reservation, so the row keeps its outcome and cost while marking playback unavailable. A successful generation is not reclassified as a failure because its file aged out.

The sweep ages out abandoned jobs, deletes closed capability links and drops records with their objects at 30 days. Workers runs it on a five-minute cron trigger; Pages has none, so there the same function runs in the background from `/api/health` and `/api/history` — routes a page load hits once each, deliberately not the four-second poll. A conditional D1 write claims the interval so the two triggers never duplicate work. On Pages this means housekeeping scales with visits rather than with time.

## Takes

A `Ready` job is a **take** (`shared/take.ts`): a record of what made the result, read by `GET /api/takes/:id` on both adapters. It holds a stable operation id (the job id, unchanged by replays), the recipe — the registry entry, its `recipeVersion` and the route the key actually reached — the input hashes, the output asset ids, the receipt (estimate, confirmed charge, Comfy credits) and the Director project revision the request named, if any.

The take is the job read another way, not a second record. Only what the reservation alone knows is stored separately, as a take start: the recipe and the input hashes (SHA-256 of `canonicalInput`, of each image reference as sent, and the upscale source's asset id). It sits beside the job — the `jobs.take` column in D1, a private field in `.local/jobs.json` — and never in public job data, which keeps exposing only a reference count. Outputs and the receipt come from the job itself, so eviction marks a take's output unavailable without changing the take, and a late cost report is never copied stale.

The route answers `409 take_not_ready` until the output is in storage we own, and `404 take_missing` for runs reserved before takes existed. `projectRevision` is a request field and part of replay: the same idempotency key for another revision is a conflict, not the earlier take.

### Quotes

`POST /api/quotes` runs a submission's checks without submitting (`shared/quote.ts`): the same validation, the same route check (`requireRoute` in `shared/provider.ts`: LTX and the open Klein graph need a Comfy key, Klein's API a BFL key; FLUX 3 and the upscale run on either), the same price (`estimateRunUsd`, which both adapters now reserve), on the hosted adapter the same balance check, and on the local demo key the same demo budget and session limit (`runCredential` in `server/keys.ts` decides whose key a run spends, once, for both). A quote is refused with the error the submission would give. It answers with a one-use confirmation id, the estimate, the recipe and an expiry ten minutes out. A submission that sends the id as `Quote-Id` must come from the same session and match the quoted settings hash; it spends the quote in the step that reserves the run — a D1 batch that claims the quote only while it is unspent, unexpired, for those settings and while no run holds the request id, then inserts the run only if it made that claim. A replay of the same request returns its run; any other use of a spent quote is `409 quote_used`, an old one `410 quote_expired`, another session's `404 quote_missing`, other settings `409 quote_mismatch`.

A quote holds no funds and is optional for the studio; the budget and balance are checked again, atomically, when the run is reserved. Agents quote before every paid step. The MCP server (`mcp/generation.ts`) enforces that: `genobi_submit` requires a `quoteId` and an agent-chosen idempotency key, sends them as `Quote-Id` and `Idempotency-Key`, and makes one request. A lost answer or a server failure is reported as an uncertain outcome, with the instruction to check `genobi_jobs` and to resubmit only with the same key, which replays instead of paying again. Replays are matched per studio session, and the MCP server's session cookie lives only in memory (its first requests wait for one shared `GET /api/health` that sets it, so calls sent at once share one session), so the local server refuses a key that already belongs to another session (`409 idempotency_other_session`) instead of starting a second run: an agent retrying after an MCP restart is stopped, not charged twice. The local server has one operator, so that refusal reveals nothing; the hosted Worker keeps replays per visitor. Expired quotes are dropped by the sweep (and locally on the next quote or sweep); the run a quote paid for keeps its own replay row.

### Chained jobs

A chain (`shared/chain.ts`) is an ordered list of up to six paid stages with an approval before each one: draft → review → upscale. Each stage is the input a single submission takes, through the same `validateInput`; every stage after the first reads an earlier stage's `Ready` take. Only an upscale reads one today, by the take's asset id. Stage 1 is text (video or image) or an upscale of an uploaded or library clip. Edit and image-to-video send their media as request bytes, which a chain would have to store until approval, so a chain refuses image references and those stages join once they read an asset id.

Nothing runs without an approval, stage 1 included. `POST /api/chains` validates every stage and quotes stage 1 only; a stage 1 the submission would refuse refuses the chain, and nothing is stored. The chain pauses with that quote. `POST /api/chains/:id/approve` with the pause's quote as `Quote-Id` stores the approval on the chain as that request's own claim (a fresh claim id; on D1 a compare-and-set), checks again that the chain was not cancelled and still holds that claim, then submits the stage as an ordinary job under the key `chain-<chain id>-<stage>`, which spends the quote in the job's own reservation. Any other quote, including the spent quote of an earlier stage, is `409 quote_mismatch` before anything is submitted. An approval that finds a claim standing submits nothing and answers with the chain, and the key is fixed per stage, so a repeated or concurrent approval can never start a second run: one approval, one provider call. A submission refused before its reservation (an expired quote, the demo budget, a key that cannot run the stage) clears only its own claim, so the stage is paused again and unpaid, and a cancel can never land under another approval still on its way to its reservation.

An approval whose request was lost after its claim and before any reservation would hold the stage forever, so it lapses: one standing longer than `APPROVAL_TIMEOUT_MS` (the quote's ten minutes plus one) with no job reads as paused again (`liveApproval` in `shared/chain.ts`, used by both adapters). Its quote was made before the claim, so by then it has expired and the lost submission can no longer reserve a run; the next read quotes the stage afresh. A stage whose job exists is never paused again, however old its approval: a reserved run is never sent twice.

The chain stores no copy of job state. Each stage's status is read from the job its key finds: running, ready, or failed for every other ending. A failed stage fails the chain, and an uncertain submission is never retried; approving again answers with the failed run. When a stage's job is `Ready`, `GET /api/chains/:id` pauses the chain at the next stage and quotes it with the input it will now read (the take's asset id as its source). Reading also replaces a pause quote that expired or was spent elsewhere. Quoting is free and sends nothing, but it needs a key: the hosted adapter answers `needsKey` without one, and a quote the route refuses (an LTX take upscaled on a Comfy key, a take too large to upscale) comes back as `pauseError` beside the chain instead of failing the read. `POST /api/chains/:id/cancel` works only at a pause; a running stage is `409 chain_not_paused`. On the hosted adapter every POST carries the key, cancel included. `GET /api/chains` lists the newest fifty with their statuses; reading one returns its quote. Chains are owned like jobs: another session's id is `404`.

An output target (`shared/output-targets.ts`) names the frame a chain finishes on, and shapes the chain's last video stage through the entry's `controls`, the way `fitControls` fits the composer:

| Target       | Ratio | Video stage           | Upscale                                                                            |
| ------------ | ----- | --------------------- | ---------------------------------------------------------------------------------- |
| `phone`      | 9:16  | Full HD               | None (1.5× after a draft, which runs at HD)                                        |
| `social`     | 1:1   | Full HD               | None (1.5× after a draft)                                                          |
| `1080p`      | 16:9  | Full HD (1920 × 1080) | None (1.5× after a draft)                                                          |
| `big-screen` | 16:9  | QHD (2560 × 1440)     | 2×, which reaches BFL's 13.75 MP ceiling (about 5062 × 2847); 3× on Acoustic Space |

Social is 1:1 because no entry takes 4:5. LTX takes only 16:9 and 9:16, so social on LTX is fitted to 16:9, and Acoustic Space fits phone to 16:9 too. Big screen generates at QHD because that is the largest frame `checkUpscaleLimits` accepts as input, and 2× costs what 3× would once the output is capped (after a draft it is 3×, giving 3840 × 2160). The amount comes from the frame the entry really makes (`effectiveFrame`): the Acoustic Space workflow sizes its frame by megapixels and caps QHD at 2.1 MP (about 1979 × 1113), where 2× stops short of the ceiling, so it gets 3×. A target appends the upscale it needs, or sets the amount of a final upscale that reads the shaped stage, and refuses stages that would change its frame. An upscale needs a BFL key, so an LTX chain approves its upscale with one.

Locally a chain is a record in `.local/jobs.json`. On D1 it is a `chains` row (`0007_chains.sql`) whose every change is a compare-and-set on `revision`, so an approval claim and a cancel cannot both win. The sweep removes chains at retention; a chain is created before its stage jobs, so it never outlives them.

### Chains in the studio

Camera has no Fast / Studio switch or **Finish at** target: its Generate is
always the ordinary `POST /api/jobs`, and a ready take does not open the review
step on its own (`useReview`'s `offerUpscale` stays off in Camera, so upscaling
is an explicit choice). The chain routes are unchanged and still serve existing
chains, their gallery cards and approvals:

- **A target chain.** `POST /api/chains` with a run as stage 1 and a target
  spends nothing: the server shapes the video stage and appends the upscale the
  target needs. A drafted run becomes draft → upscale (a draft runs at HD); a
  run without Draft is generated at the target's own size, so phone, social and
  1080p need no upscale and the chain has one stage. Big screen always ends on
  the upscaler. Every stage, the first included, waits for the person's Approve.
- **A take's upscale.** On a surface that opts in, the review step shows the
  four targets, the upscale each needs from the measured take (`takeUpscale` in
  `shared/review.ts`) and Quote upscale, which creates a one-stage chain (an
  upscale reading the take by its asset id) and shows the server's quote. A
  target with another ratio, or one the take already reaches, is refused with
  its reason: an upscale keeps the frame.

The review step lays over the bottom of the main view and the gallery shows a card per chain, so
the review never moves the toolbar or the gallery. Every take the review selects,
a newly started stage or a card's Review, first holds the composer in Text to video as an edit of
its own: restoring a selected upscale stage would otherwise switch it to Upscale and hide the step.
A card's Review shows the chain's newest take, its latest stage or else the draft a Studio review
continues. After a reload that draft is read from the chain itself: a Studio chain's first stage is
an upscale whose `sourceId` is the take.

Before Approve the step shows the pause's quote: the recipe, the estimate in USD and the expiry. An
expired quote offers Refresh quote (a free read) instead of Approve. A refused approval
(`quote_mismatch`, `chain_not_paused`, `chain_cancelled`, or no key in page memory) shows its
message, is read again for free, and is never sent again by the page.

An approval's stage is collected however its answer arrives. The page records the stage before
sending, and whichever read first shows that stage's job (the approval's own answer, a recovery
read, or the four-second read of a running chain while the stage is still `submitting`) shows it
once and registers it with `useJobs` by the job's own free read (`track`), not through history. The
hand-off is kept until that registration succeeds and retried with the same backoff, so a failed
read never leaves a paid run unpolled. Any other stage job a loaded or read chain shows (one claimed before a
reload and reserved after it, say) is registered too, without being shown; each job is handed over
once. A stage first read as Ready is also measured: history is read again so
its clip's size is known and the Studio review can quote an upscale of it. An approval refused with an answer (below 500) reserved nothing, so one free read follows. One
without an answer is recovered: the chain is marked uncertain, Approve and Cancel are withheld, and
free reads repeat after 2 s, doubling to at most every 30 s. A read that still shows the stage
paused does not end it, since the lost approval's claim may not have landed yet; recovery ends when
the stage leaves its pause or the approval can no longer reserve work (its quote's expiry plus the
minute `APPROVAL_TIMEOUT_MS` allows for clocks), and the stage stays awaited until then.

The step only sits over a chain's own take (`reviewFor`): a focused chain shows over its draft or a
stage's job, or anywhere while it has no take yet (a Fast chain before its first stage). Choosing a
library clip (a title or Recreate) clears the focus, so an Approve never sits over a clip it would
not act on. Closing a chain's review does not reopen its take as a fresh draft review while a
chain is still waiting on, running or finished from that take (`liveChainFor`); after a cancelled
or failed chain the take can be reviewed again.

A 2–4 s LTX take's upscale request carries 5 s in its placeholder `duration`, as `upscaleAfter`
does; the quote prices the measured clip. Without a key, Generate in Fast and Quote upscale open the
key dialog and send nothing; a pause that could not be priced without one is priced once a key is
entered. The key is read from page memory per request, as jobs read it. `useChains` loads the
session's chains, reads a running one every four seconds so its next pause gets a quote, and hands
each started stage to `useJobs`, whose poll is what moves the job along.

### Uploads

`POST /api/uploads` takes an MP4, a PNG, JPEG or WebP image, or WAV, FLAC or MP3 audio (`shared/uploads.ts`). The declared type picks the reader and the bytes must prove it, so a file is stored and served only as a type its own header confirmed. Both adapters measure with the same bounded readers: `inspectMp4` with the upscale ceilings MP4 uploads always had, `inspectImage` within the 5 MB reference limit, and `inspectAudio` (`shared/audio.ts`), which reads duration from an uncompressed (PCM or float) WAV header, FLAC's STREAMINFO or an MP3 Xing/VBRI frame. An MP3 without one is measured from its size only when frame headers sampled in six windows across the file all share one bitrate; a variable-bitrate MP3 without a frame count, a compressed WAV (such as IMA ADPCM, whose byte rate does not count its samples), Ogg and M4A are refused rather than guessed. Audio is capped at 50 MB and twenty minutes.

Each upload's SHA-256 is recorded privately (`sources.sha256` in D1, computed while the body streams into R2 through a `DigestStream`; a private field locally) and becomes the `sha256` of the take's `source` input for any run that reads it. Generated media is not hashed yet. Audio and image sources carry a `mediaType`; every studio path that expects video (`isVideoSource`) — upscale, Director saved media, Dual Swords — leaves them out.

### Local media tools

The local server runs ffmpeg for `GET /api/media/:id/probe` and `POST /api/media/{trim,frames,concat,crossfade,space}` (`server/media-tools.ts`; space puts an AKUSPACE room on a clip's sound, see [space](media-space.md)); `GET /api/media/tools` says whether ffmpeg is installed. The hosted Worker has neither ffmpeg nor these routes. Every argument list is built in `server/ffmpeg.ts` from validated numbers and paths the server chose — no shell, no request text, no requested codec or filter — and each output format is named explicitly. Inputs are sources the session owns or library clips; clips joined or crossfaded are fitted to the first clip's even size and frame rate, and keep sound only when every clip has it. A trimmed video keeps its own frame, rounded down to even sides for yuv420p. Before a crossfade, each video clip's picture and sound are held or padded to the length the shared reader measured, so a picture that ends before its sound cannot end before the fade. Runs are queued one at a time with a five-minute timeout; results are capped at two minutes of video, twenty of audio and the 250 MB result ceiling. That ceiling holds while ffmpeg writes: every output carries `-fs`, a result cut short at the limit is refused and deleted, and an audio cut whose 16-bit WAV would pass it (duration × rate × channels) is refused before ffmpeg runs.

The local server also keeps a copy of the open Director project (`server/projects.ts`, routes under `/api/projects`); the Worker has none. The studio stays its owner and pushes each revision on top of the one the server last accepted; a stale base is `409 revision_conflict` with the current revision, never a merge. Another session sees nothing until the owner gives it a one-use link code. Agents change the copy only through the Director commands in `shared/director/commands.ts`, at a revision, and the studio applies the same command from the copy's event stream. Nothing on these routes is paid, so they count against their own `edit` limit. Details are on [the Director bundle page](director-bundle/README.md#project-copy-and-director-commands).

ffmpeg is not an authority on media: each output is measured by the same shared readers as uploads, hashed, and saved as a source with `origin: "derived"` and private lineage (`derivedFrom`). ffmpeg's own error text names local paths and stays on the server. Without the binary the routes answer `503 ffmpeg_missing`; tests check the argument lists through an injected runner and run real ffmpeg only where it is installed, so CI needs none. Agents call these routes through the `genobi_media_*` MCP tools (`mcp/media-tools.ts`, [Dual Editor: agents](dual-editor.md#agents)), which share the limits in `shared/media-limits.ts`. A video or audio result can be handed into a linked project copy (`genobi_take_to_project` with `sourceId`, `server/project-derived.ts`) only when every source in its lineage is the reader's own or a library clip; the copy records the operation and its inputs as a `derivation`, without the private ids.

### Onboarding

`StartupConfigurator` opens once per browser on the studio (not an iframe or
the separate public share pages). A local seen flag only suppresses the welcome;
it does not indicate installation or readiness. The Genobi activity bubble can
reopen it. Choices stay in a draft until Save; skipping does not change defaults.
While setup is open the draft and its step are kept in this tab's
`sessionStorage` (`genobi-setup-draft-v1`, `src/setup/session-draft.ts`): a
reload reopens the dialog at the same step with the same choices, and closing
or finishing setup clears it. Only named, checked fields are written (choices,
usage, voice and its folder and model, Hermes' model and provider); provider
keys never are. The dev server pre-bundles every browser dependency
(`optimizeDeps` in `vite.config.ts`), so opening a lazy screen no longer makes
Vite re-bundle and reload the page mid-setup; `npm run check:no-reload` checks
it on a fresh cache.
Creative model openness, agent host, execution and intended use are independent.
The final screen directs local users to GitHub/ComfyUI instructions and cloud
users to the existing key dialogue. Agent setup links describe required handoff;
choosing a host never launches or installs it. Global defaults enter new agent
briefs through the existing context path, with project/session overrides.

### Local voice transcription

Hosted agent starts use an outbound [runner relay](runner-pairing.md): a one-use
pairing code binds a hosted browser owner to the locally configured runner.
D1 stores hashed capabilities and atomically claims launch requests; the local
server records a receipt before spawning its existing restricted `AgentSessions`
path. Progress and Stop return over heartbeats. No provider key, public local
listener, hosted file synchronization or remote paid approval is introduced.
Migration `0008_runner_relay.sql` is additive and required before deployment.

The optional voice section in onboarding reads same-origin voice status and,
with voice ticked, the installer's prerequisite check (`GET /api/voice/setup`:
Python 3.11 and ffmpeg). When voice is not set up on this local server and that
check says `supported`, the summary step's primary button becomes
**Save & set up**; otherwise the check's reason shows and the ordinary Save
stays. That click is the explicit confirmation: the page asks
for a fresh server-issued grant (`GET /api/voice/setup`), then starts the
install with `confirmed: true`, the token and the chosen folder, and shows the
installer's progress inline (`src/voice/install-store.ts`,
`src/voice/VoiceInstallProgress.tsx`, shared with `VoiceSetup`). The grant's
session binding, single use and ten-minute expiry are unchanged; `VoiceSetup`
in studio setup and on the mic stays the advanced path. When the install is
Ready the page prewarms the model and the mic reads its status again. Opening
setup or ticking voice never installs software, and nothing in setup requests
microphone access; the browser asks on the first press of the mic. Before any
download, setup and the mic's panel ask `GET /api/voice/setup/found` for a
Qwen3-ASR-0.6B already on the machine (`GENOBI_VOICE_MODEL`, earlier installs,
a bounded home-folder search; `server/voice-discovery.ts`); only copies that
verify by the pinned sizes and SHA-256 are offered, and **Use this one** links
one into a new install with the download step skipped. New installs default to
a visible `models/` folder in the checkout ([voice setup](voice-setup.md)). The GitHub clone path remains
available, including from a failed mic setup. Hosted-to-local agent pairing is
implemented separately from microphone transcription; voice still requires the
local studio. A packaged runner download and Tauri launching are not implemented.

Voice intent lives in the setup draft, so Back does not reset it. Saving a
false value never installs or records; selecting voice only exposes its setup.
Choosing an unspecified purpose removes the previous saved purpose. Read-only
voice installer checks are bounded to 20 seconds and can be retried; installation
POSTs are never automatically retried after an uncertain answer.

`tests/startup-pathways.test.tsx` covers all 72 combinations of model preference,
execution route, agent and voice intent through save/reopen and static rendering.
`tests/voice-setup-api.test.ts` checks stalled/malformed reads and safe retry.
`tests/setup-voice-install.test.tsx` checks that Save & set up reads the grant
before the confirmed start, and `tests/voice-install-reuse.test.ts` the model
already on disk, absent, wrong-size and cancelled paths.
These are fixture tests, not evidence of a downloaded model or real transcription.

`tests/startup-setup.test.ts` covers preference persistence and independence.
`node scripts/check-startup-configurator.mjs` checks the interactive flow at
desktop/phone widths against a local studio with fixture API routes, including
reopening, reduced motion and absence of install/microphone side effects.

`GET /api/voice/status`, `POST` and `DELETE /api/voice/prewarm`, and `POST /api/voice/transcribe` exist on the local server only (`server/voice.ts`); the hosted Worker has no voice route. Transcription validates and measures the audio with the upload rules (`shared/uploads.ts`, `shared/audio.ts`) before anything is spawned, decodes it with ffmpeg, drops silent chunks and runs Qwen3-ASR in a local Python worker (`server/voice-worker/`) with the Hugging Face libraries offline. The worker gets no server keys in its environment, and its stderr, which can name local paths, is discarded. See [voice mode](voice-mode.md).

Composition resolution is a pure, revision-checked `set-resolution` Director
command shared by the studio and project API. Preview/export retain the 1080p
pixel-area cap. [Resolution and monitors](director-resolution.md) describes
coordinate scaling, typography coordinates, asset matching and the shared layout.

### Local machine check

`GET /api/machine` exists on the local server only (`server/machine.ts`); the hosted Worker has no machine to read. It runs three fixed commands with fixed arguments, no shell and a five-second timeout (`sysctl` and `vm_stat` on macOS, `nvidia-smi` elsewhere), reads free disk on the studio's data volume, and answers sizes, the chip or GPU model and the CPU architecture only, rebuilt by `readMachineProbe` (`shared/machine.ts`): no hostname, user name, serial number or path. The answer is cached for a minute. Its plan (`shared/machine-plan.ts`) is pure and portable. See [machine check](machine-check.md).

`GET /api/layouts`, `PUT /api/layouts/:id` and `DELETE /api/layouts/:id` exist on the local server only (`server/layout-routes.ts`). They keep named studio layouts for the machine in `.local/layouts.json`, not per session, and count in the unpaid `history` and `edit` buckets. The hosted Worker answers 404, and the studio keeps a hosted visitor's layouts in browser storage with JSON export and import; without accounts a per-visitor D1 row would be tied to the same browser. Both sides validate with `shared/saved-layouts.ts`. See [saved layouts](director-studio-shell.md#saved-personal-layouts-22-october-2026).

### Local agent sessions

`GET /api/agent/status`, `POST /api/agent/sessions`, `GET /api/agent/sessions/:id` and `POST /api/agent/sessions/:id/stop` run locally through `server/agent-*.ts`; the hosted Worker exposes the corresponding paired-runner relay routes without spawning a process itself (see [runner pairing](runner-pairing.md)). A project prompt starts the person's own Claude Code, or Hermes in its `genobi` profile, headless in a scratch folder, with only the Genobi MCP tools (without `genobi_submit`) and an isolated browser MCP pointed at the local studio, and without the server's provider keys in its environment. The routes require the studio's `X-Genobi-Agent: 1` header and a same-origin request, so another site cannot start an agent. An agent never spends: its browser signs in with a one-use ticket that marks its studio session as an agent's, its MCP server and browser mark every request, and the paid routes (`PAID_ROUTES`: generation submits, chain approvals and split upscale confirms) refuse both with `403 agent_cannot_spend`. See [agent sessions](agent-sessions.md).

Takes made from a terminal or an agent are listed in the studio (`server/shared-takes.ts`, local only). The CLI and the MCP server say who they are on every request (`X-Genobi-Client: cli` or `mcp`), and `POST /api/jobs` records that as the job's `origin` (`terminal` or `agent`); the studio's own submissions record none. For a request with no client header and no agent mark (the studio), `GET /api/history` also lists another session's job when it has an `origin`, is `Ready` and its media is available, marked `shared: true`, with its generated source; and `readerOf` resolves that job's id to the session that made it, so the routes in `SCOPED_READS` read it: the clip, the take (Recreate), the job, its probe, an upscale quote of it and its analysis. `POST /api/jobs` reads an upscale's source the same way and runs the upscale in the studio's own session. That is the whole opening, and it is safe on this server because it answers loopback only and has one owner, whose terminal and agents made those takes. It opens no write: hiding, quotes, budgets, chains, media tools, project copies and spending stay per session, two studio sessions stay apart, studio takes are never shared, a run still in flight is never listed (the page would poll a run whose key it may not hold), and an agent-marked request, the CLI and an MCP client read only their own session and scope. The client header only describes the caller, so a local process could mark its takes for the studio; on a single-owner loopback server that is the owner's choice. History keeps the newest fifty own jobs and fifty shared takes independently, preventing terminal activity from evicting the studio's pollable jobs. Direct job reads carry the same `shared` marker as history, even for an older selected take outside that window. The hosted Worker records no origin and lists only the visitor's own runs.

The studio's [Genobi bubble](agent-bubble.md) reads the existing session response.
Its activity count measures retained lines, never inferred tool completions.
Tucking it away preserves polling and leaves an avatar to reopen the session.

## Keys, and what follows from them

The deployment accepts visitor keys only. No shared BFL key or secret is deployed.

A key is held in live page state, sent as a header when needed, and cleared on navigation and page restoration. Legacy Web Storage credentials are deleted without being read. Browser and server persistence were both rejected for the deployment: an operator cannot honestly offer operator-blind keys using a secret they themselves control.

The local server is different: the person running it is the key's owner. It holds two slots (`server/keys.ts`): one Comfy key and an optional BFL override. `chooseKey` (`shared/provider.ts`) gives compatible FLUX API models and upscales the BFL key when connected, while Comfy-only models keep Comfy, and a job is polled with the key of the provider its take records. `COMFY_API_KEY` and `BFL_API_KEY` fill the slots and take precedence; otherwise, on macOS, a key entered in the studio goes to `PUT /api/keys/:kind` and is saved in the login Keychain (`server/keychain.ts`, service `Genobi`, account `comfy` or `bfl`) through Apple's `security` tool, with the key on standard input rather than the command line, and read back to confirm. It is never written to a file, logged or returned: `GET /api/keys` answers whether each slot is connected and from where. Without a Keychain, saving answers `501` and the dialogue falls back to page memory. Whose key a run spends is decided once, by `runCredential`, for the quote and the submission alike, and recorded as the job's `keyMode`: a key sent with the request is the visitor's (`byo`), a key from the environment is the studio's demo key (`server`, held to the demo budget of three runs a session and $5 a day), and a key saved in the Keychain is the owner's (`owner`), which spends the owner's own credits and is held to neither. An `owner` job is polled with the saved key, like a `server` one. A `byo` job is polled only with the key it started with, never with a saved key, which may be another account's: while one waits, the Keychain dialogue asks for that key again and keeps it in page memory (`VisitKey` in `src/components/KeyDialog.tsx`). Each saved key change moves a connection revision (`src/useServerKey.ts`), so the account readout drops the old balance and verification and checks the new key. `/api/health` also names which slots hold a key (`keySlots`, booleans only); with both held, the header shows one readout per account, both read in one request so the pair spends one `credits` allowance (`GET /api/credits?provider=all`, each slot read with its own key and answering or failing on its own; `?provider=comfy` or `?provider=bfl` reads one slot; a visit's `x-byo-key` reads only that key, as on the hosted Worker): both in dollars (BFL's credits converted at its documented 1 credit = $0.01, the credit count in the hover text), each refreshed and failing on its own. The composer names the key a run will spend in the run-mode tag, and the price under Generate gives dollars plus that account's own unit (`priceText` in `src/balance-format.ts`: BFL credits, or Comfy credits, exact where the entry is priced in them and otherwise approximate at `CREDITS_PER_USD`), from `chooseKeyKind`, the slot rule `chooseKey` itself uses (`runPayer` in `src/run-mode.ts`). Replacing or removing a saved key is refused (`409 key_in_use`) while any unfinished run that is not a visitor's polls through that slot (`finishingOn`, which reads the same `pollSlot` as `ServerKeys.forPoll`), an `owner` run or a `server` run whose environment key moved into the Keychain across a restart, because that run is polled with the slot's key and another account's key would read it as lost; the old key is kept nowhere else. The guard protects a key the slot holds: a slot left empty by a Keychain read that failed at startup is read again under its lock before a change (`ServerKeys.held`), the guard then applies to what it found, entering the key the slot already holds is accepted, a slot that is still empty takes the key, and removing from an empty slot is a no-op. Each slot has a read-write lock (`server/slot-lock.ts`): a quote or submission holds both slots shared from choosing its key until its job is recorded (before any provider call), and a key change holds its slot alone from that check through the Keychain write, so a run arriving mid-change waits and takes the new key, and a change arriving mid-reservation waits and then sees the run. Each slot's status carries a `revision`, a counter of its saves and removals held in server memory and never derived from the key, and `/api/health` reports them together as `keysRevision`. When the dialogue opens, the status it reads updates the page's connection whenever the connection or any revision differs, so a key another window saved connects this page and one it replaced has its account checked again. A saved key change also re-reads a paused chain that could not be priced without a key. `GET /api/budget` reports who pays (`shared/budget.ts`): `owner` and `uncapped` only when every key held was saved by the owner. `scripts/check-key-dialog.mjs` drives the dialogue in a browser, on fixtures only. `GET /api/agent/runners` says whether Claude Code, Hermes and Codex are on `PATH` (`GET /api/agent/status` belongs to the agent sessions); each signs in through its own setup and Genobi stores no agent key. Setup's Connect step (`src/setup/SetupConnect.tsx`) saves the keys through `PUT /api/keys/:kind` and shows each harness's sign-in from `GET /api/agent/sign-in` (`server/harness-sign-in.ts`), which runs the harness's own read-only status command (`claude auth status --json`, `codex login status`, `hermes -p genobi auth list`) without a shell, with an eight-second timeout and with the provider keys removed from its environment, and reduces the output to `true`, `false` or `unknown`; the output is never logged or returned. Its Sign in button (`POST /api/agent/sign-in/:runner`) opens that harness's own login in macOS Terminal through the development launcher (`loginArguments` in `server/development-terminal-plan.ts`: `claude auth login`, `codex login`, or `hermes -p genobi auth add <provider>`), as an argument list with no shell, and keeps no receipt. The chosen harness is a server setting, `.local/agent.json` (`GET` and `POST /api/settings/agent-runner`, `server/agent-runner-setting.ts`), which `server/agent-config.ts` reads where `GENOBI_AGENT_RUNNER` and the Hermes variables are unset. These setup routes need the studio's same-origin header and refuse an agent's session. Setup's summary then starts one agent session through the Project prompt's route with `setup: true`, after voice connects when it was ticked; the server adds the connected key slots by name and its own voice model folder to that session's brief, and the page sends neither ([voice setup](voice-setup.md#setup-ends-by-starting-the-agent)). These routes exist on the local server only; the Worker answers 404 and its visitors keep their key in page memory.

That choice has a visible consequence, and the interface states it rather than hiding it. Only a browser holding the key can advance a job, so the runtime genuinely cannot finish one after the tab closes. Keep the tab open until the clip is saved; after a refresh, re-enter the key to resume. A durable background runner would require key custody this deployment deliberately does not have.

Upscaling a private clip mints a random, two-hour, object-specific capability URL; ordinary media routes require the session cookie. Upscaling a library clip lends BFL the public asset URL instead, so no token exists to leak or expire. Neither keys nor signed URLs appear in public job records.

## Decisions

- **State by domain.** The generation composer retains `useComposer` and its existing job lifecycle. Director now uses the single studio Zustand store for its document, settings, workspace, transport, operations and Undo/drafts. Shared asset and agent commands commit through the same owner. GPU/decoder/object-URL resources remain in the renderer hook. Builder retains one mounted recipe session across its inspector and studio switches;
  its separate advanced plate renderer is opt-in through Ninja. The wider workspace-shell
  migration remains a subsequent slice; no second Director document is kept in component state.
- **Raw Three.js.** One isolated, finite procedural scene with no controls, assets or rigging, disposed on teardown. R3F would earn its place as the scene grows.
- **Plain CSS and native controls.** Token groups plus small component styles, native range and select elements kept keyboard-operable, and Three split into a lazy chunk. No utility framework or component kit.
  Reference-video prompt height is browser-local presentation state in `PromptField`;
  its pointer/keyboard grip changes neither prompt text nor generation settings.
  All composer modes share the same minimum footprint at each breakpoint.
- **Express locally.** Readable same-origin endpoints and established byte-range responses. Node's filesystem and process APIs are the local adapter, not Cloudflare-compatible code.

### Rejected, and why

- **Free camera dragging.** No continuous model control has been demonstrated. Named, optional terms are honest and inspectable.
- **A seed parameter.** Neither FLUX 3 video nor video upscale documents one, so run-to-run variation is the provider's own and there is nothing to record. Sending an unknown field risks a 422 on every generation.
- **A public community feed.** Every platform running one has accounts: an owner who accepted terms, who can be banned, and who can delete their own work. This app is deliberately anonymous, so a published clip would have no one to attribute, ban or honour a takedown from.
- **A CI deployment token.** Cloudflare's Pages and D1 permissions are account-scoped, so the narrowest token would still expose every project in the account to a public repository's CI. Releases stay manual.
- **Presenting a library clip as a camera finding.** Existing media previews the pipeline; it is not a controlled comparison.

## Limits

Generation budget and provider concurrency are the first constraints. Stored state is bounded — 250 MB per session, 3 GB per deployment, with per-route rate limits from `shared/limits.ts` and a sweep capped per run so no single invocation pays for a backlog.

One run per camera combination shows the pipeline working; it is not a reliability measurement. Session cookies provide anonymous isolation, not accounts or cross-device sync. No load-test claim is made, and there is no durable background completion.

See [Cloudflare operations](cloudflare.md) for deployment, migrations and hosted limitations, and [`observability/`](https://github.com/koshimazaki/Genobi/blob/main/observability/README.md) for the whole of what this deployment measures about its own use.

## Image input and output boundary

Image/Edit share `shared/image.ts` for schema choices, prices, byte limits and
PNG/JPEG/WebP header inspection. Each reference is checked for media type,
dimensions and size. Klein sources and references select the source-conditioned graph in `shared/comfy/klein-edit.ts`, using Comfy’s `ReferenceMultiLatent` on both conditioning branches. The source determines the output aspect; the resolution tier sets the area. Hosted uploads use the portable official SDK transport without runtime WASM hashing.
Incoming reference bytes are request-only; persisted replay
state contains SHA-256 fingerprints, and public jobs expose only their count.
The browser does not persist references. The same idempotency key with changed
reference content or settings is a conflict on both adapters.

Image results use the same owned job lifecycle as video, with a 32 MB download
bound and inspected MIME type. Internal media objects have an `.image` suffix;
authenticated delivery and download filenames use actual image type. Images
cannot enter the video upscaler. No new public asset links or key storage were
introduced.

## Local frame workspace

`/dual-editor` lazy-loads a browser-only frame inspection component. It reads
Director video sources through the existing session-owned `GET /api/history`
and media endpoints. Local File inputs never upload; decoded frames and a bounded
asset cache live in the tab. The source drawer accepts internal asset IDs rather
than arbitrary dropped URLs. [Dual Editor](dual-editor.md) documents frame timing,
export, memory limits and the component's PNG asset callback. The separate
Timeline view retains independent source decoders and uses a validated cut list
for local picture/audio export. Lossless export copies original packets after
checking compatible codec configurations and safe cut boundaries; exact cuts
and mixed resolutions use an explicitly selected native-resolution re-encode.
Frame grading runs through one pixel pipeline
for preview/scopes/PNG; optional background removal uses a dedicated ONNX WASM
worker and a pinned, user-triggered model download. See the
[editing contract](dual-editor-editing.md).

## Director browser composition

`/director` is a lazy-loaded composer and local renderer. `shared/director/`
contains portable timing and edit invariants; `src/director/` owns bundle import,
registered p5/Anime/Three adapters, media decoding, Web Audio and Canvas/WebGL
composition. The same evaluator drives preview and frame-exact MP4 export. ZIP
imports verify file hashes and module capabilities; no imported module is
dynamically executed. User media remains in browser memory until downloaded.
Template inputs and agent handoffs are described in [Generate your version](director-generate.md). The paid lifecycle stays independent. See the
[working-version guide](director-working-version.md) for exact capabilities.

### Director project assets

The project drawer imports local files into `production` or `reference` records
without placing layers. Explicit placement preserves target timing/transforms
and validates duration, kind and locks. Aliases share bytes while retaining
role and generated provenance; removal protects all layer/plan/generation
dependencies. `src/studio/commands.ts` reserves async edits and rejects results
whose input bundle is no longer current. Undo increases the revision, and
template drafts retain separate bounded histories. ZIP saving stays explicit.

## Local creative memory

The local project copy atomically retains private decision evidence and session
checkpoints. Owner-scoped taste profiles require explicit promotion; linked agents
receive bounded applicable context through the same local API and MCP tools.
[Shared project memory](taste-memory.md) documents storage, concurrency, deletion
and limits. This state is excluded from public bundles and has no hosted D1 adapter.

### Optional operational activity

`shared/activity.ts` defines bounded, metadata-only events. The local activity
store persists owner-scoped opt-in history separately from generation records;
`/api/activity` reads the request session's history, checks linked-project access
for client appends, and restricts configuration to the studio owner. Server
middleware and the MCP tool wrapper record their distinct evidence boundaries.
Browser-local production reports are separate from server observations. Hosted
visitors retain optional browser history without a new Worker endpoint or schema.

Logging is off by default and disabling it clears this optional history.
It never changes job reservation, idempotency or costs. A log failure is reported
without retrying the underlying operation. Full coverage and exclusions are in
[settings and activity](activity-settings.md).

### Native development terminals

Development's local-only terminal routes open fixed interactive harnesses in
macOS Terminal and keep owner-scoped launch receipts, separate from managed
studio-agent jobs. The browser supplies only runner, prior receipt or optional
handover; executable paths, working directory, role instructions and viewer
port remain server-owned. The native terminal owns conversation I/O and lifetime.
No generation is triggered by opening it. See [supervisor](supervisor.md).
