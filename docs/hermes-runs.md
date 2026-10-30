---
tags: [agents, mcp, models, verification]
summary: Hermes runs - the first agent model and why, the free first run against the read-only tools, the provenance card, and the plan for the paid runs (Klein box edit, two passes, three example videos) with their quotes and approvals.
---

# Hermes runs

How Claude builds the templates and writes the pipeline down; Hermes reruns it on
open models; every example carries a provenance card. This page holds what is
prepared, what ran, and what waits for the owner's approval. Nothing here has
spent money.

| Box                                       | State                                                               |
| ----------------------------------------- | ------------------------------------------------------------------- |
| Templates written down as skills          | Built: four skills in `plugins/genobi/skills/` (below)              |
| Provenance card                           | Built: schema, validator, renderers and `genobi_provenance`         |
| Choose the first model                    | Recommended below; the owner confirms                               |
| First run against the read-only tools     | Ran on 21 October 2026, free (below)                                |
| Klein box edit, approved by a person      | Planned below; waits for one approval                               |
| Two-pass run: draft, review, upscale      | Planned below; waits for two approvals, the second after the review |
| Example videos with Hermes on open models | Planned below; one approval per video                               |
| Run card and session watcher              | Built: the anime teaser card and the watcher (below); not yet run   |

## The pipeline as skills

