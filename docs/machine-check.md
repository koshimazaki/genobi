---
tags: [agents, models, backend, mcp]
summary: The machine check — a local probe of memory, disk and Apple silicon or NVIDIA GPU, a pure plan of which models run locally and which on Comfy Cloud with each documented requirement, the genobi_machine tool and the genobi-machine skill.
---

# Machine check

Genobi runs open models on the person's machine when they fit and on Comfy
Cloud when they do not ([Comfy Cloud inventory](comfy-cloud-inventory.md),
ledger 360–362). The machine check reads the machine and says, per
capability, which: listening, vision, FLUX 3 Image Klein, LTX-2.5 and the
upscaler, with voice mode's transcription as a row of its own. For listening it picks the largest model that fits (issue #12). It
is the "Machine check skill" box of issue #14 and the "Hardware check" box of
issue #12.

It is a plan, not a run. Nothing is downloaded, installed or paid for, and no
setting changes.

## The probe

`server/machine.ts`, on the local server only. The hosted Worker has no
machine to read and no route.

| Reads                                 | How                                                                   |
| ------------------------------------- | --------------------------------------------------------------------- |
| Total memory, CPU cores, architecture | Node's `os`                                                           |
| Memory free now                       | macOS: `vm_stat` (free, inactive and speculative pages); Linux: `os`  |
| Apple silicon chip and unified memory | macOS: `sysctl hw.memsize machdep.cpu.brand_string`                   |
| NVIDIA GPUs, VRAM and driver          | `nvidia-smi --query-gpu=name,memory.total,memory.free,driver_version` |
| Free disk on the studio's data volume | `statfs` on `.local` (or its parent before it exists)                 |

Each command is a fixed executable with fixed arguments, run with `execFile`
(no shell), a five-second timeout and nothing from a request. macOS commands
use absolute paths (`/usr/sbin/sysctl`, `/usr/bin/vm_stat`). `nvidia-smi` is
not asked for serial numbers, UUIDs or bus ids; when it is not installed the
probe says "no NVIDIA GPU", and when it fails or times out the probe lists it
under `unread`, without its error text. The answer carries sizes, the chip or
GPU model name and the CPU architecture only: no hostname, user name, serial
number or path. It is cached for a minute and one probe runs at a time.

`GET /api/machine` answers `{ probe, plan }`, with `Cache-Control:
no-store`, in the same rate bucket as the history and audio status routes.
`readMachineProbe` (`shared/machine.ts`) rebuilds the probe field by field
before it leaves the server, so the route can only answer the documented
fields, each of the right type, size and form (a chip name such as
`Apple M1 Max`, a GPU name of letters, digits and a little punctuation).

## The plan

`planMachine` (`shared/machine-plan.ts`) is pure and portable: the same probe
always gives the same plan, and the Worker boundary compiles it. Each
capability lists its local candidates largest first (`shared/machine-models.ts`)
and runs locally on the first that fits; otherwise on its Comfy Cloud model.
Every capability says where (`local`, `cloud`, or `hosted`), which model, why,
each candidate's reason, the Cloud fallback, and a note.

A candidate fits when all of these hold:

1. **Its memory figure is documented.** A model whose maker documents none
   is never planned locally. Where the source gives a practical factor
   (Qwen2.5-Omni: "at least 1.2 times higher"), the plan counts it.
2. **The figure covers this accelerator.** NVIDIA: the largest GPU's VRAM.
   Apple silicon: 75% of unified memory, Genobi's own margin for macOS, the
   studio and the browser. No GPU and no Apple silicon: nothing runs locally.
3. **The download fits** in the free disk less a 10 GB reserve. Models
   already downloaded are not detected yet, so each counts as a full download.

