---
tags: [plan, verification, world-builder, sound, workflows, backend]
summary: Ten linked implementation issues, a Camera-consistent user flow, two-agent sequencing, modular scene contracts, and release gates for one reproducible audiovisual template.
---

# Audiovisual scene implementation plan

The first release should prove one complete loop: build a scene, hear and see
its response to music, style its captured first frame, render with LTX, inspect
the result, ask the agent for a bounded revision, restore a retained version,
and share the chosen output. CPU room treatment is the first sound path.
AKUSPACE remains a separate musical-quality option and an optional experiment.

This plan revises the audiovisual PRD against `release/v0.14` at
`71d89b1735a523ffeb54c5d3755aff54578c6612`, inspected on 31 October 2026.
The [17-gap audit](audiovisual-gaps.md) records the actual baseline.
The [GPU and evaluator runbook](audiovisual-gpu-evaluation.md) defines evidence
needed beyond source inspection and unit tests. The issues below contain
agent-ready scope, paths, dependencies and acceptance checklists.

## Ten implementation issues

A work package is a reviewable outcome. Large backend packages may need two
small implementation PRs; forcing exactly ten commits would make review worse.

| Package                                                                                | Outcome                                                                                     | Main gaps     | Dependency / gate                                                   |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------- |
| [AV-01 · Camera-consistent UI](https://github.com/koshimazaki/genobi/issues/8)         | Simplify remix; expose Capture's next step and Sound's audio response; accessible selection | B05, B11      | Start now; capable-browser visual check before release              |
| [AV-02 · GPU qualification](https://github.com/koshimazaki/genobi/issues/9)            | Immutable fixtures, model preflight and measured LTX guidance evidence                      | B03, B10, B11 | A: existing-feature pilot; B: final integrated template             |
| [AV-03 · Scene states and evaluator](https://github.com/koshimazaki/genobi/issues/10)  | Versioned room, stable objects, variable state count, shared geometry/audio evaluation      | B02, B06, B07 | Contracts and existing recipe conflicts now; A constrains motion    |
| [AV-04 · Inputs, capture and look](https://github.com/koshimazaki/genobi/issues/11)    | Typed Swap, frozen input set, capture barrier, scene-derived Klein appearance               | B01, B03–B05  | AV-03 contracts                                                     |
| [AV-05 · Hosted projects and restore](https://github.com/koshimazaki/genobi/issues/12) | Ownership, retained assets/revisions, safe restore and real project transfer                | B02, B12      | AV-03/04 contracts; storage scaffolding can start immediately       |
| [AV-06 · Managed runs and delivery](https://github.com/koshimazaki/genobi/issues/13)   | Background completion, stable shot target, atomic companions                                | B13, B14      | Output integrity now; managed project attachment needs AV-04/05     |
| [AV-07 · Agent commands and QC](https://github.com/koshimazaki/genobi/issues/14)       | Shared UI/API/CLI/MCP commands, field locks, scoped memory, evidence-based QC               | B12, B15, B16 | Existing-feature commands/voice now; new scene/hosted work AV-03/05 |
| [AV-08 · CPU room treatment](https://github.com/koshimazaki/genobi/issues/15)          | Captured-room authority, dynamic schedule, full tails, sound-only revisions                 | B06–B09       | Algorithms start now; hosted delivery also needs AV-06              |
| [AV-09 · Optional AKUSPACE quality](https://github.com/koshimazaki/genobi/issues/16)   | Musical-quality comparison and reversible parallel/serial experiments                       | B10, B11      | Baselines and sound interfaces; does not block CPU release          |
| [AV-10 · Flagship and evaluation](https://github.com/koshimazaki/genobi/issues/17)     | Complete project flow, reproducible demo, managed evaluator access, sharing                 | B10, B11, B17 | Core contracts plus AV-02 final qualification                       |

AV-02 deliberately has two milestones. Its offline kit and feasibility pilot
inform the motion vocabulary; its final acceptance follows AV-03/04/10.
The scene work must not wait for AV-02 to close completely. AV-09 is optional.

## Camera is the UI reference

Use the existing Camera design language and components: a stable preview
footprint, compact parameter controls, selected-value summaries, a clear
primary action with readiness/cost, and optional detail behind disclosures.
Retain the current typography, spacing, focus treatment and responsive tokens.

The end-to-end surface has one primary action per stage:

1. **Choose inputs.** Music, Scene and Look each show the active source and a
   direct Swap action. A gallery example opens with a usable default project.
2. **Build scene.** Prepare/validate a bounded scene plan, commit a revision,
   and preview authored motion with the chosen control music.
3. **Refine the source.** Show three initial state thumbnails and movement
   intensity. Advanced exposes additional states, mappings, camera, acoustic
   settings and the agent plan. Scrubbing is deterministic.
4. **Render video.** Capture the frozen source, generate/review the aligned
   Klein look if needed, show the execution route and quote, then submit once.
5. **Review and revise.** Compare guide/result and original/treated audio,
   inspect QC observations, reopen the exact source, or restore a retained
   revision as a new revision. A sound-only change reuses picture.
6. **Share.** Use the existing watch/embed pattern and explicit publication.
   A remix creates an independently owned project with appropriate provenance.

The first UI slice improves current controls; it does not advertise the future
hosted flow before its backing routes exist. Current hosted/local capability
messages must remain accurate.

### Agent control and voice

The target is agent control over supported actions in both web and Studio,
through the same validated commands as the UI. Voice defaults to the agent:
choose a conversation once, keep sending subsequent notes there, and show its
identity. An ended conversation or changed project must hold the transcript
for explicit reselection, never silently switch to the newest agent. Prompt
dictation remains an explicit dynamic destination; changing that selection
must not resend an earlier note or press Generate.

Expose the shared voice action from activity/log and conversation surfaces.
[PR29](https://github.com/koshimazaki/genobi/pull/29) implements the local
header, bubble and deck path under
[issue28](https://github.com/koshimazaki/genobi/issues/28), with browser/mic
verification still open. This does not provide hosted transcription, a hosted
follow-up message transport, canonical hosted project access or complete
web/Studio action parity. Those remain explicit acceptance work; runner
pairing alone does not supply them. Paid actions retain quote/approval gates.

### Evidence from the current UI pass

The live desktop audit found a remix dialog wider than its viewport, four
visually hidden upload inputs acquiring the full dialog width, an agent-only
end to a reuse-only plan, and a landscape-shot filter producing a zero-clip
summary for Adaptive reverb. The focused changes use hidden native inputs,
put media first, disclose the optional brief, reuse the existing guarded Apply
path, and count actual shots/source assets.

Camera's preview/composer and controls dialog supplied the reference. Capture
placed the Layout handoff after a long technical settings stack; Sound opened
diagnostic scopes while modulation was collapsed below them. The UI change
moves Output below capture status/transport, folds settings, shows selected
format readiness, and opens Audio response before optional scopes. Native
disclosures preserve mounted controls and drafts. Radio choices gain the
same arrow/Home/End keyboard behavior as Camera.

The cloud browser could inspect the live UI but could not create WebGL
contexts; that is an environment limitation, not evidence that production
capture fails for ordinary users. It also could not reach the local preview.
Post-change desktop/phone rendering and capable-browser capture are still a
release check. Unit tests do not substitute for that visual check.

## Scene contracts and reusable examples

Keep these records portable and versioned. Extend current recipe/take
contracts rather than maintaining a second scene model.

| Record              | Responsibility                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| SceneRevision       | Immutable authored state, evaluation version, stable object and room identity                           |
| Scene state keys    | Bounded ordered array with unique IDs and frame positions; three initial keys, variable supported count |
| Evaluated scene     | Pure frame result after authored interpolation and bounded audio offsets                                |
| CaptureRecord       | Exact recipe, control-audio slice/hash, curves, camera, frame grid, passes and first-frame identity     |
| AppearanceReference | Klein input frame and reviewed styled image bound to camera/geometry identity                           |
| AcousticSchedule    | Supported enclosure/proxy, materials, listener/source, frame schedule, IR/engine versions               |
| ProjectRun          | Frozen workflow/input identities, quote/reservation, target policy, outputs and delivery state          |
| Revision history    | Retained source and asset references, reasons and restore-as-new behavior                               |

Control music drives motion. An independent soundtrack is an explicit role.
CPU wet sound or regenerated AKUSPACE output must not silently become the
motion-analysis source. A control-music swap invalidates curves, guide and
generated picture; a mix-only change can reuse them.

Use the initial 193-frame, 24 fps, 1024 × 576 contract. It already has validation.
Adding shorter runs requires coordinated changes to capture, slices, trim,
latents, materialization, request validation and decoded-output checks.

### Modular motion, not a three-state ceiling

Start with one acoustic room and readable prop movement. Evaluate authored
states before audio offsets; never accumulate transforms frame by frame.
Test direct, reverse and sequential seeking for one, two, three and more than
three keys. Stable IDs must survive interpolation and editing.

Procedural extensions should use bounded instance groups with generator ID,
version, seed and parameters. Preserve current authored-primitive limits until
an explicit schema migration; define a separate evaluated-instance budget.
For a voxel pyramid, expose count, base width and vertical/horizontal shuffle
through stable lattice IDs and explicit active-set changes. For a cube, expose
layer, axis, pivot and permutation schedule. Do not recompute random identities
on every frame or store hundreds of unchecked expanded props.

A future city recipe uses the same evaluator for seeded buildings and street
parameters. NYC-like aesthetics can be a look family; real-map ingestion,
asset rights and outdoor acoustic modeling are separate work. Decorative
geometry does not automatically define an acoustic enclosure.

### One convincing flagship

The working concept is **Bass House**: a small room responds to the music,
a simple prop or voxel pyramid moves, lights punctuate selected events, then
a much larger hall reveals a comically small sound source. Keep the joke and
look replaceable. The release is judged first on visible control, then on how
entertaining the result is.

Generate the Klein appearance from the exact captured frame zero so its
architecture and camera agree with the motion guide. Start with a few bounded
look families; inspect whether each preserves the structure. One qualified
room template comes before a broad library. Voxel/cube variations and moving
skyscrapers/streets follow the same contracts after the first proof.

## Sound and agent quality control

CPU is the initial route because it makes room changes easier to demonstrate
and preserves the original performance. Distinguish browser preset convolution
from the native geometry-based CPU estimate. The first provenance fix uses
the selected take's captured room, not whichever scene is currently open.

Moving-room sound needs a shared acoustic schedule, retained convolution
history, deliberate gain handling and a full tail policy. Using CPU nodes on
a running GPU worker still incurs that worker's billing; a dedicated sound
route is a later cost optimization.

AKUSPACE remains valuable because the creator prefers the cathedral's musical
sound. Preserve dry/control, CPU, regenerated and final stems. Compare:

- Original and CPU-only treatment.
- AKUSPACE-only creative sound.
- A reversible aligned parallel blend.
- The requested optional serial path: measured room → CPU treatment →
  subtle AKUSPACE, with the exact reference input recorded.

The current aligned-reference node injects audio at time zero even at zero
extra reference-guidance scale. Audio regeneration can still change the
performance or ending. Test actual graph parameters; do not invent a
“subtle” model control. The [runbook](audiovisual-gpu-evaluation.md) covers
alignment, muffled endings, doubled decay, full excerpts and phase review.

Agent QC flags time ranges and evidence, then proposes a bounded repair or
dry/CPU crossfade. It records uncertainty and repair provenance; human listening
accepts musical quality. Do not treat regenerated sound as a phase-aligned
wet-only stem. Failed hybrids remain optional and never delay the CPU proof.

## Two-agent execution order

Start the existing-feature fixes before reserving a GPU. Output selection,
timeline command parity, sticky voice routing, read-only Cloud readiness and
recipe revision conflicts can be reviewed independently of whether the final
LTX/AKUSPACE workflow qualifies. Reuse their portable contracts in later AV
work; do not claim automatic compatibility before that integration is tested.

| Wave                    | Agent A: scene and audio                                           | Agent B: product, cloud and agent                                                                               |
| ----------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 0: repair current paths | Offline AV-02 kit; AV-08 captured-room fix; recipe conflict safety | AV-01 UI; output integrity, existing agent commands, sticky voice and Cloud readiness; agree portable contracts |
| 1: source proof         | AV-03 evaluator; AV-02 A pilot when GPU is available               | AV-05 ownership/assets/revisions scaffold against agreed contracts                                              |
| 2: reliable inputs      | AV-04 Swap/capture/Klein alignment; CPU schedule algorithms        | AV-05 restore; AV-06 reservation/controller and delivery                                                        |
| 3: complete loop        | AV-08 dynamic/tail/sound-only integration; AV-02 B measurements    | AV-07 new scene/hosted commands, planner, locks, memory/QC; AV-10 staged UI                                     |
| 4: evaluator release    | Final seeds, full output/listening review; optional AV-09          | AV-10 second-user flow, watch/embed/remix, sanitized reproducibility kit                                        |

Each agent reviews the other lane's contract or boundary changes before merge.
Use one issue per pickup and small scoped PRs. Record exact checks and remaining
gates in the PR; source tests, real GPU measurements and deployed evidence are
different things. Do not let unrelated library extensions block the core loop.

## Release gates and present status

The first changes prepared from this review are a Camera-consistent UI slice,
a captured-room provenance fix, and an offline qualification kit plus this
plan. They are reviewable implementation work, not a completed hosted product.
No new GPU run, paid job, deployment or production migration was performed.

- [Captured-room provenance PR](https://github.com/koshimazaki/genobi/pull/18)
  establishes the selected take's recipe as the local Apply room authority.
- [Camera-consistent UI PR](https://github.com/koshimazaki/genobi/pull/19)
  implements the first remix, Sound and Capture pass. It remains draft until
  the capable-browser visual check is completed.
- The qualification kit includes 38 offline regressions and a CI step. Every
  new execution record starts as not run; these tests are not GPU evidence.

The follow-up review moves these independent implementation slices into wave 0.
These links identify PR work, not merged or deployed capabilities:

| PR                                                                     | Implemented slice                                                                          | Remaining boundary                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| [22 · Output integrity](https://github.com/koshimazaki/genobi/pull/22) | Select the declared output node/media and require declared audio companions.               | Managed completion, retained bytes and atomic shot attachment still need AV-06.          |
| [24 · Agent commands](https://github.com/koshimazaki/genobi/pull/24)   | Expose existing timeline edits through shared UI/API/CLI/MCP command validation.           | New scene commands, exact creative locks and hosted project control remain AV-03/05/07.  |
| [27 · Cloud readiness](https://github.com/koshimazaki/genobi/pull/27)  | Explicit account-scoped node/model metadata check in Settings and agent discovery.         | Live account check, uploads, model loading, GPU execution and quality remain unverified. |
| [29 · Voice routing](https://github.com/koshimazaki/genobi/pull/29)    | Agent-default remembered conversation, explicit prompt targets and local log entry points. | Capable-browser/real-mic checks and hosted speech/transport remain open.                 |

Managed Comfy Cloud, a custom Comfy API deployment and Router are distinct
routes. A managed-catalogue match is metadata readiness only; a custom graph
needs its declared node/model environment and separate execution qualification.
Router calls model IDs and does not establish arbitrary-workflow support. Use
the runbook's route choice before preparing a paid pilot.

The final release requires:

- Source preview, guide capture and acoustic snapshots agree on saved inputs.
- Real LTX results meet the declared supported-motion gate, across recorded
  seeds with failed examples retained.
- Source and generated audio are labeled accurately; CPU tails/transitions
  and any optional AKUSPACE mode pass their own listening/technical checks.
- Managed jobs finish after the initiating tab closes and attach companions
  once to the correct compatible shot. Reconcile uncertain submissions before
  retrying; never create a second submission or reservation automatically.
- Two authorized browsers reopen the same project and retained revisions;
  viewer access cannot spend and a restore preserves later history.
- A capable browser completes capture and desktop/phone/keyboard UI checks.
- Another person can preview without a GPU key, then use a bounded authorized
  remix session. No owner key is distributed; source/workflow exports and
  public watch/embed pages omit private lineage and personal Taste.

See each issue for its acceptance checklist and the
[GPU/evaluator runbook](audiovisual-gpu-evaluation.md) for execution. The
competition target informs the demonstration; novelty, humor and award results
remain outcomes to assess, not implemented guarantees.