The plugin ([`plugins/genobi/`](https://github.com/koshimazaki/Genobi/tree/main/plugins/genobi))
carries one skill per [house template](templates.md) and one for the open
route. Each step is one tool call with its arguments; placeholders such as
`<copyId>` are values an earlier step returned.

| Skill             | Makes                                                                  | Expected price         |
| ----------------- | ---------------------------------------------------------------------- | ---------------------- |
| `product-video`   | Hero, Detail and Reveal on LTX-2.5 Fast                                | about $1.42            |
| `character-piece` | Arrive, Turn and Hold on LTX-2.5 Fast; a Klein still as a separate yes | about $1.42 (+ $0.009) |
| `audio-visual`    | Slice, Rise and Sweep on LTX-2.5 · Acoustic Space, one bar each        | about $0.78            |
| `genobi-hermes`   | The open route, the Klein box edit and the two-pass run                | per run                |

Every template skill runs the same loop: `genobi_status`, link the project
(`genobi_link_project`), set the inputs (`genobi_director_command`
`set-template-inputs`), plan (`genobi_template_plan`) with the project's cameras, check the whole
recipe against the budget (`genobi_budget`), quote each shot
(`genobi_quote`), **wait for the person's yes to the total**, submit
(`genobi_submit`), poll (`genobi_job`), read the takes (`genobi_take`), hand
each take into the project (`genobi_take_to_project`) and put it on its shot
(`replace-plate`), and record the card (`genobi_provenance`).

While a job runs, every `genobi_job` and `genobi_jobs` answer carries
`progressLine`, the line the studio card shows (`shared/progress-line.ts`):
`GENERATING KLEIN IMAGE  73% ⣿⣿⣿⣀⣀` when the provider reports progress, the
elapsed seconds when it does not, with Comfy Router's duration estimate
beside them for a Router run (`GENERATING LTX VIDEO  12s · ~38s typical, p90
61s`, or "default estimate" while Router has too few recent runs to measure).
The `genobi-studio` skill tells Hermes,
Claude Code and Codex to show it as it changes and never to draw a bar of
their own. In the studio the same line runs behind a cli-spinners frame, and a
sand spinner sits beside the wordmark while anything works.

### Handing takes to the person

The MCP server holds its own studio session, so the takes an agent makes are
not the person's: their history and `/api/clips` never show them.
`genobi_take_to_project` (`mcp/take-tools.ts`, over
`POST /api/projects/<copyId>/takes` in `server/project-takes.ts`, local only)
copies a Ready take the agent's own session owns into the project copy it is
linked to: the bytes go into that copy's file store, checked as an MP4 or an
image and held to the Director's file and project limits, and become a
production asset with a generation record, at the revision the agent read.
The bytes never leave the server and never come from another session's job.
The studio hears the write on the copy's stream, reloads the copy and fetches
the file from it; the agent then places the asset with `replace-plate` on
`shot-<shotId>`. Handing the same take in twice names the same asset.
`tests/mcp-take-to-project.test.ts` runs the whole path: an agent's take, the
owner seeing it through the copy, and the plate replaced.

The same tool takes the agent's own cut by `sourceId`: a trim, concat,
crossfade or space result, video or audio (`server/project-derived.ts`). Its
whole history must be the agent's own media or library clips; its record names
the operation and inputs, each input the project already holds as an input
asset, so hand the takes in before the cut. `tests/derived-to-project.test.ts`
runs a trim, a join of it, an audio trim on a new track and the refusals.

### The budget an agent works within

The MCP server carries no provider key, and none can be given to it: it sends
no key header, and the skills never ask for one. So every run an agent starts
uses a key the studio holds. On the studio's demo key (an environment key) it
is held to the demo budget (`requireBudget` in `server/jobs.ts`): **three
generations per session per day**, and **$5 a day** shared by every session on
the studio. A key the owner saved in the Keychain pays from the owner's own
credits and is uncapped; `GET /api/budget` reports `payer` and `uncapped`
(`shared/budget.ts`), and the verdict then fits a recipe by its price alone.
A setup with any environment key reads as the demo key, so the check is never
looser than the submission. Without a check, a four-run recipe
would quote four times and fail at the fourth submit after three paid runs had
started.

`genobi_budget` (`mcp/budget-tools.ts`, over a read-only local route,
`GET /api/budget`) returns who pays, the runs and dollars left for the session
today and, given a recipe's runs and expected total, whether all of it fits. The route and
`requireBudget` read the same `JobService.budget`, so they cannot disagree.
Every skill calls it after planning and **stops before the first quote** if
the recipe does not fit. The character piece is therefore three runs by
default; its Klein still is a separate yes, made only when a fourth run fits,
and otherwise brought by the person or made in the studio with their own key
(the browser's own key is not held to the demo budget). A new agent session
gets its own three runs; the dollars are shared.

`genobi_template_plan` is new with these skills: it runs the same
`planTemplate` the Director opens and returns each shot's exact `genobi_quote`
arguments and price, so an agent on a small open model never assembles a
prompt by hand. It reads nothing from the studio and spends nothing.

`tests/plugin-skills.test.ts` holds the skills to the tools: every tool a
skill names exists, every template skill quotes, asks before it submits and
ends with a card, and every call whose placeholders are filled with samples is
accepted by that tool's input schema. The Klein box example passes the
studio's layout check.

## Provenance card

A card says how one example was made: the agent and its model, every
generation model and the take it made, the workflow files, where it ran and on
what hardware, the time taken, the cost and each output with its SHA-256. The
**tier** is derived, never typed: the rule is the templates' own (`tierFrom` in
`shared/templates/plan.ts`), with a closed agent model counted as one closed
step.

| Agent model | Generation models                     | Tier      | The line it shows                                                       |
| ----------- | ------------------------------------- | --------- | ----------------------------------------------------------------------- |
| Open        | All open                              | Open      | Made with Hermes, only open models                                      |
| Open        | Open shots, one closed step (upscale) | Semi-open | Made with Hermes, open models and one premium step (FLUX Video Upscale) |
| Closed      | All open                              | Semi-open | Made with Claude Code on a premium agent model, open generation models  |
| Any         | A closed shot, or two closed steps    | Premium   | Made with …, with premium models                                        |

Code: `shared/provenance.ts` (the schema, tier and derivations),
`shared/provenance-card.ts` (`buildProvenance` from takes, `readProvenance`,
which re-derives every label, open flag, workflow file, total, duration and the
tier and refuses a card that disagrees; each take's route must be its entry's,
the one exception being a FLUX entry on Router run on BFL direct with a BFL
key), and `shared/provenance-render.ts`
(Markdown for docs, and a small `ProvenanceBadge` JSON for a gallery card with
no ids or hashes). An agent model's openness comes from
[LICENCES.md](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md) where it is listed (DeepSeek V4.1 Flash, Qwen3-VL
and Omni, Hermes 4); any other model must be declared, and the card says
"as declared by the runner".

`genobi_provenance` (`mcp/provenance-tools.ts`) builds a card from the takes of
Ready jobs (in the same agent session that ran them: the studio keeps takes
per session), the jobs' finish times (from the history, or from each job
itself when it is older than the history's latest 50; when neither answers the
card's timing is `null`, shown as unavailable, never a creation time), the
project's template
and, by default, each output's bytes from `/api/clips/<id>` to hash. It only
reads. Takes carry no output hash, so a clip that retention removed is listed
as unhashed rather than guessed.

## Choose the first model

The candidates the repository already names, with the licence
[LICENCES.md](https://github.com/koshimazaki/Genobi/blob/main/LICENCES.md) records and what each needs. Model ids are from
the public Nous model list (20 October 2026), checked again
against the list Hermes cached.

| Model                                           | Licence            | Needs                                                  | Notes                                                                           |
| ----------------------------------------------- | ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash` on Nous          | MIT                | A Nous login; paid per token                           | The default agent model; it lists image input; open weights to download         |
| Qwen3 locally (Qwen3-VL 8B or 30B-A3B)          | Apache-2.0         | Local weights and LM Studio or Ollama; a GPU for speed | The fully local route; weights must be installed first                          |
| `qwen/qwen3-vl-235b-a22b-instruct` on Nous      | Apache-2.0         | A Nous login; paid per token                           | Open, with documented box grounding; the vision candidate for the 20-frame test |
| Hermes 4.3 36B or Hermes 4 14B, locally         | Apache-2.0         | Local weights                                          | Nous' own open models; not on the cached Nous list                              |
| `deepseek/deepseek-v4-flash-vision-exp` on Nous | Not in LICENCES.md | A Nous login                                           | Experimental; record its licence before a card can call it open                 |

**Recommended first model: DeepSeek V4.1 Flash on Nous**
(`hermes chat --provider nous -m deepseek/deepseek-v4.1-flash`). Its weights
are MIT and downloadable, so a card made with it is Open by LICENCES.md rather
than by declaration; Hermes reaches it through its built-in Nous provider with
no extra setup; and it needs no local GPU, so the first runs measure the
skills, not the hardware. Local Qwen is the second run, for the "on your own
machine" proof, once weights are installed on a big GPU (a 5090 or an RTX PRO
6000). A Hermes model left at another default (any model LICENCES.md does not
list) would make every card "declared", so pass `-m` explicitly. Every Nous
chat is a paid model call, so the owner starts it.

## First run

Free and read-only, on 21 October 2026, against this branch's studio on
`127.0.0.1:4317` with **no provider key** and a fresh `.local` store, so
nothing could be priced or sent to a provider.

What ran:

1. `hermes plugins validate plugins/genobi` (Hermes Agent v0.21.4): portable
   manifest parses (Agent Plugins v1), name present, security scan safe,
   validation passed.
2. `scripts/check-hermes-plugin.py` with Hermes' own Python: Hermes' Agent
   Plugins v1 loader read the plugin, and Hermes' MCP client started the
   bundled server and sent the three calls. No model was involved.

   ```text
   plugin: genobi 0.1.0
   skills: ['audio-visual', 'character-piece', 'genobi-hermes', 'genobi-studio', 'product-video']
   diagnostics: none
   mcp server: node genobi-mcp.mjs GENOBI_URL=http://127.0.0.1:4317
   tools: ['genobi_status', 'genobi_models', 'genobi_jobs', 'genobi_job', 'genobi_quote', 'genobi_submit', 'genobi_take', 'genobi_projects', 'genobi_link_project', 'genobi_project', 'genobi_director_command', 'genobi_template_plan', 'genobi_provenance']
   genobi_status({}) isError=False: {"studio": "http://127.0.0.1:4317", "ok": true, "hasServerKey": false, "budgetUsd": 5, "sessionLimit": 3}
   genobi_models({"status": "ready"}) isError=False: ["ltx-2-5-fast (router, open)", "ltx-2-5-akuspace (workflow, open)", "ltx-2-5-pro (router, closed)", "flux-3-video (router, closed)", "flux-video-upscale (bfl, closed)", "flux-3-klein (workflow, open)", "flux-3-klein-api (bfl, open)", "flux-3-image (router, closed)", "flux-3-edit (router, closed)"]
   genobi_jobs({"limit": 5}) isError=False: []
   ```

3. `node scripts/check-mcp.mjs` (the MCP SDK client, same server and studio):
   the same thirteen tools, the same status and models, 0 jobs, 0 projects,
   and the three template plans: product video 3 shots, 11 s, about $1.42;
   character piece 3 shots, 11 s, about $1.42 (its Klein still is quoted
   separately); audio-visual 3 shots, 6 s, about $0.78.
4. Two quote requests by hand against the same keyless studio, to check the
   skills' arguments pass validation: the Klein box still and the upscale
   were both refused only for the missing key (`invalid_key`), after
   validation.

After the review fixes, both checks ran again against a keyless studio from
this branch: fourteen tools, now with `genobi_budget`, which reported 3 runs
and $5 left and refused a three-run recipe because the studio held no key.

What did not run: **no Hermes chat**. A chat needs a model call, and every
model Hermes can reach here is paid (Nous bills per token; Hermes removed its
keyless free provider), so no model chose these calls; that first chat waits
for the owner. An installed plugin that links to another checkout sees that
checkout's tools and skills, so the first chat needs this branch merged there
and `npm run build:mcp` run.

## Run plan for the paid steps

Each run below first checks the whole run with `genobi_budget` and stops
before any quote if it does not fit. Each then waits for one approval in the chat (two for the two-pass run,
whose second approval follows the person's review) and ends with
`genobi_provenance`. Prices come from the studio's own pricing code
(`estimateRunUsd`); the quote is the figure that binds. Agent tokens on Nous
are billed separately and are not in these totals.

### 1. Klein box edit (product still)

- **Skill:** `genobi-hermes`, "Klein box edit". **Template:** product video;
  the still becomes its product photo.
- **Inputs:** a caption for the product and two boxes, `product`
  `[300, 250, 850, 750]` and `plinth` `[780, 200, 1000, 800]`; `flux-3-klein`
  (open workflow), 16:9, 1K.
- **Expected quote:** $0.009. Runs on Comfy Cloud with the studio's Comfy key.
- **Approval:** the person's yes to the caption, boxes and price.
- **Card:** Open with Hermes on DeepSeek V4.1 Flash; one take, workflow file
  `workflows/flux-3-klein-t2i.json`.
- **Risk:** the open Klein graph has not yet run on Comfy Cloud. If it is refused,
  the same model runs on BFL's API (`flux-3-klein-api`, $0.009 at 1K, $0.011
  at 1.5K) with a BFL key in the studio; the card stays Open.

### 2. Two passes: draft, review, upscale

- **Skill:** `genobi-hermes`, "Two passes". **Template:** product video, the
  Hero shot.
- **Draft:** `ltx-2-5-fast`, 4 s, 720p, 16:9: **$0.52**, Comfy key.
  **Approval 1:** the draft's price.
- **Review:** the person watches the draft and says keep or redo; redo is a
  new draft quote.
- **Upscale:** `flux-video-upscale`, 2x, precise: **about $0.99** for a
  4-second 720p clip (the quote measures the clip). It runs on the same Comfy
  key through Router (`bfl/video-upscale-v1`), so nothing is restarted between
  the passes; this run is also the first proof that Router's queued route
  takes the upscale. **Approval 2:** the upscale's price, after the review.
- **Total:** about $1.51. **Card:** Semi-open (one closed step, the upscale).
- **Alternative on one key:** a FLUX 3 draft (5 s, draft mode, $0.30) and the
  same upscale ($1.24 for 5 s) on a BFL key alone: $1.54, Premium.

### 3. Example videos, one per template

All on the open route: Hermes on DeepSeek V4.1 Flash, open generation models,
generations on Comfy Router and Comfy Cloud (cloud; a local ComfyUI is not
wired yet), with the studio holding a Comfy key.

| Video           | Skill             | Inputs (defaults unless the owner picks others)                                           | Runs on      | Expected | Approval               |
| --------------- | ----------------- | ----------------------------------------------------------------------------------------- | ------------ | -------- | ---------------------- |
| Product video   | `product-video`   | "a matte black portable speaker with a woven fabric front", FIELD ONE, 16:9               | Comfy Router | $1.42    | The three shots' total |
| Character piece | `character-piece` | An invented character (the default woman in her thirties), ANNA, 9:16                     | Comfy Router | $1.42    | The three shots' total |
| Audio-visual    | `audio-visual`    | "a brutalist concrete atrium", STRUCTURE, 120 BPM, Cathedral · Moderate, the sample pulse | Comfy Cloud  | $0.78    | The three shots' total |

All three: **about $3.62** in generation, three runs each, so each video is
its own agent session (three runs per session per day) and all three fit one
day's $5. The Klein box edit and the two-pass run ($1.52 together) go on
another day. The optional character still is a fourth run, so it is its own
session too. Each produces an Open card with the skill, the three takes,
`workflows/ltx-2-5-akuspace-t2v.json` where workflows ran, the hardware as "Comfy Router (hosted)" or "Comfy Cloud GPUs", the time
and each output's hash. Acoustic Space is estimated at LTX-2.5 Fast's rate
until its Cloud cost formula lands, so its confirmed cost may differ.

Content rules:
lawful, safe for work, no unlicensed likeness or IP. The product is invented,
the character is synthetic, the audio-visual piece has no people, and the
track is the studio's own sample. The demo video must name every tool and
model used; the cards are the list.

## Run cards and logs

A **run card** is one template written down for both agents to run the same
way: the [anime teaser](runs/anime-teaser.md) is the first, with its four
prompts, price and ceilings, acceptance checks and the replication protocol
(Claude Code first, then Hermes from the skills alone). Its steps are the
`anime-teaser` skill.

A **run log** is what one studio-started session did, recorded by
`scripts/watch-agent-session.mjs`. The studio keeps only a session's last 40
lines and logs nothing, so the watcher polls `GET /api/agent/sessions/:id`,
keeps every line once and in order (matching the overlap of each read's
sliding window, and noting a possible gap when the window moved by 40 or more
between reads), and writes the log after every change: a header table
(runner, session, template label, start and end, status, quotes approved and
declined, estimated spend), a timeline of status changes, lines, approvals,
results and the summary, and the final summary verbatim. Control characters,
machine paths and key-shaped text are removed.

```sh
GENOBI_STUDIO_SESSION=<camera_session cookie> \
  node scripts/watch-agent-session.mjs <session id> --label anime-teaser
```

- **Who it reads as.** The studio shows a session only to the studio session
  that started it, so the watcher sends that session's `camera_session` cookie
  (from the browser's developer tools: Application, Cookies), with the studio's
  `X-Genobi-Agent: 1` header that every agent route requires and the agent
  mark `X-Genobi-Agent-Session: 1`, which can only take spending away. It only
  reads. The cookie stays in the environment; it is never printed or written.
  The session id is in the studio's request to `/api/agent/sessions` (Network).
  There is no listing route, so `--latest` is refused.
- **How often.** Every 4 seconds by default (`--interval`, 1 to 600). Session
  reads share the `poll` bucket, 120 a minute per studio session, with the
  bubble (every 1.5 s) and each unfinished job in the gallery (every 4 s), so
  four runs in flight leave room for it. A 429 doubles the wait, up to 30 s.
- **How it ends.** Exit 0 on `done`, 1 on `failed`, `stopped` or
  `interrupted`; a `waiting` session is followed until no step is pending or
  being sent, then 0 if every step it quoted started a run and 1 otherwise. 2
  when the session cannot be read (after three connection retries, or at once
  for a 404), 64 for a usage error, 130 for Ctrl-C (the log is still written).
- **Where.** `docs/hermes-runs/<YYYY-MM-DD>-<runner>-<label>.md` by default, or
  `--out`. Each log is evidence: Prettier skips the folder so its bytes stay as
  written, and each one is linked from the wiki home.

`tests/watch-agent-session.test.ts` runs the watcher against a scripted fake
studio, never a real session: a status sequence, a sliding window with
overlap, one approval that becomes a result. It checks every line once and in
order, the approval and result rows, the exit codes, the headers sent, and no
control characters, paths or cookie; its run is the committed
[example log](hermes-runs/2026-10-24-claude-watcher-example.md).

| Log                                                                                                               | Runner                                                                                                           | Card                                                                                                  | Result                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| [Watcher example](hermes-runs/2026-10-24-claude-watcher-example.md)                                               | Fake studio                                                                                                      | Example                                                                                               | Scripted; nothing ran                                                                                                                  |
| [Anime teaser, Claude Code, 27 October](hermes-runs/2026-10-27-claude-anime-teaser.md)                            | Local studio, Claude runner                                                                                      | Four quotes, $1.42 in all, every price under its ceiling                                              | Real studio session; the four steps expired unapproved, nothing spent                                                                  |
| [Audio-visual library dry run, Hermes, 28 October](hermes-runs/2026-10-28-hermes-audio-visual-library-dry-run.md) | Local studio, Hermes runner (DeepSeek V4.1 Flash on Nous), started from the gallery's Generate now in the bubble | No card: the audio-visual skill, steered by a queued message to the library clips and the media tools | Real studio session; three library clips trimmed to one bar and placed on Slice, Rise and Sweep; no quotes, nothing spent              |
| [Audio-visual library review, Hermes, 28 October](hermes-runs/2026-10-28-hermes-audio-visual-library-review.md)   | Local studio, Hermes runner, started from the Editor on the same project                                         | No card: a frame note pinned in the Editor, read through `genobi_project_feedback`                    | Real studio session; the first clause of the note acted on (Rise re-cut), the second refused with the reason; no quotes, nothing spent |

## The teaser run kit

The [teaser run kit](genobi-teaser-run/README.md) is the first piece made
for a weaker model to recreate and repeat: the `genobi-teaser-run` skill
rebuilds the Genobi teaser (a mix cut, nothing generated) from its brief,
`scripts/verify-teaser-run.mjs` checks the cut and compares it with v1 or
with an earlier run, and run B repeats run A from run A's `memory.json`
alone. It needs a terminal, so it runs in `hermes-developer` today and in
`hermes-creative` once that role has one, on DeepSeek V4.1 Flash; the kit's
README has the run sheet. Not yet run by Hermes.

## Not yet verified

- A Hermes session has run: on 28 October 2026 the studio's runner started
  Hermes on DeepSeek V4.1 Flash through Nous from the gallery, and it probed
  and trimmed library clips into a linked project with no quote and no spend
  ([the dry-run log](hermes-runs/2026-10-28-hermes-audio-visual-library-dry-run.md)).
  The review session that followed records the Hermes runner but not its
  model. Not yet run: a Hermes session that quotes or spends, Hermes on a
  local model server, and `hermes chat` from a terminal with the `genobi`
  profile, including whether it loads a plugin skill by its bare name
  (`hermes chat -s product-video`) or a namespaced one.
- The open Klein workflow on Comfy Cloud, and Acoustic Space's real cost.
- That FLUX Video Upscale accepts an LTX 720p draft at 2x.
- Generation on a local ComfyUI: the workflow route refuses a local
  destination until the local client lands (#13).
- The anime teaser run card end to end: its 27 October session quoted the four
  shots and none was approved, so no shot has run. The watcher has recorded
  real sessions since (see the logs above).

## Reference video session checks

Camera now exposes H3 OmniRef RGB/Canny/depth and FLUX image-to-video. See
[the recipe](https://github.com/koshimazaki/Genobi/blob/main/workflows/minimax-h3-omniref.README.md) for exact inputs. A custom-workflow importer is deferred.
The studio Hermes launcher passes raw configured MCP server names to `-t`
(`genobi` and its browser server), as Hermes CLI 0.21.4 requires; `mcp-`
prefixes are internal toolset names, not the configured server selectors.
