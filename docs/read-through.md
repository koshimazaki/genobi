---
tags: [architecture, backend, studio]
summary: Follows one user action through shared/, the screen, the local adapter and the hosted adapter.
---

# Read-through

This order follows one user action through the app. Read the tests beside each domain boundary.

The same request is served by two adapters: Express locally and a Worker on Cloudflare. Everything
they must agree about lives in `shared/`, which imports no framework, no Node and no DOM API.
`npm run check:worker` compiles that layer under `"types": []`, so a platform import there fails the
build while every other check stays green.

## The portable core

1. `shared/types.ts` — the two generators, inputs, public job and source.
2. `shared/presets.ts` and `shared/camera.ts` — the camera panel per model (names, guide links,
   wording), the shared composer and USD estimates. `camera-terms.ts` holds the vocabulary with its
   BFL and LTX wording, `camera-h3.ts` MiniMax H3's sentences and order for every H3 entry.
   `legacy-camera.ts` keeps older preset ids replayable rather than rewriting history.
   `camera-path.ts` is the portable camera-move format (keys, eases from `camera-ease.ts`, bounds),
   and `camera-path-terms.ts` names a path in the documented vocabulary or not at all.
   `light.ts` is LTX's Light picker, and `ltx-prompt.ts` orders an LTX paragraph as the LTX guide
   does (shot, scene and light, action, character, movement, audio), fits it to 1,200 characters
   and reads the `ltxPrompt` record; `ltx-vocabulary.ts` and `ltx-examples.ts` are the gaps' chips
   and example lines ([camera wording](camera-wording.md#motion-light-and-order)).
3. `shared/idempotency.ts` — `canonicalInput` is the one definition of "the same request", so a
   replay cannot become a second paid submission by reordering fields.
4. `shared/mp4.ts` — `inspectMp4` and `checkUpscaleLimits`. Bounded parsing with `MAX_INPUT_BYTES`,
   so dimensions and duration are measured rather than trusted.
5. `shared/lifecycle.ts`, `shared/limits.ts`, `shared/job-storage.ts`, `shared/library.ts` —
   retention and sweep intervals, rate-limit buckets, the persisted-media merge rule, and the
   catalogue parser. Both adapters read these constants; neither redefines them.
6. `shared/take.ts` — the take contract: `startTake` records the recipe and input hashes with the
   reservation, and `takeOf` reads a `Ready` job as its take for `GET /api/takes/:id`.
7. `shared/quote.ts` — `estimateRunUsd`, the one price both adapters reserve, and the one-use
   quote a submission can spend with `Quote-Id`.
8. `shared/uploads.ts` and `shared/audio.ts` — which uploads are accepted, the one inspector both
   adapters measure them with, and the bounded WAV, FLAC and MP3 duration readers.
9. `shared/chain.ts` and `shared/output-targets.ts` — chained jobs: stages with an approval before
   each, their statuses read from the jobs their keys find, and the four output targets fitted to an
   entry's controls. `server/validate-chain.ts` is the request allowlist both adapters use.
   `shared/review.ts` is the review step's rule for a take that has already run: the upscale a
   target needs from its measured frame, or why none can reach it.
10. `shared/director/commands.ts` — the Director commands an agent, a voice prompt or a 3D gesture
    sends: `parseCommand` is the allowlist and `applyCommand` the one pure edit, run by the local
    server against its project copy and by the studio against its own store.
    `template-commands.ts` re-plans a template shot's prompt for a new camera or new inputs;
    `layer-commands.ts` sets a clip's placement and a recipe's parameters, text included;
    `prompt-commands.ts` sets the global prompt and a clip's own prompt and typed directions,
    whose vocabulary and checks are `directions.ts` ([prompts and directions](director-prompts.md));
    `duplicate.ts` copies a clip, its prompt included, under a new id;
    `graphic-commands.ts` builds `add-graphic`'s recipe and parameters, bringing in a recipe from the
    trusted registry the project does not hold yet;
    `resolution.ts` sets composition size and rescales pixel placement for
    `set-resolution` ([resolution and monitors](director-resolution.md));
    `beat-grid-command.ts` sets the composition's tempo, downbeat and beats per bar;
    `notes.ts` adds, resolves and deletes frame notes and checks them in `checkReferences`.
    `feedback.ts` records the agent's revision (`applyAgentCommand`) and diffs it against the
    person's project into labelled commands plus open notes and what no command can express
    (`feedback-diff.ts`, `feedback-project.ts`, `feedback-residual.ts`).
11. `shared/audio-analysis.ts` — audio analysis over mono PCM, no Python: `audio-dsp.ts` (FFT,
    spectral flux per band, levels), `audio-tempo.ts` (tempo and raw beats) and `audio-report.ts`
    (the one report shape, and `gridWithEvidence`, the least-squares grid and downbeat estimate,
    given only when the beats land on onsets, that the librosa worker's beats go through too).

## The screen

6. `src/App.tsx` — the single-screen interaction: mode, scene, camera, key, source and submission.
7. `src/useComposer.ts` — composer state as a reducer, with `composerInput` producing the request.
8. `src/usePageKey.ts` — browser-session key custody, and deleting a legacy persisted credential
   without ever reading it back. On the local server the connection dialogue reads `GET /api/keys` instead
   (`src/components/LocalKeys.tsx`): one Comfy key and a BFL override slot, saved by the server in
   the macOS Keychain (`server/keys.ts`, `server/keychain.ts`), so the page only ever hears
   "connected". `chooseKey` in `shared/provider.ts` prefers the BFL key for compatible FLUX API models and upscales; Comfy-only
   models keep the Comfy key. The same dialogue shows whether Claude Code or Hermes is set up (`/api/agent/runners`),
   asks again for a page key a waiting run started with, and moves `src/useServerKey.ts`'s
   connection revision on every saved key change so the account readout checks the new key.
9. `src/useJobs.ts` — initial history load, per-request keys, one polling loop and submission.
   `src/job-links.ts` and `src/library.ts` resolve a linked or catalogue job without bypassing
   ownership checks. `src/library.ts` also carries the catalogue clip the studio opens on, which
   `initialComposer` is built from. `src/hero.ts` derives the run the main view shows from what the
   composer is operating on — the clip being upscaled, a catalogue clip the visitor loaded, or the
   run `activeRun` resolves (the visitor's chosen run, which hiding a card does not give up, or the
   newest visible one) — instead of a second flag kept in step by hand. Every control that edits the
   composer goes through `markEdit`, which marks the edit before dispatching it, so the restore
   effect in `src/App.tsx` stands aside for the visitor's work whichever control made it.
   `src/useChains.ts` holds the session's chains: `src/chain-state.ts` is its reducer and
   `src/chain-client.ts` the routes and the create, read, approve and cancel actions, which never
   approve on their own or send a refused approval again. `src/useReview.tsx` retains review and approval for existing chains. Camera
   submits the selected model directly; it has no Fast/Studio or finish-target controls
   and does not automatically offer an upscale after generation. Upscale is an explicit
   gallery action (`src/review.ts` retains the chain request builders).
   `src/generators.ts` names the two generators once for the model menu, the mode badge and the
   composer foot. Those names come from `shared/registry.ts`, which is also the menu: `FamilyModelSelector` opens LTX, FLUX, H3 or Upscale entries without changing the run until a model
   is selected. Upscale is a task family drawn as an icon only (Lucide `scaling`, named "Upscale
   models"), so four families fit the Family box's fixed width; it holds both upscalers, SeedVR2
   (open) then FLUX Video Upscale. It lists entries in registry order, a `coming` entry disabled with its note so it can never become a
   request. Open only is composer state that never reaches the server: switching it on moves a
   closed selection to `ltx-2-5-fast` (a closed still to `flux-3-klein`, FLUX Video Upscale to
   `seedvr2-upscale`), and reaching a closed
   run another way switches it off. FLUX 3 Image Klein has open weights, so Open only keeps the
   FLUX family for it.

   **Image entries sit in the same menu.** The FLUX family lists video, then the
   stills, Klein first; its upscaler sits in the Upscale family. A model offered both open and as an API is one row with two entries
   under it: `flux-3-klein` (the open graph on the `workflow` route) and `flux-3-klein-api`
   (BFL's `POST /v1/flux-3-image-klein`), the second marked `runOf` so `entriesFor` lists the
   model once. `runOptions` gives the Run control in `ImageControls` its two choices; each run
   stays its own entry, so a take records which one ran. `menuId` keeps the row selected
   whichever run is held. `entryFor` falls back to the generator's FLUX 3 entry for a pair no
   entry makes, so a half-made selection never resolves to nothing.

   Each ready entry also carries its `controls` (`shared/controls.ts`): which of the composer's
   controls it shows and what each offers. FLUX 3 has the 5–20 s fader, all seven ratios and Draft;
   LTX-2.5 has Router's duration list, 16:9 and 9:16; FLUX Video Upscale has `UpscaleControls`.
   A still's controls (`kind: "image"`) list BFL's image ratios and tiers, web grounding (FLUX 3
   Image only), whether it takes references (not the open Klein graph yet) and whether it keeps
   the camera: Klein does, FLUX 3 Image does not. Selecting Klein from a video entry removes
   duration and Draft and keeps the camera switch and the Camera controls button. The camera
   dialog drops Movements when the composer holds an image generator (`still`, set from the
   generator in `src/App.tsx`); FLUX 3 makes both video and stills, so the model cannot decide.
   `GenerationControls` draws the entry's controls from the held entry, and `composerReducer`
   passes every new state through `fitControls`, so a value the new entry cannot take moves once
   to one it can (an LTX 7 s becomes 6 s, 21:9 becomes 16:9, Draft goes off). `validateInput` fits
   the request against the same entry, so the controls, the request and the recorded run agree.
   An upscale has no duration control: its length is the source clip's, measured against the
   upscaler's limits (`checkUpscaleLimits`: 20 s, 50 MB, 2560 × 1440) before any quote. So
   `validateInput` does not judge the fader value an upscale request still carries (whatever LTX or
   Music 3 left, such as 4 s or 120 s); it keeps it to a whole second inside 5 to 20, the range every
   recorded upscale has, so replays hash as before.

   **Audio is always on.** There is no Audio control: both job services send
   `generate_audio: true` in every FLUX 3 body (Router and BFL direct) and in `ltxBody`, and the
   Acoustic Space graph always decodes and saves its audio track. `audio` is not part of
   `GenerateInput`, `validateInput` or `canonicalInput`, so a run recorded while Audio was a switch,
   with `audio: false`, still loads and replays as the original job instead of a 409. The composer
   foot says "native audio" for every video model.

   **The toolbar shares one baseline** (`ComposerToolbar`). The combined FAMILY selector,
   the entry's controls and Generate align across the main row. The clickable selected-model
   summary sits underneath on the left, balanced by cost on the right. Either a family button
   or the summary opens the model menu; Open only and the Local tick (the session's
   [run location](run-location.md)) live inside that menu. Under the summary, one
   reserved row of run-mode tags says where the next run goes (`RunModeLine`). Escape and outside
   click dismiss it, and arrow keys navigate choices. Browsing a family does not change the
   model until a ready entry is selected. On a phone, family and summary precede the wrapping
   controls and a full-width Generate button with its cost below.
   `ComposerActions` shows the **Acoustic space** button beside Camera controls only while the
   switch is on. It and the acoustic prompt use a theme-specific accent: light blue with
   Blackstone / Lime, blue indigo with Cyberpunk.

   Acoustic Space is an entry too (`ltx-2-5-akuspace`, an open workflow on Comfy Cloud). Its switch
   moves between it and LTX-2.5 Fast, `keepAcoustic` in the reducer keeps the entry and its
   treatment together, `shared/acoustic.ts` writes the treatment as the AKUSPACE node would, and the
   job services hand that entry to a `WorkflowClient` (`shared/comfy/workflow.ts`) instead of a
   provider.

   **Music is a generator of its own** (`audio`), listed under the H3 family for now (H3's
   default stays its video entry; music may get a section later): `minimax-music-3` runs
   Comfy's official MiniMax Music 3 graph on the workflow route (`shared/comfy/music.ts`,
   `workflows/minimax-music-3.README.md`). Its controls (`kind: "audio"`) are a duration
   fader; `MusicWorkspace` puts the caption in the prompt's place and the lyrics where Image
   keeps its references. `server/validate-audio.ts` keeps caption, lyrics and seconds only, and
   `canonicalInput` hashes `lyrics` when present. `server/job-output.ts` saves the song as
   `.mp3`, `.wav` or `.flac` by the header the shared audio reader proves, and the session gains
   an audio source the gallery plays with `<audio>`. The Worker refuses music before pricing
   (`audio_local_only`).

   **Two routes, one Comfy key.** The registry entry's `route` decides where a run goes, not the
   key: `router` is partner and hosted models via Comfy Router (`shared/comfy/router.ts`),
   `workflow` is Genobi's own graphs, open workflows via Comfy Cloud (API v2). `bfl` is BFL's own
   API, for Klein's API and for a FLUX Router entry (the upscale included) on a BFL key. MiniMax H3
   runs both ways: four guided OmniRef graphs on `workflow`, and `minimax-h3-router` on `router`
   from two reference images (`shared/comfy/h3-router.ts` builds its body). The Router entry is
   the H3 menu's first row, the one with 4–15 s, six ratios and 2K; the OmniRef four keep their
   one measured 5 s, 16:9 recipe, and their Duration control says so (`h3OmniFixed` in `shared/h3-hint.ts`, named from the registry). Router cannot run a graph or front
   Cloud, so the two Comfy routes sit side by side. Takes recorded before the rename say `cloud`;
   `shared/legacy-route.ts` reads them as `workflow`.

   **The workflow path.** `workflowRun` (`shared/comfy/runs.ts`) picks the template for the
   entry's model and fills its values, the same call in both adapters. `akuspaceValues`
   (`shared/comfy/akuspace.ts`) turns the request into slot values (prompt, whole seconds, 24 fps,
   aligned width/height, LoRA strength and two fresh seeds); `kleinValues`
   (`shared/comfy/klein.ts`) gives the Klein graph its caption, layout rows, upsampler switch, size
   and seed. `fillSlots` (`shared/comfy/slots.ts`) writes them into a copy of the graph and
   refuses, unsent, a path the graph does not hold.
   `ComfySdkWorkflows` (`server/comfy-sdk.ts`) submits it once through the official SDK,
   `@comfyorg/sdk`, to `POST /api/v2/jobs`, with the reserved job's id as the `Idempotency-Key`.
   The SDK imports `node:` modules, so it lives in the adapters, not `shared/`; both adapters use
   the same file, and the Worker resolves those imports under `nodejs_compat`. A stated refusal
   (node errors, 401, 402, 403, 429) is final; a 5xx, a lost or unreadable answer, a timeout or a
   reused key is "could not be confirmed" and never retried. Before any request it refuses a
   non-Comfy key, a `COMFY_BASE_URL` in the environment (the SDK would follow it), and a
   destination other than Comfy Cloud; the fetch it hands the SDK reaches `cloud.comfy.org` only
   and never follows a redirect.

   The handle is the v2 job URL (`https://cloud.comfy.org/api/v2/jobs/{id}`), stored where a Router
   job keeps its polling URL (`pollingUrl`, the D1 `polling_url` column) and read by
   `workflowJobId`, which also accepts the earlier client's status URL. Each poll reads the job
   (queued, running, canceling, succeeded, failed, canceled, expired); on success the template's
   output node (`workflowOutput`: SaveVideo `75` for a video graph, SaveImage `9` for Klein,
   SaveAudioAdvanced `35` for music) asks
   for its download link, a signed storage URL that passes the same public-https
   check as any provider media and is downloaded without the key. Cloud reports no credits per run,
   so the job keeps its estimate and the gallery marks it `est.`

   **Run location and swapping.** `shared/comfy/destination.ts` names where workflows can run:
   Comfy Cloud (the default), a Comfy API deployment (https, public host, which still refuses
   unsent) or a local ComfyUI (http on 127.0.0.1 or localhost). The local server reads its default
   from `GENOBI_WORKFLOW_DESTINATION` and `GENOBI_WORKFLOW_URL`, and `server/workflow-settings.ts`
   keeps each session's generation setup (Local, Cloud or Both) and its template per workflow entry, which
   the studio's connection dialog (setup) and agents (`mcp/workflow-tools.ts`, setup and template)
   change through `server/settings-routes.ts`; Recreate restores a take's template. The model
   menu has no Workflow picker. The job service reads both when it prices a run,
   and `startTake` records them in the recipe; `workflowRun` fills the recorded template from the
   table in `shared/comfy/workflows.ts`. `server/workflow-destinations.ts` sends the run to the
   SDK client or to `server/comfy-local.ts`, the local ComfyUI client, which checks node types and
   model files against `/object_info`, uploads input files, posts `/prompt` once and polls
   `/queue` and `/history`. On Local a run needs no Comfy key and its estimate is zero.
   `GENOBI_LOCAL_MODELS` (and `GENOBI_KLEIN_MODEL`, kept) names the local model files by
   template and slot (`shared/comfy/local-models.ts`, through `parseModelFile`, never repeated).
   The Worker always uses Comfy Cloud and answers `/api/settings` as fixed. See
   [run location](run-location.md).

10. `src/components/` — `PromptInput` edits the scene and coloured camera text, plus the acoustic
    line, and for LTX lays the Scene, Character, Action and Audio gaps as tabs over the one field
    (`SlotChips` holds a gap's chips, `src/ltx-composer.ts` builds the composed request and puts the
    gaps back on Recreate); `LightPicker` is the camera panel's Light tab; `ComposedPreview` shows
    the paragraph part by part; `AcousticDialog` mirrors `CameraDialog`, with a lazy-loaded Three.js acoustic guide and
    editable wording (up to 600 characters, with AKUSPACE protected). Custom wording survives
    preset changes until reset; the preview continues to illustrate the selected preset; `ComposerToolbar` aligns controls and their metadata;
    `GenerationControls` owns duration, ratio, resolution, draft, camera and acoustic space, as the
    entry's `controls` allow; `FamilyModelSelector` owns family and model choice; `UpscaleControls` owns
    amount and mode; `ComposerActions` holds the Acoustic space and Camera controls buttons.
    `ReviewStep` lays over the main view for an existing chain with its stages, the
    pause's quote and Approve or Cancel; `ChainCard` is a chain's gallery card.
    `SelectMenu`, `TickFader` and `ThemePicker` keep shared interactions small, and `Wordmark` and
    `ModeBadge` are the two names the header and the prompt row show. Upscale replaces the
    camera surface. Keep each component under 500 lines.
11. `src/components/Gallery.tsx` and `JobMedia.tsx` — library versus new jobs, decoded-frame reveal,
    user-triggered playback, hidden-page pause, explicit playback errors. Every card and the
    lightbox carry a muted `ModelTag` (`LTX-2.5`, `FLUX 3`, `UPSCALE`) from `modelSignature`.
12. `src/scene/camera-paths.ts` — pure geometry; then `create-camera-scene.ts` and
    `CameraPreview.tsx` for the isolated Three lifecycle.
13. `src/styles/` — small groups of plain CSS, including all responsive and reduced-motion overrides.

## The local adapter

14. `server/validation.ts` and `server/validate-camera.ts` — the allowlist. Unexpected fields cannot
    choose a provider URL, model, cost or arbitrary file.
15. `server/app.ts` — loopback/origin checks, anonymous session cookie, rate limit, route ownership.
16. `server/jobs.ts` — reserve, persist, submit once, poll, copy, inspect, mark Ready. Budget
    reservations are conservative. `server/job-request.ts` holds the request shapes it uses: the
    hashed replay copy, the duplicate check and the body each provider is sent.
17. `server/bfl.ts` — the two submission endpoints, credits check, allowlisted polling and delivery
    hosts, fixed error messages and no blind POST retry. Shared with the Worker, as is
    `server/comfy-sdk.ts`, the workflow route through `@comfyorg/sdk`.
18. `server/store.ts` — atomic local snapshots and interrupted-submit handling. `publicJob` removes
    provider and internal data. `server/chains.ts` keeps chains in the same snapshot and mounts
    `/api/chains`: create, list, read (which quotes a new pause), approve and cancel.
19. `server/media.ts` — byte bounds and atomic download. It inspects MP4s with `shared/mp4.ts`,
    the same reader the Worker uses, so neither adapter needs a system binary to measure media.

The local-only project copy is `server/projects.ts` (the bundle under `.local/projects/`, owner
pushes at a revision, link codes, Director commands and stream listeners) and
`server/project-routes.ts` (`/api/projects`, including the server-sent event stream), with
`server/project-streams.ts` closing the streams of a session that loses its link. The studio side
is `src/director/project-copy.ts` (requests), `project-copy-sync.ts` (when to push, apply or
reload) and `useProjectCopy.ts` (the hook the Director runtime calls);
`mcp/director-tools.ts` gives agents the same routes.

Outputs reach a project's assets through one path ([project assets](project-assets.md)).
`shared/director/asset-media.ts` is the rule (type, `DIRECTOR_MEDIA_BYTES` (150 MiB), use, control characters out of the
name); in the studio `src/studio/project-assets.ts` (`addToProjectAssets`) runs it and the
`import-asset` command for 3D takes and first frames, Dual Swords frames, rendered and saved videos
and gallery results. **Send to Director** (`src/studio/send-to-director.ts`, `SendToDirector.tsx`)
words that add and offers its Undo on Library cards and Scrolls results; `src/scrolls/to-project.ts`
turns a Scrolls asset into project media and lands each generated Scrolls result under Project.
Scrolls' Script (`src/scrolls/Script.tsx`) sets the project prompt (`director-prompt.ts`), and its
Describe the video Send (`agent-fill.ts`, `shared/scrolls/fill.ts`) hands a one-use code through
`server/scrolls-fill-routes.ts` to the agent's `genobi_scrolls_panels`. An
agent's take or media-tool result goes through `server/project-takes.ts`.

The local-only media service is `server/ffmpeg.ts` (fixed argument builders) and
`server/media-tools.ts` (one run at a time, outputs measured by the shared readers and saved as
hashed `derived` sources with their operation). `server/project-takes.ts` hands a take or such a
result into a linked project copy; `server/project-derived.ts` checks a result's whole history
against the reader's own media and library clips and records its `derivation`, and
`server/project-media.ts` reads either file through the shared readers.

Local-only audio analysis ([audio analysis](audio-analysis.md)) starts at
`server/audio-routes.ts` (`/api/audio/status`, `/api/audio/analyze`). `server/audio-analysis.ts`
resolves an owned audio source or a linked project's audio asset, has the media service decode it
to mono float32 with ffmpeg, runs `shared/audio-analysis.ts` on a worker thread
(`server/audio-thread.ts`, one at a time, at most four queued) and caches the report by the file's
SHA-256. With `librosa: true` and `GENOBI_AUDIO_PYTHON` set, `server/audio-worker.ts` runs
`server/audio-worker/audio_worker.py` once per request and fits its raw beats with the same
`gridWithEvidence`. `mcp/audio-tools.ts` holds the agent's `genobi_audio_upload` (a write:
`mcp/audio-file.ts` reads a local file by path and uploads its bytes into the agent's session)
and `genobi_audio_analysis` (read-only).

The local-only machine check ([machine check](machine-check.md)) is `server/machine.ts`: the
probe (fixed `sysctl`, `vm_stat` and `nvidia-smi` commands, `statfs` on `.local`) and
`GET /api/machine`. `shared/machine.ts` is the probe's shape and validator,
`shared/machine-models.ts` each model's documented requirement with its source, and
`shared/machine-plan.ts` the pure plan: local or Comfy Cloud per capability, the largest listening
model that fits. `mcp/machine-tools.ts` gives agents `genobi_machine`.

Saved studio layouts ([studio shell](director-studio-shell.md#saved-personal-layouts-22-october-2026))
are local-only too. `shared/ninja-layout.ts` is the Ninja arrangement and its version migrations,
`shared/saved-layouts.ts` the named list, its validation, caps and import file.
`server/layouts.ts` keeps the list for the machine in `.local/layouts.json` and
`server/layout-routes.ts` mounts `/api/layouts`. The studio side is
`src/studio/saved-layouts-client.ts` (the server, or this browser when no server keeps them) and
`src/studio/SavedLayouts.tsx` in Ninja's configuration. The Worker has no layouts route.

## The hosted adapter

20. `worker/index.ts` — the same routes over `fetch`, reusing `server/bfl.ts`, `server/errors.ts`
    and `server/validation.ts` unchanged. Read it next to `server/app.ts`; where they diverge, the
    divergence should be the platform, not the rules.
21. `worker/jobs.ts` — submit, poll and copy against D1 and R2, with recoverable leases in place of
    a single process holding an in-flight lock.
22. `worker/storage.ts` — D1 rows and R2 objects, `ownedJob` and `saveJob`. Ownership is enforced
    here, not at the edge. `worker/chains.ts` is the chain routes over the `chains` table, each
    change a compare-and-set on its revision.
23. `worker/media.ts` — upload, store and range-serve, over R2 ranges rather than a local file
    handle. The inspection itself is `shared/mp4.ts`, identical to the local adapter.
24. `worker/sweep.ts` — ages out abandoned jobs and expired rows. A cron trigger and the request
    path both call it; whichever fires first claims the interval.
25. `migrations/` — D1 schema in order. `worker/env.d.ts` is generated by `wrangler types`; do not
    hand-edit it.
26. `observability/` — the only thing the deployment records about its own use: sessions and
    generations per UTC day.

## Evidence

27. `tests/` — camera maths and composer, validation and pricing, credits, concurrent caps and
    idempotency, key non-persistence, session ownership, MP4 parsing, real Range delivery, invalid
    uploads, and the Worker against isolated D1 and R2. The Express, Worker and ffmpeg suites are
    split by topic (`server-*`, `worker-*`, `ffmpeg-*`), each sharing one `*-harness.ts` setup.

## Image editing

Image and Edit use the same FLUX image endpoint; FLUX 3 Image Klein, the first image entry, runs
as an open graph (`workflows/flux-3-klein-t2i.json`) or on BFL's Klein endpoint, Image only
(Klein edits are later work, so Edit stays on FLUX 3). `ImageStage` replaces the hero
inside its existing footprint; `ImageWorkspace` keeps prompt and references in
the composer. `useImageReferences` validates uploads and updates source, reference
ordering and region assignments together. `ImageRegionCanvas` handles pointer
capture, cancel, resize, overlap and keyboard movement. `ImageRegionCard` edits
a selected region without growing the outer panel.

`src/image-regions.ts` converts normalized boxes to the documented prompt rows
([BFL guide](https://docs.bfl.ai/flux_3/flux3_image_bounding_boxes)), and it is
the only place rows are written. Label positions are UI-only. References are
request-only on the server. `src/run-inputs.ts` keeps browser-private copies for
new runs, bounded to 30 days, 50 runs and 64 MiB. `useComposerRecreate` reads those
files before restoring the composer and its workflow settings; a newer edit or
model choice supersedes the read. The original prompt and editable Klein boxes
are saved separately from the composed request so Recreate never doubles rows.
The Bounding boxes action and canvas are Klein-only; other image models park
regions without sending them. Missing saved inputs ask for reattachment. Boxes guide the model; they
are prompt coordinates, not pixel masks.

The servers read the rows back: `readLayout` (`shared/image-layout.ts`) finds the
trailing JSON array of rows, and `validateImage` (`server/validate-image.ts`, used
by both adapters through `validateInput`) refuses a box that is not four integers
from 0 to 1000 with its bottom below its top and its right past its left, a
repeated id, an edit row with neither box, or a `ref_image_N` the request does
not carry. A trailing array that is not rows stays text. The same validator holds
an image request to its entry's controls: ratio, tier, grounding, references and,
for Klein, the camera, whose movement is dropped. `composePrompt` puts a Klein
still's framing lines (shot size, angle) after the caption and before the rows.
The open Klein graph sends the caption through Klein's prompt upsampler and
appends the rows after it, or skips the upsampler when rows are present; see
[the graph's README](https://github.com/koshimazaki/Genobi/blob/main/workflows/flux-3-klein-t2i.README.md).
