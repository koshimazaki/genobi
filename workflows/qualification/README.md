# Audiovisual workflow qualification

This offline kit prepares diagnostic audio, snapshots the actual workflow graphs,
and checks evidence supplied after a real run. It does not capture Three.js, run
ComfyUI, upload files, submit jobs, or calculate model-quality scores. All new
records start as `not_run`; fixtures and passing unit tests are not GPU evidence.

## Prepare repeatable inputs

Use Python 3.10 or newer, from the repository root:

```sh
python3 workflows/qualification/prepare.py --output /tmp/genobi-av-qualification-01
python3 -B -m unittest discover -s workflows/qualification -p 'test_*.py' -v
```

Choose a new output directory outside the repository on each preparation. Existing
evidence is never overwritten. The command generates two mono 48 kHz PCM files,
graph snapshots, a fixture manifest, the acceptance matrix, and an empty evidence
ledger. The dry diagnostic track contains windowed 80 Hz, 800 Hz, and 6 kHz bursts.
Every burst in the swapped track occurs four frames later. These are synthetic
test signals, not a musical demonstration or a supplied private track.

The default is exactly 193 frames at 24 fps: 386000 audio samples, with the last
video frame at 8 seconds and encoded duration 193/24 seconds. The current Python
materializer and TypeScript deployment validation require that geometry. A cheap
73-frame pilot must wait for the duration-contract change across all adapters;
editing only the frame slicer is insufficient.

Keep the dry source immutable. It drives the scene evaluator, even when the
soundtrack uses CPU processing, AKUSPACE regeneration, or a later hybrid.
The supplied matrix defines scenarios; compatible room-state animation and dynamic
acoustics still need their implementation PRs before those cases can run. Three
states are a benchmark fixture and an initial UI arrangement. The scene schema
must support a bounded variable number of keys. Procedural cube-layer or voxel
motion belongs to scene authoring before attempting more complex street scenes.

Prioritize CPU scene manipulation, source-preview correctness, and the cheaper CPU
room-sound demonstration. CPU authoring tests do not depend on a successful LTX
run. Qualify the simple object/wall GPU cases first, then the complete dynamic
template. AKUSPACE and hybrid audio are optional experiments, not prerequisites
for authoring or the CPU demo. This kit validates the later supplied media evidence;
it does not replace evaluator, browser-capture, or acoustic-engine unit tests.

## Run the visual cases on a real GPU

Start with a fixed camera and one object, then one moving wall, then three scene
states. Keep both stages of the reference Layout-to-Render graph and its existing
guide strengths. Use an appearance reference made from the guide's first frame.
Capture and save control curves before generation. Do not infer generated motion
quality from the authored preview.

Run each required case once for a pilot and on three distinct seeds for release
qualification. Repeat the combined case after loading the swapped dry track and
recapturing. Use the same seed for each paired original/swap comparison. Record
failed runs and artifacts too; do not silently choose only a favourable seed.
Generation remains an operator-controlled, separately authorized action through
the existing quote/confirmation flow or Comfy deployment tooling.

The current source graphs require large model stacks. Select hardware from the
deployment's current compute catalogue; the repository records prior runs on a
96 GB GPU, but this kit has not established a lower memory requirement.

## Measure before declaring a pass

The matrix preserves the PRD's release limits, rather than replacing them with
correlation alone. None of these limits is an achieved measurement:

- Selected rigid landmarks remain within **2% of the frame diagonal** of the guide.
- Moving architectural landmarks remain within **5% of the frame diagonal**.
- States occur in their authored order, without unexplained disappearance or
  replacement of major geometry. The three-state benchmarks use frames 0, 96, 192.
- Maximum event timing error is **two frames at 24 fps**, measured against the
  scheduled authored target. Retain every declared event, not just a mean or a maximum.
- Actual decoded videos contain 193 frames at 24 fps, with frame timestamps at
  `frame / 24`, encoded duration `193 / 24`, and the executed graph's dimensions.
- Human review passes geometry, legibility, and temporal continuity.

Additional proposed diagnostics require authored event error at most one frame
against the control track, unshifted generated-motion correlation at least 0.8,
and displacement between 0.6 and 1.4 times the authored span. These supplement the
PRD limits. Use fixed-camera projected landmarks initially, with coordinates
normalized by width and height; the checker converts distance to frame-diagonal
units. A moving camera needs camera-motion compensation or manual annotations.
Missing/untrackable geometry needs an explicit expected-occlusion entry, a failure,
or an unmeasurable result. Do not substitute zero or silently discard frames.

For the funny combined case, review the joke separately from timing: e.g. a room
squashes on the kick while a small prop bounces. The first architecture scope is
bounded rectangular deformation. Mesh bending or arbitrary topology changes need
their own scene and acoustic interpretation; they are not implied by scale routes.

## Preserve the sound alternatives

The stock layout graphs freeze audio conditioning and mux the CPU-processed source.
Their AKUSPACE prompt node does not load the AKUSPACE LoRA. The separate AKUSPACE
graph loads the learned adapter, applies audio mask 0.5, and decodes regenerated
audio. It may sound preferable while also changing the source music.

