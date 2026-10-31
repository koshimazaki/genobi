# Working on camera-director

Read [README.md](README.md) for what the app does,
[the code read-through](docs/read-through.md) for where each responsibility
lives, [the architecture](docs/architecture.md) for the cloud boundary, and the
[review checklist](docs/review-checklist.md) before changing behaviour. For
hosted changes, also read [Cloudflare operations](docs/cloudflare.md). Read
[the vision](docs/vision.md) for what Genobi is for.

## Where things are

| Path              | Holds                                                                                                                               |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `shared/`         | Model inputs, camera wording, pricing, lifecycle, replay rules, rate limits and library validation. No framework, Node or DOM APIs. |
| `src/`            | The single-screen React interaction, polling, composer reducer, catalogue adapter, components, Three.js scene and styles.           |
| `server/`         | The local Express adapter: validation, ownership, local lifecycle, provider calls and MP4 inspection.                               |
| `worker/`         | The hosted adapter: the same API over D1/R2, bounded MP4 parsing, polling leases, rate limits and lifecycle sweep.                  |
| `migrations/`     | Ordered D1 schema changes. Apply them to an isolated database before any remote migration.                                          |
| `cli/`            | Terminal adapter over the MCP definitions; private connection/model profiles, JSON input/output and explicit quoted submission.     |
| `mcp/`            | The Genobi MCP server for agents: a stateless, loopback-only client of the local server's API. Paid tools must quote first.         |
| `plugins/genobi/` | The agent plugin for Hermes, Claude Code and Codex: skills, manifests and the bundled MCP server (`npm run build:mcp`).             |
| `observability/`  | Count-only daily generation statistics and their reader. It must not grow into prompt or visitor tracking.                          |
| `tests/`          | Camera maths, validation, pricing, replay safety, lifecycle, session ownership, real MP4 delivery and isolated D1/R2 behaviour.     |
| `docs/`           | Architecture, Cloudflare operations, camera wording, verification evidence, read-through and review questions.                      |

`docs/read-through.md` follows one user action through these layers. Start there
rather than opening files at random.

## Provider documentation

