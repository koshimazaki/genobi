---
tags: [agents, director, licences]
summary: Intended-use preferences, curated creative libraries and per-run licence reports.
---

# Licence-aware direction

Genobi's taste layer recommends libraries for their visual craft and gives
creators prominent credit. Licence-aware direction selects from that taste
according to the person's intended reuse. The catalogue is a starting point,
not a certification service or an exhaustive dependency inventory.

## Built in this change

- **Taste & credits**, available across studio sections: creator cards,
  recommended versus integrated status, source links, licence conditions,
  two optional preference selectors and downloadable planned-inventory reports.
- Preferences: purpose (`demo`, `commercial-video`, `redistribute-source`,
  `resell-template`) and policy (`any-licensed`, `open-source`, `mit-only`).
  These small values persist locally. New agent sessions receive them
  through the existing validated studio context; the prompt may override them.
- `genobi_licences`: a read-only MCP tool listing the catalogue or producing
  JSON and Markdown for a caller-supplied planned/used inventory. Known
  dependencies are expanded (p5.brush's p5 build is not an MIT-only stack).
- `genobi-licensing`: the shared skill invoked by Director, studio, Scrolls
  and house-template skills before selection and when recording results.
- [Credit dossiers](credits/README.md): creator, why selected, actual use,
  exact source/version, licence and original notices, plus inspiration credits.

## The setup question

First-run setup asks one licensing question: commercial use, or research
only, with one line saying the agent picks models whose licences fit the
answer. The answer is saved as the same usage preference Taste & credits uses
(`shared/agent-setup.ts`: research is `demo`, commercial is `commercial-video`;
picking the stance already held keeps a finer purpose such as
`resell-template` and the policy). It reaches every new session through the
studio context, and the session setup starts carries it in its brief as the
licence stance, with the instruction to load `genobi-licensing` and choose
models whose licences fit. The finer purposes and the component policy remain
in Taste & credits; setup no longer shows them.

## What a result means

Report schema v2 distinguishes `version` (the actual version supplied for a used
inventory) from `reviewedVersion` (the catalogue evidence). Supply `versions`
for all used components, including expanded dependencies. Missing or mismatched
versions require review; the catalogue pin is never substituted as proof of
runtime use. Planned reports still show the proposed catalogue versions.
Mixed-content entries can require selection review for every purpose: an MIT
code flag does not clear separately licensed bundled photographs.

`conditions` means the recorded licence permits the general use subject to
its obligations. It does not mean obligations have been fulfilled. `review`
means evidence or a case-specific determination is missing. `excluded` means
it conflicts with the requested licence preference. Unknown IDs and empty
inventories never pass silently. A strict MIT policy excludes Apache and OFL,
although those licences allow commercial uses; it is deliberately stricter
than “commercial video”. Recommendations are not claimed as used-in-run credits.

Models, hosted API contracts, fonts, music, supplied artwork and characters
have separate terms. Existing model flags record openness, not legal eligibility.
The first catalogue covers selected creative code and fonts. Other components
remain unknown until the agent checks their primary sources and records them.
Do not infer output ownership from a weight licence or a paid API subscription.

## Scope and limits

The skill instructs the agent to avoid unsuitable choices. The tool does not
intercept generation, enforce server-side policy, audit all transitive packages,
scan uploads for rights, or automatically write a report after every manual run.
The UI report is explicitly a plan. The agent must inventory actual work and
save `CREDITS.md` and `licences.json` beside the result after the run. It should
link both from the result README. No private paths, keys or provider job IDs
belong in public credits. Generation still uses the existing quote/idempotency
flow; licence selection never grants spending permission.

A future enforcement layer would bind a reviewed inventory and preference to
the quote/project revision, recheck both adapters and fail closed on changed
inputs. That is separate work: a prose skill must not be described as an
app-wide enforcement guarantee.

## Teaser story

Show the construction reveal, the character workflow and a brief Taste & credits
view. Explain: choose the intended use; agents start from curated creative
libraries; each result carries sources, creators and licence conditions.
Credit only actual implementation components as used. Show recommendations
and artistic references under their own headings. Do not claim uniqueness,
creator endorsement or legal clearance.

## Browsable taste layer

`/taste` is the public reference wiki, opened by the book icon immediately left
of the studio mic. It opens in a separate tab, outside the tool dock; the
startup guide also links it. Its search
includes library names, creators, uses and licences; relationship filters distinguish
integrated code, recommendations and references. The JSON catalogue at
`/credits/catalog.json` is generated from the same data as MCP. Run
`npm run taste:catalog` after editing the curated source. Tests catch stale exports.
The page persists only intended-use and model-selection preferences in local storage. Downloaded plans
are explicitly planned inventories, not evidence of a completed render.

## Global setup and session choices

`/taste#setup` holds browser-wide defaults for model family (any, FLUX, LTX),
weights (any or open weights), execution (any, local or cloud), and preferred
agent host. The licence controls separately describe intended reuse and component
policy. Open weights can run in the cloud, Hermes can use hosted models, and a
paid service is not a licence waiver. "Any" does not authorize spending. The
host preference does not switch the configured runner or install it.

The shared `selection` contract passes through studio context and ownership
filtering into new built-in agent briefs. `genobi_models` accepts that selection
and reports matching registry capabilities and supported run locations. An empty
result is not a fallback to an excluded model. Credentials, installed weights,
hardware and workflow still need readiness checks. The tool filters models,
not legal eligibility; check actual model/API terms separately. It does not
enforce preferences at generation endpoints. Both built-in runners allow the
read-only licence tool.

The common licensing skill guides first setup, asks only missing material choices
and reuses defaults later. A current prompt can override defaults for that
session. Settings currently belong to this browser, not an account or an agent's
private memory. They do not synchronize across machines. The isolated agent
browser cannot save preferences in the person's browser. A writable shared
profile service, dedicated installer/setup skill and automatic harness switching
remain future work.

## Project memory, with session intent kept simple

The optional `project.preferences` object stores only explicit project choices:
`selection` and/or `usage`. It travels with the project JSON/ZIP and the existing
local server project copy. Agents read it through `genobi_project` and replace it
with the revision-checked `set-preferences` Director command when asked to remember
a project choice. `preferences: null` clears it. Undo and feedback use the same
project edit mechanism. Older projects omit the field and use global defaults.

At session start, selection fields overlay the global defaults and a project
usage pair replaces the default usage pair. Opening another project reads that
project's choices afresh. "Any" is an explicit override; an omitted field inherits.
The current prompt supplies today's intent and takes precedence for this session.
It does not automatically rewrite the project or global preferences. This adds no
separate memory database or automatic preference learning. Existing built-in
session history is still in memory; persist enduring choices on the project.

## Finished Director video

The existing Director result area displays the rendered video, a short technical
summary, recorded model recipes and creative engines used by active layers.
Download README saves that same snapshot; Edit in Editor opens the same project.
The snapshot belongs to the exported revision and does not change when global
settings change afterward. A new render replaces it; editing invalidates it.

The check compares saved project/global preferences with recorded evidence.
`Conflict found` names known mismatches; `Needs review` means evidence is missing.
There is no green legal-clearance badge: input rights, font/runtime dependencies
and fulfilment of notices are not fully recorded yet. Session-only prompt
overrides are not structured in the report; it explicitly checks saved preferences.

New agent take handoffs and image-remix results retain an allowlisted public
recipe identity (model entry, recipe version, route and optional run location).
Older/imported media remains usable with unknown model provenance. Free-form
tool names are never proof of a model. Reports omit prompts, media paths and
job/provider IDs. This inventories contributing creative modules and media lineage,
not every bundled application dependency.
