# Vast GPU worker — Genobi

Reusable, isolated worker tools for external NVIDIA GPUs (Vast.ai or another
machine with CUDA). Run these commands from the root of a **public Genobi
checkout**. Private model files, credentials, recordings, output and run
receipts stay on the worker, outside Git.

## Reuse a running machine first

```sh
sh scripts/vast/inspect-existing.sh
python3 scripts/vast/assets.py verify --models-dir /workspace/ComfyUI/models
```

The inspection is read-only and checks the previous ComfyUI folders, GPU,
model names and local ports. The October Vast image used ComfyUI on loopback
port **18188** behind Caddy at 8188; a new clean install uses 8188. A missing
model is not a reason to overwrite an existing ComfyUI installation. The
model verifier hashes actual files, not just checksum sidecars.

## Create an isolated worker on an empty volume

Requires Python **3.12+**, a CUDA-enabled PyTorch installation, Git, FFmpeg
and FFprobe. Plan storage before renting a GPU; the pinned six-model BF16
layout profile is approximately **72.4 GB**, with substantial additional
disk space needed for sources, output and temporary files.

```sh
python3 scripts/vast/assets.py plan
python3 scripts/vast/bootstrap.py --workspace /workspace/genobi-ltx --prepare --install-python
```

The bootstrap refuses non-empty workspaces and preserves the image's
installed CUDA Torch. It pins ComfyUI / custom node sources using the
repository's `comfy-build/sources.lock`, records a source digest and commit,
and does not download model weights. After confirming Hugging Face access,
download the selected model profile explicitly:

```sh
read -rsp 'Hugging Face read token: ' HF_TOKEN
export HF_TOKEN
python3 scripts/vast/assets.py download --models-dir /workspace/genobi-ltx/ComfyUI/models --confirm-download
unset HF_TOKEN
```

Always check that the appropriate models are already installed before
downloading. Do not commit access tokens or model weights.

## Run and inspect the local ComfyUI API

Start ComfyUI on the worker (use `tmux` for persistence):

```sh
cd /workspace/genobi-ltx/ComfyUI
../venv/bin/python main.py --listen 127.0.0.1 --port 8188
```

From the **Genobi repository root**, validate a materialized API-format
workflow without submitting a generation:

```sh
/workspace/genobi-ltx/venv/bin/python scripts/vast/preflight.py \
  --comfy-dir /workspace/genobi-ltx/ComfyUI \
  --url http://127.0.0.1:8188 --hash-models \
  --workflow /workspace/run/layout.api.json
```

Connect from a trusted client by an authenticated SSH tunnel, e.g.
`ssh -N -p PORT -L 8188:127.0.0.1:8188 USER@HOST`.
Do not expose the ComfyUI API to the public internet. Tailscale is optional
when both the executing client and GPU host are on the authorized tailnet.

The workflow path above is an **example input**. Preparing actual LTX
candidates and submitting jobs belongs to the separate experimental
workflow, not this setup PR. Preflight reads live node schemas but never
sends `POST /prompt`; a passing preflight does not prove GPU VRAM fit,
quality or music alignment. Stop the paid rental explicitly after copying
the results; these scripts cannot cap billing or shut down a Vast instance.

## Offline verification

```sh
python3 -B -m unittest discover -s scripts/vast -p 'test_*.py' -v
python3 scripts/vast/assets.py plan
```

The historical 30 October RTX PRO 6000 session is documented in
[legacy-2026-10-30/](legacy-2026-10-30/README.md). Historical setup and
upload scripts are intentionally non-executable references; do **not** run
them against an existing installation.