The two margins (`UNIFIED_SHARE`, `DISK_RESERVE_GB`) are policy, not model
figures, and the plan's `caveats` say so. No maker documents a Mac, so a Mac
fit is on paper until it is run (#12: "not yet run on a Mac").

### Requirements and their sources

Checked 22 October 2026. GB is 10⁹ bytes, as the makers write it.

| Capability | Model                            | Memory counted                       | Download | Source                                                                                                                                                                                                      |
| ---------- | -------------------------------- | ------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listening  | Qwen3-Omni-30B-A3B-Captioner     | none documented                      | 63.44 GB | [model card](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Captioner)                                                                                                                                      |
| Listening  | Qwen3-Omni-30B-A3B-Instruct      | 78.85 GB (BF16, 15 s video, minimum) | 70.52 GB | [model card, "Minimum GPU memory requirements"](https://huggingface.co/Qwen/Qwen3-Omni-30B-A3B-Instruct)                                                                                                    |
| Listening  | Voxtral Small 24B                | ~55 GB (bf16 or fp16)                | 48.52 GB | [model card](https://huggingface.co/mistralai/Voxtral-Small-24B-2507)                                                                                                                                       |
| Listening  | Qwen2.5-Omni-7B                  | 31.11 GB × 1.2 = 37.33 GB            | 22.36 GB | [model card](https://huggingface.co/Qwen/Qwen2.5-Omni-7B)                                                                                                                                                   |
| Listening  | Voxtral Mini 3B                  | ~9.5 GB (bf16 or fp16)               | 9.35 GB  | [model card](https://huggingface.co/mistralai/Voxtral-Mini-3B-2507)                                                                                                                                         |
| Vision     | Qwen3-VL-8B-Instruct             | none documented                      | 17.53 GB | [model card](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct); the [README's table](https://github.com/QwenLM/Qwen3-VL) is commented out and covers Qwen2.5-VL                                             |
| Klein      | FLUX 3 Image Klein, ComfyUI int8 | 8 GB, NVIDIA only                    | 17.75 GB | [BFL: "int8 files run on 8 GB GPUs such as the RTX 3070"](https://github.com/black-forest-labs/flux-3-image-klein#memory); [Comfy files](https://huggingface.co/black-forest-labs/flux-3-image-klein-comfy) |
| LTX        | LTX-2.5 22B distilled            | none documented                      | ~66 GiB  | [LTX-2 README](https://github.com/Lightricks/LTX-2); its optimisation guide gives "no absolute timings or VRAM figures"                                                                                     |
| Upscaler   | SeedVR2 3B FP8                   | 16 GB (top of the 12–16 GB FP8 tier) | 3.89 GB  | [ComfyUI-SeedVR2 requirements](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler#-requirements), which also documents Apple silicon (MPS)                                                               |

Downloads are the weight files of one format from each Hugging Face file
listing: the safetensors shards, Voxtral's `consolidated.safetensors` (the
format its vLLM command loads), the four files Genobi's Klein graph loads
(int8 diffusion model, Qwen3-VL 4B int8 encoder, w4a8 prompt upsampler,
VAE), and SeedVR2's FP8 model and VAE.

Not counted: quantised builds, whose makers document no figure (issue #12's
"about 17–20 GB at 4-bit" for the Captioner is an estimate, not a source), and
Gemma 3n, whose licence is gated. The Qwen3-Omni table measures the Thinking
model (the thinker alone, as in the Captioner) at 68.74 GB, but not the
Captioner itself; adopting that row for the Captioner is a decision for the
owner, one line in `shared/machine-models.ts`.

### Transcription, apart from listening

Transcription is voice mode's speech to text ([voice mode](voice-mode.md),
#50): Qwen3-ASR-0.6B, which writes down speech. Listening describes music and
sound. The transcription row (`TRANSCRIPTION_MODEL`) is always `local`, as
`Qwen3-ASR-0.6B (Metal)` on Apple silicon and `(CPU)` elsewhere, the devices
the voice worker uses (fp16 on Metal, fp32 on the CPU). It has no Cloud
fallback (`fallback: null`), because the hosted studio has no voice route.

Qwen3-ASR's [model card](https://huggingface.co/Qwen/Qwen3-ASR-0.6B) and
README give no memory figure, so the plan does not check memory for it. The
evidence it runs is Genobi's own: Qwen3-ASR-0.6B on Metal on an M1 Max (32
GB), 21 October 2026, in voice mode's verification. Only the download is
checked: 1.88 GB (1,880,560,703 bytes, the pinned snapshot in
`server/voice-model.ts`). A disk too full for it is a note ("unless voice
mode is installed already"), not a move to Cloud.

### When nothing fits

| Capability | Comfy Cloud ([inventory](comfy-cloud-inventory.md)) |
| ---------- | --------------------------------------------------- |
| Listening  | Gemma 4 through core `TextGenerate` (audio in)      |
| Vision     | Qwen3-VL through core `TextGenerate`                |
| Klein      | FLUX 3 Image Klein distilled int8                   |
| LTX        | LTX-2.5 22B distilled int8                          |
| Upscaler   | SeedVR2 3B int8 (native nodes)                      |

Listening also names its hosted options (Gemini, hosted Qwen Omni Flash; API
only, an optional premium); the plan never chooses them.

### What a local row means today

- **Listening and vision:** Genobi has no local listening or vision worker
  yet. A local row names the model to install when one lands.
- **Klein, LTX and the upscaler:** these run on the `workflow` route, which
  submits to Comfy Cloud only until the local ComfyUI client and global run
  location land (PR #61). The plan's `where` uses that run location's words
  (`local`, `cloud`), so the run location can take the plan as its default
  without a translation.

## For agents

`genobi_machine` (`mcp/machine-tools.ts`) reads `/api/machine`, checks the
probe with `readMachineProbe`, plans it again with the same `planMachine`, and
returns `machine` (one line), `summary` (one line per capability), `plan` and
`probe`. It is read-only and free, and it is in the session tools
(`GENOBI_TOOLS`), so a project-prompt session may call it. An existing Hermes
`genobi` profile gets it on its next session: the profile's marker carries
the tool allowlists, so a changed list applies the profile again
([agent sessions](agent-sessions.md)).

The [`genobi-machine` skill](https://github.com/koshimazaki/Genobi/blob/main/plugins/genobi/skills/genobi-machine/SKILL.md)
teaches the agent to run the check and explain it: a table per capability,
the notes, the reasons a model stays on Cloud, and figures only from the
plan's sources.

**Where the result is kept.** Issue #14 asks for the result in the agent
profile. Agent profiles ("Open Source Local" or "your subscription", #14) do
not exist yet; Hermes' `genobi` profile is a Hermes home, not that profile,
and its marker records only what Genobi set there. So the tool returns the
plan, and the skill says it is saved in the agent profile once profiles land,
so a later session reads it instead of probing again.

## Evidence

- `tests/machine-plan.test.ts`: the transcription row (Metal or CPU, no
  fallback, a full disk as a note, the download voice mode pins); a 16 GB M-series Mac, a 128 GB M-series Mac,
  a 32 GB RTX 5090 box, 8 GB with no GPU, a nearly full disk, an unreadable
  disk, undocumented models on a very large machine, the largest of two
  GPUs, purity and the run location's words; every requirement cites a
  source; the probe validator drops unknown fields and refuses wrong forms.
- `tests/machine-probe.test.ts`: canned `sysctl`, `vm_stat` and `nvidia-smi`
  output, the exact fixed commands and timeout, failed and missing reads, the
  cache, the real machine's probe holding no hostname, user name or path,
  `GET /api/machine`, and `genobi_machine` over MCP.
- Run on an M1 Max (32 GB) on 22 October 2026: transcription on Qwen3-ASR-0.6B
  (Metal), listening on Voxtral Mini 3B and the upscaler on SeedVR2 3B
  locally; vision, Klein and LTX on Comfy Cloud.
- `tests/agent-hermes-profile-marker.test.ts`: a Hermes `genobi` profile
  written with an older tool list, or before the marker named the tools, is
  applied again with `genobi_machine`; an unchanged profile stays
  byte-identical.
