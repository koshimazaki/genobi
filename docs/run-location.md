---
tags: [workflows, comfy, backend, studio, mcp]
summary: Run location (Local ComfyUI or Comfy Cloud), the local ComfyUI client, workflow swapping and the local model map.
---

# Run location and workflow swapping

Every `workflow` registry entry (today LTX-2.5 · Acoustic Space and the open
FLUX 3 Image Klein run) follows one setting, the **generation setup**: **Local
ComfyUI**, the ComfyUI on this machine with its own models, or **Comfy Cloud**,
charged to the Comfy key. **Both** combines local open workflows with cloud API
models. It saves `mode: "both"` and resolves workflow `location` to `local`;
quotes and recorded takes always name a concrete destination. There is no
automatic cloud fallback. Local also leaves API routes available; Both makes
that mixed configuration explicit. Router and BFL entries are the paid extras on top and
do not follow it. Each workflow entry also runs a **template**, a graph under
`workflows/`, which a session can swap for another template that serves the
same capability.

## Comfy Deploy

The local Settings panel also registers an existing Developer Platform endpoint
as **Comfy Deploy**. Only `https://<deployment>.run.comfy.app` is accepted,
without a port, path, credentials, query or fragment. The URL persists; a key
never enters these settings. Registering selects the deployment run location
and reveals the worked LTX/World Builder entries under LTX. Each is pinned to
its own manifest workflow and uses the registered deployment even when the
session later selects another default location. The Local tick hides them.

Camera stages each required input through the deployment's SDK asset API,
then quotes and explicitly confirms GPU-time billing. Session-owned tickets
expire after two hours or process restart. Quotes bind the endpoint URL;
recorded jobs continue polling their original endpoint after settings change.
A lost submission is never resent. Video, IR and audio downloads become private
studio media, with the original deployment link on the take card.