The pinned `AKUSPACEReferenceAudioAligned` implementation inserts reference tokens
with positions aligned from time zero. **Its `reference_guidance_scale: 0` still
injects the reference.** Zero disables the additional no-reference contrast pass;
it does not remove reference conditioning. The graph also initializes audio latents
from the source. These are static wiring facts, not a guarantee of source fidelity
or unchanged endings. Test the user's time-zero hypothesis against actual outputs.

Retain CPU-only and AKUSPACE-only comparisons. `hybrid_parallel` compares a
level-matched parallel combination. `serial_cpu_akuspace` explicitly tests feeding
the CPU-treated source into subtle AKUSPACE after the CPU demo works. The serial
candidate must initialize its audio latents from the archived CPU input, preserve
the original dry/control, CPU, AKUSPACE, and final stems, and identify whether the
aligned reference receives the original dry track or the CPU-treated track. Its
manifest binds the chosen bytes to the actual reference input, so those two
experiments cannot be silently conflated.

Review timbre, source changes, final phrases/decay, muffling, and degradation at
matched listening levels. Record lag, polarity, coloration, duplicated dry signal,
and preference. An AKUSPACE output cannot be assumed to be a wet-only effect stem.
An agent may flag a weak ending and suggest localized original/CPU crossfades.
Such a repair remains a separate, disclosed, phase/alignment-reviewed result with
the generated stem preserved; improvement and transparent reconstruction are not
promised. Training is not part of this experiment.

Changing geometry needs a real acoustic schedule with continuous convolution
history and preserved tails; the current static IR cannot qualify that claim.

Both hybrids and `stacked_loras` require a resolved candidate graph and actual
evidence. The kit does not manufacture those graphs or claim they work. Source
fidelity, preferred timbre, and geometric response are separate review outcomes.

## Record and validate evidence

Copy `evidence.template.json` to `evidence.json` in the generated directory. For
each completed run, retain `case_id`, `workflow`, and `control_audio`; set status
to `measured`, record the actual seed and reviewer, and add these fields:

```json
{
  "execution": {
    "kind": "local_gpu",
    "hardware": "actual GPU and VRAM",
    "wall_seconds": 123.4
  },
  "artifacts": {
    "workflow_json": {
      "path": "runs/example/workflow.json",
      "sha256": "actual hash"
    },
    "software_manifest": {
      "path": "runs/example/software.json",
      "sha256": "actual hash"
    },
    "execution_log": {
      "path": "runs/example/execution.txt",
      "sha256": "actual hash"
    }
  }
}
```

This is a shape example only; its values cannot pass validation. Add every artifact
named by the selected case, with relative paths inside the generated directory and
actual SHA-256 hashes. Keep provider handles, keys, and private logs out of public
release evidence. Use a sanitized execution log and retain private records separately.
The executed workflow must be resolved API JSON. Reference cases permit filled
placeholders but reject other graph changes; use a declared candidate case for an
experiment. Preserve the exact filename returned by input staging; it may differ
from the local diagnostic filename. Retain the real staging response and job log.

### Bind the graph to the captured bytes

Every case requires an `executed_inputs` JSON artifact with `version: 1`,
`workflow_sha256`, `source_control_sha256`, and a nonempty `bindings` object.
Each required binding contains exactly `graph_input` (e.g. `1.capture_file`),
`filename` (the actual resolved upload name), and `sha256` (the archived input).
For stock layout graphs the mandatory mappings are:

| Role            | Graph input      | Required bytes                                        |
| --------------- | ---------------- | ----------------------------------------------------- |
| `control_audio` | `40.audio`       | Selected immutable fixture WAV                        |
| `guide_rgb`     | `1.capture_file` | RGB capture from the matching take                    |
| `look`          | `8.image`        | Appearance image derived from that take's first frame |
| `guide_depth`   | `1.depth_file`   | Matching depth capture, when this input is nonempty   |

The AKUSPACE reference graph uses `40.audio` and `90.image`. Candidate experiments
must map their actual input paths, and the bound nodes must connect to saved outputs.
Serial candidates bind both `cpu_audio` and `reference_audio`; parallel mixes bind
both `cpu_audio` and `akuspace_audio`. Referencing an arbitrary unused loader fails.

Layout cases also archive `capture_receipt`, `first_frame`, and `captured_audio`.
The receipt is the existing native capture receipt with its audio companion. Its
recipe must equal `source_recipe` and the graph's resolved `recipe_json`; its hashes
must match the guide, first frame, depth when used, and captured WAV. The WAV must
match the immutable diagnostic PCM within one quantization step, allowing the
browser's WAV rounding. `control_curves` contains `envelope`, `bandEnvelopes`, and
`audioRoutes` identical to the captured recipe; envelopes have 193 finite samples.

The executed-input manifest's `capture` object contains the hashes of
`capture_receipt`, `source_recipe`, `control_curves`, `first_frame`, and `look`, plus
`control_audio` (the immutable source hash), `reviewer`, and
`alignment: "look derived from matching first frame"`. That alignment is a reviewed
assertion, not automatic image analysis. A swapped track requires new guide,
control-curve, and receipt hashes, paired against the original run at the same seed.