Two providers behind one interface (`shared/provider.ts`): Comfy Router
(`shared/comfy/router.ts`, a Comfy key) and BFL direct (`server/bfl.ts`, a BFL
key). The Router contract was checked on 10 October 2026 against
[router-openapi.yaml](https://docs.comfy.org/router-openapi.yaml) and the
per-model schemas ([ltx-2-5-fast](https://docs.comfy.org/router-schemas/ltx/ltx-2-5-fast.json),
[flux-3-video](https://docs.comfy.org/router-schemas/bfl/flux-3-video.json));
the upscale schema ([video-upscale-v1](https://docs.comfy.org/router-schemas/bfl/video-upscale-v1.json))
was checked on 23 October 2026, and the MiniMax H3 schema
([minimax-h3](https://docs.comfy.org/router-schemas/minimax/minimax-h3.json), version `c0e2e941ffff`)
and its rate on [Comfy's partner-node pricing](https://docs.comfy.org/tutorials/partner-nodes/pricing)
on 27 October 2026. H3 camera and prompt wording follows MiniMax's
[base prompt guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
and [full-reference guide](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/42ed227ee7df40d41602854ae760620d6eb651fe/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md),
pinned to commit `42ed227` and checked on 27 October 2026.
Router has no balance route; a run's cost arrives in `X-Comfy-Credits-Used`.
Its status read carries a generation-duration estimate while a run is
`IN_PROGRESS` (`X-Comfy-Estimated-Duration-Seconds`, `-P90-Seconds` and
`X-Comfy-Estimate-Source`), checked on 25 October 2026; it is the whole run's
usual length, not time remaining, and is shown as words, never as a bar.
LTX camera wording follows the [LTX-2.5 prompt guide](https://ltx.io/blog/ltx-2-5-prompt-guide).

The BFL contracts and camera wording come from BFL's own documentation,
checked 19 September 2026:

- [Generate a video with FLUX 3](https://docs.bfl.ai/api-reference/utility/generate-a-video-with-flux-3)
- [Video upscale, constraints and pricing](https://docs.bfl.ai/flux_tools/flux_video_upscale)
- [Camera prompting guide](https://docs.bfl.ai/guides/prompting_video_camera_terms) — see
  [camera wording](docs/camera-wording.md) for what the demo does and does not claim.
- [Pricing](https://docs.bfl.ai/quick_start/pricing)

Cite documented behaviour. Do not infer an exact prompt or reliability claim
from an example video.

## Checking your work

```sh
npm run format:check
npm run lint
npm run check:size
npm run typecheck
npm test
npm run check:licences
npm run check:registry
npm run check:scene-adapter
npm run build:pages
```

[CI](.github/workflows/ci.yml) runs the formatting, lint, file size, type, test,
build and Cloudflare boundary checks on every pull request and push to `main`.
Run the relevant checks locally before proposing a change; a red CI is not a
review comment. Use the review checklist for agent and independent review passes, and turn a
confirmed regression into a focused test rather than storing a review transcript.

Two environment facts are easy to miss:

- **`shared/` must stay portable.** `npm run check:worker` compiles it under
  `"types": []`, so a Node or DOM import fails the hosted boundary.
- **`worker/env.d.ts` is generated.** Regenerate it with Wrangler; do not hand-edit it.
- **`LICENCES-npm.md` is generated.** After a dependency change, run
  `npm run licences`; a new licence outside the allowlist in
  `scripts/licence-report.mjs` needs a reviewed exception. Models and other
  terms live in [`LICENCES.md`](LICENCES.md).

## Stable studio dimensions

- Text to video, Upscale, Image and Edit must open with the same hero and composer
  dimensions at each breakpoint. Switching modes must not move the toolbar or gallery.
- Put Image/Edit drawing and source drops in the existing hero footprint. Keep
  references compact beside the prompt; selected box controls overlay the canvas.
- Long user-authored prompts may grow the composer; mode selection alone must not.
  Check empty and populated states at desktop and phone widths after layout changes.

## Rules that matter

- Generation is a paid side effect. Persist the idempotency reservation before
  submission and never automatically retry an uncertain submission. Quota
  eviction must preserve replay protection until normal retention.
- Keep visitor keys transient. Never persist or log one. Public assets and docs
  must exclude credentials, provider job identifiers, private lineage, personal
  preparation and machine-specific paths.
- Keep shared model inputs, pricing, lifecycle and replay rules in `shared/` so
  the local and hosted adapters cannot disagree. Verify every adapter that reads
  a changed contract.
- A World Builder change in `src/world-builder` also ships in the Comfy node.
  Rebuild its standalone bundle with `npm run build:scene-adapter` and run
  `npm run check:scene-adapter` (CI runs it), which fails when the bundle does
  not build, is not reproducible, or a local node bundle is older than the sources.
- Control-character classes in sanitizers are deliberate. Filenames, catalogue
  labels and BFL keys strip `\x00-\x1f\x7f` before use.
- Keep every file at 500 lines or fewer. Split by topic rather than by count,
  and move shared helpers (test harnesses included) into a small module of their
  own. Go to about 800 only when splitting would genuinely hurt cohesion, and
  say why in the allowlist in `scripts/check-file-size.mjs`; generated files are
  the only other entries. `npm run check:size` enforces it for tracked source
  and reports long Markdown pages, which should be split when they next change.
- Keep production modules focused and update the relevant documentation in the
  same change as behaviour. Say what was actually run and distinguish local
  evidence from deployed behaviour.
- Preserve existing worktree changes and keep edits scoped to the request.
- Only a push to `main` of this public repository deploys, through the
  `Deploy production` job behind the `production` environment and its
  approval; pull requests never deploy. Never assume a merged change is live:
  check the job and `/api/health`. Keep migrations additive, so the previous
  deployment can run against the updated schema while Pages switches versions.
- Local verification does not authorize a paid call, manual remote migration,
  deployment or publication. Follow the operator's requested scope.

## Using Genobi from an agent terminal

Build with `npm run build:mcp`, then run
`node plugins/genobi/server/genobi-cli.mjs help` (or the installed `genobi`).
Read `tools` and `schema COMMAND` before constructing input; use `--input @file.json`
or stdin for long prompts. Load `genobi-cli` and the task skill with `skill`.
See [the CLI guide](docs/genobi-cli.md) for profiles and the shared MCP identity.

Read linked project `context` before editing. Record evidence as interpretations
and checkpoint meaningful work; reusable Taste proposals need owner activation.
The current request outranks project guidance, active Taste and defaults.
Use the existing `swords` media commands for frames/cuts, not guessed live timeline
operations. A paid `submit` needs an accepted quote and `--confirm`; never retry an
uncertain submission automatically, change its request key, or remove agent marks.

### Save memory as you go

Work the owner wants again must be repeatable from what is saved, not from a
chat transcript. Save at the moment it happens:

- **Briefs and corrections.** When the person gives a brief or corrects a cut,
  record it with `decision` as an interpretation of their words, quoting them;
  never present it as their stated preference. One entry per correction.
- **Progress.** `session-checkpoint` after each meaningful step (a capture, a
  render, a review round), citing real event ids; never mark interrupted work
  done.
- **Reusable taste.** Propose what generalises (a rule, a palette, a pacing) as a
  Taste proposal; only the owner activates it.
- **The recipe.** For a piece worth repeating, keep a "How to repeat it" section
  in its doc (for example [the Genobi teaser](docs/genobi-teaser.md)): the brief,
  inputs, steps, scripts, every correction and the rules learned. A developer
  agent updates that doc in the same PR as the change.
