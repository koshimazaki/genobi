---
tags: [architecture, agents, studio, workflows]
summary: Priority order for the fifteen open issues, existing implementation, remaining slices, and local, hosted and agent surface coverage.
---

# Maintenance priorities

Planning baseline: 5 November 2026, public `main` at `16142fff`.
This is a recommended execution order, not a change to issue severity or a
claim that a feature has shipped. GitHub issues retain their acceptance criteria.
Sizes below estimate reviewable PRs, not elapsed time or completion percentages.
Provider qualification and browser acceptance remain separate from source tests.

Prioritise correct execution and reusable inputs, then complete the agent editing
loop. Existing foundations should be reused before adding another platform layer.

## The fifteen open issues

| Rank | Issue                                                                                              | What exists                                                                                                                                         | Smallest remaining work and approximate size                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | [#107 — GPU box follow-ups](https://github.com/koshimazaki/genobi/issues/107)                      | Box selection, tunnel status and destination-specific graph checks.                                                                                 | Refuse an invalid saved box instead of omitting it and routing to Local; refresh readiness on live reachability changes. **1 small PR.** Track the Cloud warning gap with #47.                                                                                       |
| 2    | [#108 — Recreate follow-ups](https://github.com/koshimazaki/genobi/issues/108)                     | Camera run restore, private reference cache, project generation settings, template slot recipes and guarded handoffs.                               | Preserve Klein edit mode; report missing workflow identity and the actual recorded provider; cover duplicate references and prompt-less runs. **1–2 focused fixes.** Then add the durable [recipe library](recreate-library-plan.md) in separate slices.             |
| 3    | [#47 — Cloud dependency preflight](https://github.com/koshimazaki/genobi/issues/47)                | The fully filled graph is checked by shared `preflightGraph`, used by Cloud, local ComfyUI and box execution. This is no longer Klein-only.         | Bring unknown-availability disclosure to direct Generate and hosted quotes, clarify GPU-time estimates, and test variant/account isolation. **1–2 PRs.** Cache only if measurements justify it.                                                                      |
| 4    | [#37 — Agent media import/replace/relink](https://github.com/koshimazaki/genobi/issues/37)         | Browser import/replace, generated-take import, owned derived-media import, and the template agent entry point.                                      | Add owned-file staging and revision-checked attach/replace/relink through HTTP, MCP and CLI. **2–3 PRs.** This completes the input side of an agent-driven creature workflow.                                                                                        |
| 5    | [#12 — Local project archive/restore](https://github.com/koshimazaki/genobi/issues/12)             | `bundleZip`, `saveBundle`, `importBundle`, file hashes, brief files and World companions already exist.                                             | Reconcile the issue body with its latest local-only scope; verify a representative complete archive in a fresh session and improve missing-file/recovery UX. **Acceptance audit, then 0–1 focused PR.** Hosted teams are outside this slice.                         |
| 6    | [#39 — Agent export receipt](https://github.com/koshimazaki/genobi/issues/39)                      | Browser ZIP/MP4 export and paired World capture already work; headless export is correctly unavailable.                                             | Add a browser-backed Director/Scroll export request, progress/cancel and a completed artifact receipt tied to the source revision. **2–3 PRs.** This completes the output side of the agent editing loop.                                                            |
| 7    | [#48 — FLUX video/upscale provider choice](https://github.com/koshimazaki/genobi/issues/48)        | Both routes and key selection exist; stills already have an explicit provider choice.                                                               | Add a distinct video/upscale override bound to quote, replay and polling, then reuse the compact selector. **1–2 PRs across both adapters.** Keep Auto's BFL preference.                                                                                             |
| 8    | [#14 — Agent control and protections](https://github.com/koshimazaki/genobi/issues/14)             | Shared commands, local project memory, quote approval, voice conversation routing and guarded World handoffs.                                       | First add CLI parity for queued studio messages and task activity; then capability-driven handoff diagnostics. **1–2 small slices.** Hosted follow-up delivery, field locks and planner/history remain a larger umbrella; do not block #37–39 on that platform work. |
| 9    | [#38 — Live Scroll bridge](https://github.com/koshimazaki/genobi/issues/38)                        | Pure JSON Scroll tools, one-use panel fill, browser handoff and voice target guards.                                                                | Expose the mounted document/revision/selection/assets, revision-checked edits and Director handoff read-back. **2–3 PRs**, reusing #37 media attachment.                                                                                                             |
| 10   | [#11 — Input identity and editable motion layers](https://github.com/koshimazaki/genobi/issues/11) | Frozen recipes, pass hashes, evaluator/control-envelope/frame-zero fingerprints and registered editable effects.                                    | Finish runtime swap invalidation and look/guide compatibility; keep the newer custom-layer request as a separate bounded slice shared with #42. **2–4 PRs**, depending on whether trusted parameterised components suffice.                                          |
| 11   | [#17 — Complete scene-to-render example](https://github.com/koshimazaki/genobi/issues/17)          | Curated examples, source workflows, preview/sharing, capture and custom deployment paths.                                                           | Choose one supported recipe and prove preview → edit → capture → approved render → compare → archive/reopen. **Several integration/acceptance slices.** The original cross-browser hosted ownership promise is much larger and depends on a scope decision.          |
| 12   | [#10 — Scene states/evaluator](https://github.com/koshimazaki/genobi/issues/10)                    | Versioned variable-length states, `evaluateScene`, room surfaces, bounded voxel instances, shared capture evaluation and direct/reverse seek tests. | Reconcile the stale unchecked list against these implementations; qualify residual topology/active-set cases and decide what remains. **Acceptance audit, then 0–1 focused PR** for the current supported scope, not a new evaluator.                                |
| 13   | [#42 — Animation/effects extensions](https://github.com/koshimazaki/genobi/issues/42)              | Presets, editable effects, shape/camera loops, vehicle forms and measured audio response.                                                           | Pick one extension with a usable example and deterministic export. Choreography, voxel intake, temporal water and arbitrary source authoring are separate projects. **One PR series per extension.**                                                                 |
| 14   | [#13 — Managed background jobs](https://github.com/koshimazaki/genobi/issues/13)                   | Replay-safe jobs, output validation and companion-copy recovery.                                                                                    | Managed credential custody, scheduler/controller, retained project targets and transactional attachment remain. **Large, multi-PR platform work.** The old dependency on hosted #12 no longer follows the narrowed local archive scope.                              |
| 15   | [#16 — AKUSPACE hybrid qualification](https://github.com/koshimazaki/genobi/issues/16)             | AKUSPACE graphs, CPU sound and offline qualification helpers.                                                                                       | Controlled, level-matched listening and source-drift comparisons; retain failures and keep Hybrid experimental. **Bounded experiment with uncertain outcome**, not a prerequisite for reliable editing.                                                              |

## Scope corrections before starting large work

- [#12's latest direction](https://github.com/koshimazaki/genobi/issues/12#issuecomment-6644775412)
  is local organisation plus ZIP archive/restore. Its original hosted
  workspaces/members/revision checklist is not the current first task.
- [#11's later direction](https://github.com/koshimazaki/genobi/issues/11#issuecomment-6644774867)
  adds editable motion graphics while explicitly retaining the Audio / Animation /
  Image input contract. Keep both requirements visible; do not replace input
  integrity with a generic HTML editor.
- #10's original missing evaluator is substantially implemented in
  `src/world-builder/scene-state.ts`, `evaluate-scene.ts`, `scene-state-validation.ts`
  and `scene-capture.ts`. `tests/world-builder-scene-motion.test.ts` covers one,
  two, three and five keys, reverse seeks and unchanged legacy motion. This does
  not by itself complete every original active-set/topology acceptance item.
- #47's original Klein-only description predates the shared pre-submit check in
  `shared/comfy/preflight.ts` and `server/comfy-sdk.ts`. Separate completed blocking
  checks from the remaining unknown-status, hosted quote and pricing wording work.
- #14 still contains references to voice work subsequently completed in the
  conversation-continuation changes. Read `src/voice/agent-destination.ts` and
  the current tests before implementing that work again.

## Surface coverage

Every user workflow needs a discoverable supported path, but internal routes do
not each need a UI button or a hosted implementation. The runtime manifest is
`shared/runtime-capabilities.ts`; `/api/capabilities` exposes it. The plugin's
`capabilities.json` is a separate feature catalogue, not a complete HTTP route
registry. Its `runs.route` values describe execution classes, not URL handlers.

| Workflow                     | Browser                                               | Local HTTP / agents                                          | Hosted boundary and remaining work                                                                                        |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Generation, quote and result | Camera/Gallery; explicit agent approval               | Shared schemas and CLI/MCP tools                             | Worker implements the generation lifecycle; quote availability disclosure differs (#47).                                  |
| Run location and readiness   | Settings and run-mode line                            | Workflow tools and status routes                             | Cloud/deployment supported; local/box deliberately local. Fix #107 and #48.                                               |
| Edit a project and its media | Director/Editor/Assets                                | Linked project commands; takes/derived media can be imported | Canonical project files remain local. Generic agent media operations need #37.                                            |
| Voice and agent conversation | Local mic, held transcript, continue/new conversation | Local transcription and session-pinned routing               | Hosted voice is explicitly unavailable. Paired hosted runner supports start/list/read/stop, not follow-up messages (#14). |
| World scene/capture          | Mounted WebGL tab and capture UI                      | Paired commands plus guarded recipe edits                    | Browser work is not headless capture; preserve this distinction.                                                          |
| Scrolls                      | Live browser document and panels                      | Pure JSON tools and one-use text fill                        | General live revision/selection/media bridge is #38.                                                                      |
| MP4/project export           | Browser exporter                                      | World completion path exists                                 | Director/Scroll agent completion receipts are #39, not a Cloud config switch.                                             |
| Recreate an asset            | Camera, Assets and template-slot entry points         | Recorded project generation metadata                         | Incomplete historical records and expiring inputs need #108 and the recipe-library plan.                                  |

### Agent and CLI improvements under #14

The CLI dispatches the same `ToolDefinition.run` and Zod schemas as MCP
(`cli/run.ts`, `cli/commands.ts`). Existing integration tests cover separate-process
quote ownership, confirmation, one submission on replay and lost-response recovery.
Keep that single implementation.

Transport-level behavior differs: MCP wraps calls with `trackedTool` and
`withMessages` in `mcp/server.ts`; CLI calls `tool.run` directly. Consequently,
CLI-only calls in a studio-started session do not collect queued studio messages
or emit that wrapper's task activity. Add a shared execution envelope or an
explicit structured CLI inbox/status interface, preserving existing JSON output,
grant checks, one-time message delivery and no automatic paid retries. A test
must send a correction during a CLI-only run and prove the next intended read
delivers it once to the same session.

Ordinary `GenobiApi` reads/writes and media reads also lack the explicit short
deadlines already used for activity/inbox requests. Consider operation-specific
deadlines and actionable errors: a timed-out write remains uncertain and must
never trigger a retry. This is a resilience improvement, not evidence that the
current paid request lifecycle is broken.

The generated registry verifies tool/skill coverage and document links. It cannot
prove that every prose example works, every route has an appropriate UI, or a
provider is available. Extend contract coverage with an explicit local/hosted
operation matrix: advertised operations resolve, unsupported ones explain why,
and user actions do not expose a path the selected runtime cannot complete.

## First implementation sequence

The [first nine PR plan](first-nine-pr-plan.md) turns ranks 1–9 into a sequential
implementation queue with concrete scopes, dependencies and acceptance gates.

1. Fix #107 and #108's confirmed restore bugs; retain the focused regressions.
2. Complete #47's warning/quote parity and qualify one full archive under #12.
3. Implement #37 input attachment and #39 export receipts, with #14's CLI inbox
   parity alongside them. This creates a complete inspect → edit → export loop.
4. Add the [recipe-library slices](recreate-library-plan.md), starting with
   verified existing records and explicitly incomplete creature records.
5. Reconcile #10/#11/#14 checklists before extending #17 or starting managed
   hosting. Keep speculative graphics and sound experiments independently scoped.

Useful existing verification entry points are `npm run check:registry`,
`npm run check:capabilities`, `npm run check:worker` and `npm test`.
For changed handoffs, add browser acceptance with a project switch, stale
revision, missing reference and interrupted operation. Fake-provider tests do
not establish live GPU behavior, physical-microphone quality or production state.