The hosted Worker has a fixed Comfy Cloud client and no deployment registry.
It hides these models and refuses their quotes/submissions with
`deployment_local_only`: **Comfy Deploy runs from the local studio**.
[Exact Camera steps and workflow limits](comfy-deploy.md#use-it-from-camera).

## Where it is set

| Who      | How                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator | `GENOBI_WORKFLOW_DESTINATION` (`cloud`, `local` or `deployment`) and `GENOBI_WORKFLOW_URL`: the server's default                               |
| Studio   | **Studio setup** in Studio settings (the key button): Local ComfyUI, Comfy Cloud or Both                                                       |
| Studio   | The **Local** tick in the model menu's header, beside Open only (below)                                                                        |
| Agents   | `genobi_run_location` (read, or set with `location`), `genobi_workflows` (list; `checkLocal` asks the local ComfyUI), `genobi_workflow_select` |
| HTTP     | `GET`/`POST /api/settings/run-location`, `GET /api/settings/workflows[?check=local]`, `POST /api/settings/workflows/selection`                 |

**The Local tick** (`src/components/LocalTick.tsx`) is a second control over
the same session setting, through the same `SettingSaver` and lane as Studio
setup: one save at a time, a definite refusal shows the server's value again,
an uncertain save reads the server again. Ticked saves `both`, not `local`:
the two run a workflow entry identically (both resolve to `local`), and `both`
is the value that says what the tick means, open workflows on this machine
while Router and BFL entries keep their cloud provider. Unticked saves
`cloud`. It shows ticked for Local and Both, and is disabled on the hosted
studio. Ticking it also ticks **Open only**, since the local ComfyUI runs open
workflows only; either can be unticked after, and Open only with Local off
means open models on Comfy Cloud. Open only stays composer state that never
reaches the server. While Local is ticked the menu keeps only what can run
locally: ready open `workflow` entries whose template names no host of its own
(`runsLocally` in `src/local-menu.ts`, so not the Openjutsu swap). Closed
entries stay hidden while either tick is on, and the header says how many rows
an untick would bring back ("2 more with Local off", "6 more with Open only
off").

**The run-mode tags** sit under the selected model (`src/components/RunModeLine.tsx`,
wording in `src/run-mode.ts`): short tags saying where the next run goes, from
the entry's route, the session's run location as the server last answered it,
and a pinned template's `hosts`. Hovering gives the sentence.

| Entry and setting                              | Tags                                                          | Sentence (title)                                               |
| ---------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Workflow, Local or Both                        | OPEN WEIGHTS · LOCAL COMFYUI                                  | Runs on the local ComfyUI                                      |
| Workflow, Cloud                                | OPEN WEIGHTS · COMFY CLOUD                                    | Runs on Comfy Cloud on your Comfy key                          |
| Workflow, server default deployment            | OPEN WEIGHTS · COMFY DEPLOYMENT                               | Runs on the Comfy deployment on your Comfy key                 |
| Pinned template (Openjutsu)                    | COMFY DEPLOYMENT, note "its own host, not Local or Cloud"     | Runs on the Comfy deployment on your Comfy key                 |
| Router entry                                   | API · COMFY ROUTER                                            | Runs on Comfy Router on your Comfy key                         |
| BFL entry, or a FLUX Router entry on a BFL key | API · BFL                                                     | Runs on BFL's API on your BFL key                              |
| FLUX Router entry, no key in the page          | API · COMFY ROUTER OR BFL                                     | Runs on Comfy Router on a Comfy key, or BFL's API on a BFL key |
| Hosted studio, workflow                        | COMFY CLOUD, note "the hosted studio always uses Comfy Cloud" | Runs on Comfy Cloud on your Comfy key                          |

The first tag is the weights, the second the endpoint: OPEN WEIGHTS for any
entry with open weights, API for one without (FLUX Video Upscale reads
API · COMFY ROUTER, SeedVR2 OPEN WEIGHTS · COMFY CLOUD or LOCAL COMFYUI). An
open model on an API route keeps OPEN WEIGHTS (Klein's API: OPEN WEIGHTS · BFL). A Router or BFL entry
held while Local is ticked adds the note "Local applies to open workflows only".
When the session runs graphs locally, the LOCAL COMFYUI tag turns to a warning, with a
short note, when the local ComfyUI does not answer ("not answering"; the
sentence adds "Start ComfyUI, or untick Local"), or when
`GET /api/settings/workflows?check=local` reports what it lacks for the held
template ("lacks unet_name, text_encoder, vae", slot names, never file names;
"lacks nodes …" first). That check is read in the background
(`src/local-check.ts`) and shared for 20 seconds, or until the run location
changes; the composer never waits on it. Before the run location is read the
line says "Checking…", and "Saving…" while a run-location save is in flight.
The line has one reserved row (14px tall, 16px with its gap), included in
every toolbar `min-height` in `src/styles/studio-frame.css`, so the composer
does not move when the tags change.

**Defaults from setup.** Neither tick has a default of its own; both read
first-run setup's saved answers (`readSelection`, the "Which creative models
suit you?" and "Where should generation happen?" steps). Setup preselects
**Open models only** for a newcomer. When setup chose open models, Open only is
ticked on load and whenever setup is saved (`src/useSetupDefaults.ts`), which
moves a closed held run to an open one as switching Open only on always has.
With no setup answer yet, Open only starts ticked only when the opening run is
already open, so the composer still describes the featured clip. A featured
clip with no recorded run (today the first creature clip, made outside the
studio) opens an empty composer on FLUX 3 text to video, a closed entry, so
Open only starts unticked until setup is saved. When setup chose **Local
only** and this session has not chosen a run location itself (`source:
"server"`), the studio writes `both`, which ticks Local; it does the same when
setup is saved with that answer. Neither default marks the composer edited.

The model menu has no **Workflow** picker since 27 October 2026: the H3 rows
already name their guide, and a template is chosen by an agent, over HTTP, or
by Recreate restoring a take's recipe. Paid writes still name the template the
session holds (below).

The studio setup control goes through `SettingSaver` (`src/run-settings.ts`), so it
shows what the server will run: one save at a time (a choice made while saving
is ignored), only the newest answer applied, a definite refusal (a 4xx answer)
restores the earlier value, and an uncertain save (a lost or unreadable answer,
a broken connection or a 5xx) is followed by a fresh read whose answer is what
is shown; if that read fails too, no choice is shown as selected. The studio and agents change the same record on the local server
(`server/workflow-settings.ts`), one per session, kept in the local snapshot so
a restart does not move a session back to the default. An agent has its own
session, as it does for jobs. Settings writes count in the `edit` rate bucket,
not with paid submissions.

The hosted Worker is always Comfy Cloud: `GET /api/settings/run-location`
answers `fixed: true` with that said, `GET /api/settings/workflows` lists the
defaults with `fixed: true`, and there is no POST. The studio shows the run
location there as a disabled choice.

`deployment` (a Comfy API deployment, `https://{name}.run.comfy.app`) runs
through the same SDK as Comfy Cloud, on the deployment's own base URL and with
the Comfy key; a session can choose Local, Cloud or Both. `GENOBI_DEPLOYMENT_URL`
names a deployment without making it the default, for the templates that list
it as a host. The [Openjutsu swap](openjutsu-swap.md) lists only its own host
(that deployment) and never follows Local or Cloud.

## What a run records

The job service reads the session's location and template when it prices a
run (`server/jobs.ts`, `price`), and the take's recipe records both
(`recipe.workflow`, `recipe.location`, `shared/take.ts`). The run is sent where
the recipe says; a poll goes to the client whose address the stored handle
names (`server/workflow-destinations.ts`). A quote carries the same recipe, and
spending it under another location or template is `409 quote_mismatch`
(`requireQuotedRun`), so a free local quote never becomes a charged Cloud run.

A paused chain's quote follows the same rule: once the location or template
has changed, the chain no longer reports that quote as live, and the next read
quotes the stage again (`ChainService.liveQuote`, through
`WorkflowSettings.fits`), so approval can go on without waiting for the old
quote to expire.

On Local, a run needs no Comfy key: `requireRoute` is skipped for a workflow
entry, the estimate is zero, and no key is sent to ComfyUI. A local run is
also outside the server key's demo gate: it is not refused by it and does not
count toward the session limit or the daily budget, which stay in force for
Cloud and API runs. `JobService.budget` is the one reader: `GET /api/budget`
(and `genobi_budget`) and the gate both leave local runs out, and the route
says so with `countsLocalRuns: false`. The rule lives in `server/budget.ts`, beside the saved-key exemption: only a demo-key (`server`) run that is not local counts or can be refused, and `genobi_budget` takes `localRuns` to leave a recipe's local runs out of its count. No provider key reaches a local run, so once submitted it needs none on any path: it is polled, resumed on startup and its output saved with no key at all (`isLocalRun` in `server/keys.ts`, `JobService.poll`), and a pending one does not hold a Keychain slot against a change (`pollSlot`). A cloud run with no key to poll with is still refused with `invalid_key`. A local run
also needs no key to start: `JobService.credential` reads the session's plan
before `runCredential` chooses a key, and a workflow run planned for Local with no key sent
or held is quoted at $0 and submitted keyless (recorded as the `owner`'s, which
the budget never holds); a held key is still recorded. Generate in the studio
skips the key dialog for it (`runsKeyless` in `src/local-menu.ts`). Any other
plan, Comfy Cloud included, still refuses with `invalid_key` and no key
(`tests/local-keyless.test.ts`). Chains follow the same rule stage by stage:
a chain's pause is priced keyless when that stage is planned for Local
(`keylessLocal` in `server/keys.ts`, read by `ChainService.read`), and the
page's chain gate asks about the stage it would send (`useChains`), so a
Fast or Studio-review chain of local stages is created, approved and run with
no key, while a stage that runs anywhere else still asks for one
(`tests/local-keyless-chain.test.ts`).

**Paid writes name what the studio shows.** Every job submit, chain creation
and chain approval from the studio sends `Genobi-Run-Location` and, for a
workflow model, `Genobi-Workflow`: the values its controls show
(`expectedHeaders` in `src/settings-store.ts`). Where the run is priced, before
anything is reserved, the server compares them with the session's settings and
refuses a difference with `409 settings_changed` (`server/settings-expectation.ts`),
so a run never goes to Cloud while the studio showed Local. A chain approval
names the paused stage's own model, so a template swapped in another tab (whose
refreshed quote prices the other graph) is refused rather than run. A paid
request without the two headers (an MCP client) runs as before.

**Settings answers are ordered by the server, not by arrival.** Every
settings answer, read or write, run location or workflows, carries a
`revision`. The local server bumps one counter on every accepted settings
write and answers with the counter as it handled the request, value and
revision read together (`WorkflowSettings` in `server/workflow-settings.ts`).
The counter lives in memory: each process starts at its start time in
milliseconds times a thousand (`firstSettingsRevision` in
`shared/comfy/run-location.ts`), so a restart never answers below a revision
the last process handed out. The hosted Worker's settings never change and
always answer revision 0.

Each setting has one sequencing point for the page's lifetime
(`SettingLane` in `src/setting-lane.ts`, one per setting in
`src/settings-store.ts`), and every reader and writer goes through it: a
control's save or read (`settingSaver`), a Recreate restore (`restoreWrites`)
and the startup read (`loadSettings`). An answer is applied only when its
revision is newer than the last applied (the same revision confirms it), so a
read the server handled before a write can never land over the write's answer.
Any write in flight holds Generate and Approve. The store keeps server answers
only (a control shows its optimistic choice to itself) and its setters are
private. A write that ends without a value (refused, lost or unsent) leaves the
setting unconfirmed from that moment until an answer is applied, since a
control may still show the choice it sent while the server holds another; that
also holds Generate and Approve. A request that ends without a value owes one
read through the lane once nothing is in flight, since a lost write's revision
is unknown; a refused save is therefore followed by a read, not a restore of
the value before it. An automatic read that also ends empty starts no other,
and the setting stays unconfirmed until a later read or save is answered (a
control reads the server whenever it opens). `tests/settings-interleaving.test.ts`
starts, handles and answers three readers and writers in a seeded sample of
60,000 orders and outcomes against a fake server, and checks at every step
that a control showing a value other than the applied one holds Generate.

In the studio, Generate says "Saving settings…" while a run-location or
workflow write is in flight and "Checking settings…" while a setting is
unconfirmed, and sends nothing either way, even with the dialog closed. A
paused chain's Approve is held the same way (the button and
`chainController.approve`, refused as `settings_held`), so a Cloud quote is not
spent while a Local choice is still being saved or checked.

**Recreate** restores the run's own template and run location before
anything is generated (`RunRestorer` in `src/run-restore.ts`, from the take's
recipe), so a no-LoRA run is recreated on the no-LoRA graph even after the
session switched back. Generate says "Restoring…" and sends nothing until the
restore ends (`useSettingsHold` in `src/settings-store.ts`). Every Recreate,
even of a Router or BFL run, supersedes the restores before it, and so does
any newer setup choice: a run-location or workflow save, a clip or title
restored into the composer, or a generator, model or Acoustic Space choice
there. They share one generation (`setupChoices` in `src/settings-store.ts`);
a restore whose take is still being read applies nothing once it is not the
newest, and releases Generate. Restores are serialised: each writes only
after any earlier one's writes, and one superseded is dropped before it
writes (`tests/recreate-superseded.test.tsx`). A take that cannot be read (network,
unreadable answer, HTTP error, or a ten-second timeout) or a write that fails
is shown; a run with nothing recorded (a Router or BFL run, a run from before
takes or before templates) changes nothing. **Provenance cards** (`shared/provenance-card.ts`)
credit each workflow take with its recorded template and run location, so a
card can be mixed Local and Cloud; an older take falls back to the entry's
default template and the card's `workflows` setting, and a template outside the
entry's capability is refused.

## The local ComfyUI client

`server/comfy-local.ts` implements the same `WorkflowClient` as the Cloud client
over ComfyUI's own HTTP API. Checked against `server.py` and `execution.py` in
[comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI) at commit
`7a28332` (master, 21 October 2026):

| Route                | What the client relies on                                                                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /system_stats`  | `system.comfyui_version`; detection only. `argv` and paths are never read or passed on                                                                                                   |
| `GET /object_info`   | Node classes as keys; a combo input lists its options as `[[...options]]` or `["COMBO", {options}]`                                                                                      |
| `POST /upload/image` | Multipart `image`, `type`, `subfolder`, `overwrite`; answers `{name, subfolder, type}`. Videos use the same route                                                                        |
| `POST /prompt`       | `{prompt, client_id, prompt_id?}`; answers `{prompt_id, number, node_errors}`, or `400` with `error` and `node_errors`                                                                   |
| `GET /queue`         | `queue_running` and `queue_pending`, each item `[number, prompt_id, …]`                                                                                                                  |
| `GET /history/{id}`  | `{}` until done; then `{[id]: {outputs, status: {status_str, completed}}}`. Saved files are `{filename, subfolder, type}` lists; SaveVideo lists its file under `images` with `animated` |
| `GET /view`          | `filename`, `subfolder`, `type=output`                                                                                                                                                   |

The default address is `http://127.0.0.1:8188` (ComfyUI's own `--listen` and
`--port` defaults in `comfy/cli_args.py`); `GENOBI_WORKFLOW_DESTINATION=local`
with `GENOBI_WORKFLOW_URL` sets another. Only `http://127.0.0.1:<port>` or
`http://localhost:<port>` are accepted (`parseWorkflowDestination`).