This binding detects inconsistent or stale supplied files. A self-reported manifest
does not authenticate a provider's execution or prove that its observations are
true; preserve the actual returned workflow, upload receipts, and execution logs.

The software manifest has `versions` with the actual code/node revisions and
runtime versions, plus `models` mapping every required model filename to its actual
SHA-256 digest. A model execution must include these hashes. CPU-only candidate
workflows still need their implementation versions.

### Supply measurements, distributions, and decoded metadata

The measurement JSON contains `method`, `reviewer`, `media_sha256` (the reviewed
video or processed audio), and the same `metrics` object as its evidence record.
Its `input_sha256` maps `control_audio` and every present `guide_rgb`, `control_curves`,
`look`, `capture_receipt`, `reference_audio`, `cpu_audio`, and `akuspace_audio` to the
matching hashes. Thus a fresh output alone cannot relabel old guide measurements.

Layout measurements also contain `annotations`:

- `method`: tracking/annotation method and camera-compensation explanation.
- `landmarks`: uniquely named rigid/wall tracks, each with 193 `expected_xy` and
  `observed_xy` samples normalized by width/height. Every null observation needs
  one `occlusions` entry with its `frame`, `expected: true`, and reviewed `reason`.
- `events`: unique `id`, scheduled `expected_frame`, `source_frame` from the guide,
  and `generated_frame` from the result. Cover each case's `expected_event_frames`
  exactly once: low bursts for object/wall, high bursts for lighting, all declared
  bursts for combined/swap, and state keys for the state-only benchmark. A missing
  or ambiguous required observation fails; selecting only a favorable event fails.
- `motion_series`: a described scalar trajectory (`definition`) with 193 `expected`
  and `observed` samples. Correlation is computed without a time shift; displacement
  is the ratio of observed to authored range.
- `states`, when the case defines state keys: `expected_id`/`observed_id` labels
  `state-0`, etc., plus `expected_frame`/`observed_frame`. Every benchmark state must
  appear in order and within two frames; other future matrices may define other counts.

The checker derives landmark maxima, timing maxima, correlation, displacement,
and state count from those distributions and compares them with declared metrics.
It cannot independently establish whether an annotation is accurate. The complete
positive unit fixtures deliberately use mock media and mock observations; they are
test data only and are never saved as real qualification evidence.

`media_probe` records a decoding `method` and an object for `generated_video` and
`guide_rgb` when applicable. Each object contains its actual `sha256`, `width`,
`height`, `frames`, `fps`, `duration_seconds`, and all 193 `frame_pts_seconds` values.
Capture a real decoder's output (e.g. ffprobe); do not copy template values. Source
duration and frame cadence tolerance is one millisecond for container timestamp
quantization. Generated-output duration may differ by at most one frame, retaining
the PRD bound. Its `soundtrack` includes `start_seconds`, `duration_seconds`,
`unexplained_offset: false`, and a nonempty `offset_review`; start offset and
duration difference must remain within one frame. A tail-extended export needs a
separately recorded duration/tail policy and is outside this frozen-output check.

The optional serial experiment also needs `audio_review.comparisons` for
`original_vs_cpu` and `cpu_vs_akuspace`, each with `method`, `notes`, and finite
`level_match_gain_db`. Include `ending` with a listening window and observations,
and `alignment` with method, measured `lag_samples`, and `polarity_checked: true`.
Its `repair_manifest` binds `source_control_sha256`, `cpu_audio_sha256`,
`akuspace_audio_sha256`, and `processed_audio_sha256`. Declare `mode: "none"` and
empty `regions`, or `mode: "localized_crossfade"`, `alignment_review_pass: true`,
and regions with `start_seconds`, `end_seconds`, and `source` (`original_dry` or
`cpu_treatment`). The actual candidate graph and preserved stems remain reviewable.

```sh
python3 workflows/qualification/evidence.py \
  --fixture /tmp/genobi-av-qualification-01 \
  --evidence /tmp/genobi-av-qualification-01/evidence.json --case object_motion

python3 workflows/qualification/evidence.py \
  --fixture /tmp/genobi-av-qualification-01 \
  --evidence /tmp/genobi-av-qualification-01/evidence.json --phase release
```

Use `--dynamic-sound` for a release that claims moving room sound. Use `--case`
to check an individual exploratory sound or lighting experiment. A single case
pass is not a full release pass. The pending template intentionally exits with an
error. Failing a measurement must lead to narrower claims or more workflow work,
not a silently relaxed threshold.

## References

- [LTX Layout to Render](https://docs.ltx.io/open-source-model/vfx-post-production/layout-to-render)
- [LTX Audio to Video](https://docs.ltx.io/open-source-model/usage-guides/audio-to-video)
- [Genobi deployment and billing boundaries](../../docs/comfy-deploy.md)
- [Recorded prior workflow results and limitations](../../docs/adaptive-reverb-proof.md)
- [Pinned aligned reference implementation](https://github.com/koshimazaki/ComfyUI-Koshi-Nodes/blob/6f3351e7854d3dc2a17deea977937b3427fcaadd/nodes/audio/aligned_ref.py)
