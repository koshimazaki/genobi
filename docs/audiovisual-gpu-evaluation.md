---
tags: [verification, workflows, comfy, world-builder, sound, architecture]
summary: Operator runbook for staged audiovisual GPU qualification, CPU-first sound evaluation, managed deployment acceptance and evaluator access.
---

# Audiovisual GPU and evaluator runbook

**Status: execution pending.** This document defines the checks needed for the
proposed audiovisual release. It does not report a new GPU run, deployed
endpoint or completed evaluator session. Historical GPU results are recorded
separately in [Adaptive reverb proof](adaptive-reverb-proof.md).

The [qualification kit](https://github.com/koshimazaki/genobi/blob/release/v0.14/workflows/qualification/README.md) prepares exact
diagnostic audio, snapshots workflow graphs and validates evidence. It does
not render Three.js, run ComfyUI, submit a job, or establish that a reviewer's
measurements are true. New records start as `not_run`.

## 1. Choose the gate and keep its scope honest

| Gate                                   | Inputs and purpose                                                                                                                                                                                                                                                              | Exit condition                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **A: feasibility, AV-02**              | Current fixed-grid graph; fixed camera; one rigid object and one moving wall/ceiling. Use supported current controls or a documented deterministic diagnostic guide, independently of the production state editor. Compare authored capture before spending on generated video. | Record actual successes/failures and a supported initial motion vocabulary. Contract work in AV-03/04 can proceed alongside this pilot.         |
| **B: final template, AV-02 and AV-10** | Implemented shared evaluator, frozen input bindings and complete source template. Run three states, combined motion/camera, control-audio swap and the final full-length example.                                                                                               | At least three recorded seeds per required release case, all required evidence and thresholds, and actual end-to-end placement/recovery checks. |
| **Moving sound, AV-08**                | Evaluated single-room acoustic schedule, continuous convolution history and an explicit tail policy.                                                                                                                                                                            | Static/transition/late-tail checks pass. Until then, advertise static treatment at a named source frame.                                        |
| **Creative sound, AV-09**              | Optional AKUSPACE and serial/parallel experiments using preserved sources.                                                                                                                                                                                                      | Record musical preference, source changes, phase/alignment and ending review. This gate does not block the qualified CPU-first path.            |

The three-state benchmark uses frames 0, 96 and 192. The implementation
contract is a variable-length ordered state array; test one, two, three and
more states separately. Modular voxel-pyramid and Rubik-like recipes follow
the first room proof; seeded skyscrapers/streets follow those. Requalify their
motion and instance budgets instead of treating the first room result as
evidence for every scene family. No new training is part of this first pass.

## 2. Prepare an immutable evidence directory

From the repository root, with Python 3.10 or newer:

```sh
export GENOBI_AV_EVIDENCE="$(mktemp -d)/qualification"
python3 workflows/qualification/prepare.py --output "$GENOBI_AV_EVIDENCE"
python3 -B -m unittest discover -s workflows/qualification -p 'test_*.py' -v
```

The final output directory must not already exist. Keep it outside the repo;
retain original failures as well as accepted runs. The kit makes a dry test
track and a version whose bursts occur four frames later. Synthetic bursts
test causality; they are not the musical demo. Repeat the final evaluation
with cleared, shareable music and retain its rights/provenance information.

The current accepted capture is **193 frames, 24 fps, 1024 × 576**. At 48 kHz,
its soundtrack contains **386,000 samples**. Frame 192 is at 8 seconds; encoded
duration is 193/24 seconds. Keep the existing
[deployment guard](https://github.com/koshimazaki/genobi/blob/release/v0.14/shared/comfy/deploy-input.ts) and
[materializer](https://github.com/koshimazaki/genobi/blob/release/v0.14/workflows/materialize-ltx.py) intact. A 73-frame pilot is not
currently valid: first change capture, graph slicing, trim, latent lengths,
validation and output checks together through AV-02/04.

## 3. Make the guide and matched look

1. Capture an authored control case before model inference. Save recipe,
   frame grid, RGB guide, first frame, optional depth, control curves and the
   matching WAV. Depth is retained evidence; the current L2R graph does not use
   it as a depth-control input.
2. Start with a fixed camera and a large isolated prop; then one readable
   moving boundary. Record direct-seek and sequential evaluations. If using a
   diagnostic guide rather than the production evaluator, identify its exact
   generator/version and do not claim production scene support from it.
3. Generate the Klein appearance image from the exact captured frame zero.
   Keep the source image and its camera/geometry identity. Inspect projection,
   room boundaries and object count after styling. An unrelated attractive
   still is not an aligned reference. See the
   [recorded scene → Klein → L2R route](adaptive-reverb-proof.md).
4. Keep both sampling stages and the baseline guide strengths initially. Hold
   prompt, seed, model versions and camera fixed for paired comparisons. Change
   one guide/reference/audio-conditioning variable at a time; record it as an
   ablation rather than silently replacing the reference graph.
5. For the audio-swap case, load the shifted dry track and rebuild analysis and
   capture. Preserve stable scene IDs and compatible look. The old guide must
   fail validation; replacing only the graph's soundtrack is not this test.

The original dry source always drives motion. CPU-treated or regenerated
sound must not silently become the control track. Qualification B uses the
final source scene, not only a diagnostic movie that bypasses its evaluator.

## 4. Prepare the actual GPU route

Use [Comfy deployment operations](comfy-deploy.md) for authentication, current
CLI prerequisites, model resolution and billing. A configured endpoint or
successful offline build-spec test is not a deployed model. Choose actual
hardware from the deployment's compute catalogue; prior records used a 96 GB
GPU and do not establish a lower VRAM requirement.

The existing operator build commands are:

```sh
python3 comfy-build/scripts/comfy_build_spec.py --name genobi-ltx-world --sets ltx-world-key --check-workflows > ./comfy-build.yaml
python3 -B -I -m unittest discover -s comfy-build/tests -v
```

The generated root spec is local operator state. Do not overwrite its
push-written build/revision identity after release work begins. An authorized
workspace operator then follows the push/release/deploy sequence in
[the deployment guide](comfy-deploy.md#owner-commands-push-release-deploy),
choosing a real GPU ID/region and checking model fetches. Verify FFmpeg and
FFprobe on the worker before accepting captured WebM input. Record the actual
ComfyUI/custom-node revisions, Python/PyTorch/CUDA/driver versions, model and
adapter hashes, GPU/VRAM, peak memory, wall time and billing evidence.

For a direct graph diagnostic, fill the documented tokens in a values JSON:

```sh
python3 workflows/materialize-ltx.py --endpoint layout-to-video --preset studio --values /tmp/layout-values.json --output /tmp/layout.api.json
```

This only materializes JSON. Follow the corresponding README and the
[documented operator run command](comfy-deploy.md#owner-commands-materialize-and-run)
to execute it. Check the staged asset list includes the custom Capture node's
colour/depth files as well as image/audio loader inputs. If resolution is
incomplete, fix staging before submission. Recover an uncertain submission
using its existing reservation/provider job; never issue a new run to find
out whether the previous one started.

For the product-path test, use Camera: connect the authorized workspace key,
register its endpoint in Settings → Generation setup, select Comfy Deploy ·
layout-to-video, attach the frozen scene and aligned look, review the quote,
then confirm once. Keep the tab open through capture/staging. Current hosted
session jobs and future managed project runs are different acceptance paths.

## 5. Measure the visual output

Use [`matrix.json`](https://github.com/koshimazaki/genobi/blob/release/v0.14/workflows/qualification/matrix.json) and retain
per-frame annotations. These are initial product thresholds, not measured LTX
guarantees:

| Check                      | Required record/threshold                                                                                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rigid landmarks            | Maximum error ≤ **2% of frame diagonal** against projected guide positions. Record coordinates and visibility.                                                                      |
| Architectural boundaries   | Maximum error ≤ **5% of frame diagonal** at the selected wall/ceiling landmarks.                                                                                                    |
| State sequence             | All intended states in order; no unexplained disappearance or replacement of major architecture.                                                                                    |
| Event timing               | Selected motion/light events within **two frames at 24 fps**; report the maximum and distribution, not only average or best-shifted correlation.                                    |
| Source timing              | Decoded source has the expected frame count/cadence; authored event error at most one frame in the kit. Direct and sequential evaluation agree within a declared numeric tolerance. |
| Output duration            | Model picture agrees with the frozen duration within one frame, with no unexplained soundtrack offset. Tail-extended export has its own duration and policy.                        |
| Supplemental motion checks | Correlation ≥ 0.8 and displacement ratio 0.6–1.4 in the kit; these do not replace spatial errors or state-order checks.                                                             |

Annotate occluded or ambiguous samples as such; never invent zero error or
silently drop disappeared geometry. A moving camera needs motion compensation
or manual projected annotations. Keep the failed outputs. Run one pilot seed
per baseline case, then three distinct seeds for each required release case;
use the same seed in each original/swap pair. Light fidelity is exploratory
until it passes its own check; omit that promise if it fails. Review whether
the combined result is funny separately from whether its control is accurate.
The kit currently checks the fixed 193-frame output as well as timestamps;
the PRD's one-frame duration tolerance is not permission to bypass that guard.

## 6. Prove CPU sound; evaluate AKUSPACE separately

The stock combined graph freezes LTX audio conditioning and muxes the CPU
reverb mix of the source. Its acoustic prompt node does not load AKUSPACE.
The separate AKUSPACE graph regenerates audio; it is not transparent
convolution. See [the qualification kit's sound cases](https://github.com/koshimazaki/genobi/blob/release/v0.14/workflows/qualification/README.md).

For CPU treatment, retain dry audio, IRs/schedule, wet stem and final mix.
Test a stationary scene, smooth expansion, impulses immediately before/during
IR transitions, sustained tones and a final impulse whose decay outlasts the
picture. Check sample continuity, channel handling, gain, clipping, full
decay and deterministic IR hashes. Moving sound needs continuous convolution
history; the current static graph cannot pass that claim. A sound-only change
must make no video-generation request and preserve the elementary picture
stream even though its new mux file has a different hash.
For the supported enclosure model, test that moving/rotating the room, source
and listener together preserves the response. Reject unsupported multiple
rooms and invalid source/listener positions explicitly.

Optional `serial_cpu_akuspace` evaluates measured-room CPU treatment followed
by subtle AKUSPACE. Preserve original/control, CPU, regenerated, reference and
final audio separately. Explicitly record whether the aligned reference was
original dry or CPU-treated audio. Record real graph parameters; “subtle” is a
product intention, not an invented model setting. No parallel experiment is
a prerequisite, though it can be a useful comparison.
The pinned aligned-reference node still injects reference tokens at time zero
when its extra reference-guidance scale is zero; the
[kit documents that distinction](https://github.com/koshimazaki/genobi/blob/release/v0.14/workflows/qualification/README.md#preserve-the-sound-alternatives).
Neither time-zero alignment nor zero extra guidance proves source fidelity.

Compare level-matched complete excerpts and endings, including the preferred
cathedral case and a smaller room. Check muffled/damaged tails, doubled decay,
musical changes, onset drift, latency, polarity and coherence. Regenerated
audio is not assumed phase-aligned or wet-only; do not obtain a supposed wet
stem by subtracting dry audio. Agent QC may flag ranges with confidence and
evidence, then propose a reversible local crossfade to dry/CPU audio. Retain
the repair manifest and listen across transient and sustained boundaries.
Human listening decides musical acceptance. An unsuccessful hybrid remains
experimental and does not postpone the CPU-first release.

## 7. Validate and retain the evidence

Copy the generated template, then fill each measured run exactly as described
in [the evidence format](https://github.com/koshimazaki/genobi/blob/release/v0.14/workflows/qualification/README.md#record-and-validate-evidence):

```sh
cp "$GENOBI_AV_EVIDENCE/evidence.template.json" "$GENOBI_AV_EVIDENCE/evidence.json"
python3 workflows/qualification/evidence.py --fixture "$GENOBI_AV_EVIDENCE" --evidence "$GENOBI_AV_EVIDENCE/evidence.json" --case object_motion
python3 workflows/qualification/evidence.py --fixture "$GENOBI_AV_EVIDENCE" --evidence "$GENOBI_AV_EVIDENCE/evidence.json" --phase release
```

The unfilled template must fail. Add `--dynamic-sound` to the release command
only when claiming moving room sound; a static release must say static.
Reference cases need resolved API graphs matching the snapshot, with only
allowed placeholder values filled. Changed graphs belong to declared candidate
experiments. Record actual hashes and versions, source bindings, measurements,
reviewer, sanitized execution logs and every required output. Validator success
checks consistency and declared thresholds; it does not independently verify
subjective listening or the truth of supplied annotations.

Retain source project/recipe, guide and look, control curves, model/graph
versions, seed, dry/wet/generated stems, IR schedule, run record, full outputs
and failed cases. Publish a sanitized evidence subset with rights-cleared
assets. Remove credentials, private provider IDs, private history and personal
Taste; do not remove failures merely because a cleaner demo exists.

## 8. Accept deployment and give evaluators an honest route

Before AV-05/06/10 ship, Camera can test a configured endpoint with a key from
its own authorized Comfy workspace. This proves session staging/quote/output
delivery only. Runner pairing and a reachable endpoint do not establish hosted
project synchronization, background completion or automatic shot placement.

For the complete release, run these checks with two authorized browsers and a
viewer account:

1. Open one canonical project, preview with sound, swap control music, Build
   scene and Render video. Reopen the exact source revision and all companions
   from the result. The teammate needs no local install or project ZIP.
2. Close during capture: no submission occurs. Close after accepted submission:
   the managed controller finishes and attaches outputs. A lost acknowledgement,
   controller restart, queue over 30 minutes and failed output copy recover the
   same job without a second paid submission.
3. Edit another shot during generation and preserve it. Replace/delete the
   target and keep the completed result safely unattached. Verify atomic
   companions near quota and exactly one audible soundtrack. Test revocation
   and foreign-workspace IDs; a viewer cannot spend.
4. Restore an older retained revision as a new revision; keep later takes.
   Test real phone/desktop layouts, keyboard/focus, reduced-motion UI and
   browser capture. Camera remains the design reference for compact controls,
   readiness and primary actions; unit tests do not replace this check.
5. Provide a view-only precomputed watch/embed example and a downloadable
   sanitized source/workflow kit. Separately invite authorized remix evaluators
   to a configured workspace with declared budget, concurrency and expiry.
   Never distribute the owner's key as evaluator access. Share a generated
   project only after an explicit sharing action.

Record endpoint/release identity privately and publish only appropriate model,
graph and media provenance. Confirm the worker scales down as configured and
check current storage charges; scale to zero does not remove model storage.
Use [Comfy deployment operations](comfy-deploy.md) for shutdown and account
checks. Stop at the qualified scope when a gate fails; publish narrower claims
or a tracked follow-up instead of relaxing thresholds silently.