**Before anything is submitted** the client fills the graph (a mismatch is
refused unsent), reads `/object_info`, and refuses with the names when a node
type the graph uses is missing, or when a model slot's file is not in the
loader's list (naming the slot, never the file). Only then does it upload input
files (named `genobi/genobi-{job id}-{slot}.{ext}`, never the visitor's file
name) and post the prompt once, with the job id as `prompt_id` where ComfyUI
accepts a client id; its answer's `prompt_id` is what counts.

**After submission**: a refused connection proves nothing was sent; a timeout,
a lost answer, a 5xx or an unreadable body is "could not be confirmed" and is
never retried. A `400` names the node classes from `node_errors`, never
ComfyUI's text, which carries local paths and file names. A poll reads the queue
first, then history (a run only moves from the queue into history, so the two
reads cannot miss it). The handle is `{base}/history/{prompt_id}`; the client
accepts only its own base. The output is the template's own node, or any file of
its kind (`.mp4` for video; `.png`, `.jpg`, `.webp` for an image), fetched
through `/view` with a fixed timeout and no redirect. ComfyUI reports no
progress over HTTP, so a local job shows Pending, then Generating.

## The template table

`shared/comfy/workflows.ts` lists each template with its id, label, the
capabilities it serves, its graph file, slots, required node types and model
files, and how its slots are filled. A `workflow` entry's capability is fixed
(Acoustic Space: `acoustic-space`; open Klein: `image`) and its model names its
default template. A swap is refused (`400 workflow_mismatch`) unless the
template serves the entry's capability. See [the workflows folder](https://github.com/koshimazaki/Genobi/blob/main/workflows/README.md)
for the table.

