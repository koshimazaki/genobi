---
tags: [workflows, comfy, models]
summary: Prepare a pinned local ComfyUI worker on Vast, connect by SSH and check it before running LTX experiments.
---

# Vast runner for the LTX experiments

This route runs ComfyUI directly on a rented GPU. It uses the existing source
pins and six BF16 Layout-to-Render model files from `comfy-build/`. The helper
commands below prepare and inspect a worker; **none queues a generation**.
The animated-scene experiment is separate from the stock static-acoustics
deployment graph. Keep the original music and dynamic CPU reverb as explicit
soundtrack choices.

## Choose the worker after preparing the inputs

Prefer a **96 GB RTX PRO 6000** for the first BF16 session: it matches the
hardware in [the recorded LTX scene examples](https://github.com/koshimazaki/genobi/blob/release/v0.14/examples/ltx-world/README.md).
An 80 GB card is another candidate, but this experiment has not established its
fit or speed. LTX's [system requirements](https://docs.ltx.io/open-source-model/getting-started/system-requirements)
recommend 80 GB class hardware, 64 GB or more host RAM and 200 GB SSD space.
Use a CUDA-enabled PyTorch image with Python 3.12+, Git, FFmpeg and FFprobe.
Check `nvidia-smi` and `torch.cuda.is_available()` inside that image first.

The exact six-file BF16 model plan is about **72.4 GB** before Python packages,
source, working files and outputs. Allocate at least 150 GB of usable storage;
200 GB gives more room for installation and retained results. The six-file plan
omits the duplicate int8 transformer/encoder and the optional AKUSPACE LoRA.
It uses the repository's exact SHA-256 values and immutable Hugging Face revisions.
Accept the model repositories' terms with the account used for downloads.

The [official lower-memory profile](https://docs.ltx.io/open-source-model/reference/workflow-asset-compatibility)
requires a matched int8 transformer, int8 encoder and convolutional VAE. This
helper deliberately prepares only the currently pinned BF16 layout profile.
Do not substitute one of the existing int8 files without also preparing and
qualifying its matching VAE and graph.

## Connect with SSH

Use the instance's **direct SSH** command when available; Vast also provides a
proxy SSH address. See [Vast's SSH guide](https://docs.vast.ai/guides/instances/connect/ssh).
Add the operator's dedicated public key through Vast's account or instance key
interface. Keep the private key on the client that will run commands. An agent
in a separate execution environment needs its own authorized key and network
route; signing in on a Mac does not give that environment SSH access.

Send the operator the SSH hostname, username and port. Verify the host-key
fingerprint from the instance before accepting it. Keep ComfyUI on loopback and
forward it through SSH:

```sh
ssh -N -p PORT -L 8188:127.0.0.1:8188 USER@HOST
```

Open `http://127.0.0.1:8188` on that SSH client. The same tunnel exposes the API
to the experiment runner. A hosted Genobi page is not automatically connected
to the machine by this tunnel; use the local studio or run the prepared graph
through the worker API, then import the result into Genobi.

Tailscale is optional. It works only when **the machine executing the agent's
commands and the GPU worker** both have an authorized route on the same tailnet.
Installing it on the Mac and GPU alone does not connect a separate agent sandbox.
Use ordinary SSH over an authorized Tailscale IP if that route is available;
there is no need to expose ComfyUI publicly. The setup scripts neither install
Tailscale nor join a tailnet.

## Prepare a fresh worker folder

On the GPU machine, check out the exact tested Genobi experiment commit, then
run these commands from its repository root. Choose a new work directory on
the instance's persistent disk; the helper refuses to replace an existing
Comfy installation.

```sh
python3 scripts/vast/assets.py plan
python3 scripts/vast/bootstrap.py --workspace /workspace/genobi-ltx --prepare --install-python
```

The bootstrap reads `comfy-build/sources.lock`, fetches its pinned ComfyUI and
LTX/Koshi node pack sources, and copies World Builder from this checkout. It
creates a virtual environment that inherits the image's CUDA PyTorch, constrains
Torch/torchvision/torchaudio to those installed versions and installs requirements
from the pinned sources. It records the Genobi commit, source-lock digest and
installed package versions and a digest of the installed source bytes. The source
pins, preparation scripts and local node pack must be committed before preparation.
Source and model pins do not by themselves make
every Python dependency reproducible; retain `runtime-freeze.txt` with the run.
Dependency conflicts stop setup instead of changing the CUDA stack silently.

If FFmpeg/FFprobe or the Python `venv` module is missing, install them through
the image's package manager before setup. OS package installation is deliberately
not hidden in the bootstrap command. A source-only preparation can omit
`--install-python`.

To retry a Python dependency installation without replacing the prepared
sources, use `bootstrap.py --workspace /workspace/genobi-ltx --install-only`.
This checks the saved source-lock identity, Genobi commit and installed source
bytes before installing again. Model/input/output storage and Python caches are
excluded from the source digest. Changed code requires a fresh prepared folder.

### Download the selected models explicitly

Use a read-only Hugging Face token accepted for both LTX model repositories.
Enter it interactively on the worker; the scripts never print or save it:

```sh
read -rsp 'Hugging Face read token: ' HF_TOKEN
export HF_TOKEN
python3 scripts/vast/assets.py download --models-dir /workspace/genobi-ltx/ComfyUI/models --confirm-download
unset HF_TOKEN
```

Downloads resume `.part` files and verify size and SHA-256 before installing
each model. Existing files are rehashed, even when a checksum sidecar exists.
Keep the download session in `tmux`. A failed transfer can be resumed with the
same explicit command. Gated access or a hash mismatch must be fixed before
generation; these are not reasons to select an unrelated model silently.

### Start ComfyUI and check the exact graph

Start it inside `tmux` using the prepared Python environment:

```sh
cd /workspace/genobi-ltx/ComfyUI
../venv/bin/python main.py --listen 127.0.0.1 --port 8188
```

In another terminal, return to the Genobi repository and run the preflight with
the same Python environment. Supply the experiment's materialized API graph:

```sh
/workspace/genobi-ltx/venv/bin/python scripts/vast/preflight.py --comfy-dir /workspace/genobi-ltx/ComfyUI --url http://127.0.0.1:8188 --hash-models --workflow /workspace/run/layout.api.json
```

The report checks NVIDIA hardware, CUDA PyTorch, host RAM, free working space,
FFmpeg/FFprobe, model bytes, live node classes, required inputs, graph links and
declared dropdown choices. Unfilled workflow placeholders fail the check.
It reads only `/object_info` and `/system_stats`. It never calls `/prompt`.
A green report proves those prerequisites, not that the graph fits in VRAM,
executes correctly or preserves the music's timing. Start with a short pilot.
`assets.py verify --models-dir ...` is also available without a running ComfyUI.

## Budget and retained evidence

Vast charges for the instance while it runs, including setup, downloads, idle
time and failed experiments. Record the actual rental price, storage price and
any transfer charges before starting. Ten dollars gives five compute hours
only at $2/hour with no other charges; it is not a duration guarantee.
Reserve part of the budget for troubleshooting, copying outputs and shutdown.
Run one GPU job at a time. Stop after the first pilot if motion, memory or audio
alignment fails; keep the failed output and change one variable for the next run.

Before each run retain the exact API graph, input hashes, source recipe, frame
count/fps, seed, source/model versions and control-audio offset. Afterward retain
the original output, final mux, wall time, peak VRAM and the comparison notes.
An uncertain `/prompt` response must be reconciled by its recorded job identity;
do not automatically submit a new generation to see whether the first one ran.

Copy the experiment folder and outputs off the instance before stopping or
destroying it. Confirm the instance is actually stopped in Vast. Stopped-instance
storage may still be billed; destroying an instance can delete its local files.
The scripts do not stop or destroy a rental on the operator's behalf.

## Offline verification

```sh
python3 -B -m unittest discover -s scripts/vast -p 'test_*.py' -v
python3 scripts/vast/assets.py plan
```

The tests check immutable model selection, same-size corruption detection,
resume space accounting, existing-directory protection, loopback-only API
origins and live model-choice validation. No remote machine or GPU execution is
implied by these tests.
