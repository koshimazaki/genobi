#!/usr/bin/env bash
# Genobi LTX worker setup on a fresh Vast box. Run as root over SSH, inside tmux.
# Facts from 2 Nov 2026: the image venv (/venv/main, torch 2.10 cu130) is the
# interpreter; git-lfs cannot smudge the LTX node pack's example PNGs, so the
# clone runs with GIT_LFS_SKIP_SMUDGE=1; ComfyUI stays on loopback (Caddy
# already listens publicly on 8188, so the server takes 8189).
set -euo pipefail
REF="${GENOBI_REF:?set GENOBI_REF to the commit to run (branch head SHA)}"
REPO_URL="${GENOBI_REPO:-https://github.com/koshimazaki/genobi}"
PY="${GENOBI_PY:-/venv/main/bin/python}"
[ -x "$PY" ] || PY=python3
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
"$PY" -V; ffmpeg -version | head -1
"$PY" -c 'import torch;print("torch",torch.__version__,"cuda",torch.cuda.is_available())'
df -h /workspace | tail -1
apt-get update -qq && apt-get install -y -qq tmux git-lfs python3-venv >/dev/null
mkdir -p /workspace/run/bundles /workspace/run/outputs /workspace/run/guides && cd /workspace
[ -d genobi-src ] || GIT_LFS_SKIP_SMUDGE=1 git clone -q "$REPO_URL" genobi-src
cd genobi-src && git fetch -q origin && git checkout -q "$REF" && git log --oneline -1
"$PY" scripts/vast/assets.py plan | head -8
GIT_LFS_SKIP_SMUDGE=1 "$PY" scripts/vast/bootstrap.py --workspace /workspace/genobi-ltx --prepare --install-python
cp scripts/vast/box/run-queue.sh scripts/vast/box/after-download.sh /workspace/run/ && chmod +x /workspace/run/*.sh
cat <<'NEXT'
BOOTSTRAP DONE. Next, in this shell (the token is never written to disk):
  read -rsp 'HF token: ' HF_TOKEN; export HF_TOKEN
  python3 scripts/vast/assets.py download --profile second-pass --models-dir /workspace/genobi-ltx/ComfyUI/models --confirm-download; unset HF_TOKEN
  (Refine-Details is gated: accept its terms on huggingface.co with the same account first.)
Then:
  tmux new -d -s comfy 'cd /workspace/genobi-ltx/ComfyUI && ../venv/bin/python main.py --listen 127.0.0.1 --port 8189'
  EXPECT=8 /workspace/run/after-download.sh <bundle names...>
NEXT