| Capability         | Templates                                       |
| ------------------ | ----------------------------------------------- |
| `text-to-video`    | `ltx-2-5-t2v` (no entry runs it yet)            |
| `image`            | `flux-3-klein-t2i`                              |
| `upscale`          | none yet                                        |
| `acoustic-space`   | `ltx-2-5-akuspace-t2v` (default), `ltx-2-5-t2v` |
| `layout-to-render` | none yet; the 3D tab's Layout to Render next    |

`ltx-2-5-t2v` behind Acoustic Space is the same LTX-2.5 graph without the
AKUSPACE LoRA: the treatment still reaches it in the prompt, so it runs where
the LoRA is not installed.

## The local model map

A local ComfyUI names its own model files. `GENOBI_LOCAL_MODELS` maps them by
template and model slot, as ComfyUI lists them (relative to its model folders):

```sh
GENOBI_LOCAL_MODELS='{"flux-3-klein-t2i":{"unet_name":"flux3/klein.safetensors","vae":"flux2-vae.safetensors"}}'
```

Every loader input in a template is a `model` slot (`unet_name`, `text_encoder`,
`vae`, `lora_name` and so on; `genobi_workflows` lists them). `GENOBI_KLEIN_MODEL`
still names Klein's `unet_name`; set to a different file in both places, the
server refuses to start. Each file passes `parseModelFile`; a refusal names the
template and slot, never the value, and neither the map nor its files are
logged, persisted or shown. Comfy Cloud always keeps the catalogue names in
the graph.

## Not built yet

- The studio's own cost line showing zero for Local (the server's quote
  already says zero).
- The LTX graphs keep `LoadImage` node `395` with Comfy Cloud's sample file;
  a local ComfyUI validates it, so a local LTX run needs a file of that name in
  its `input` folder until the graph gets an image slot.
- Progress for local runs (ComfyUI reports it over its websocket only).
- Recovering a local "could not be confirmed" run by its `prompt_id`.
