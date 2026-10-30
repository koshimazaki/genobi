#!/bin/sh
# Prepare a ComfyUI folder and its comfy-build.yaml for the Comfy Developer
# Platform from the pins in this folder (sources.lock, models/*.txt).
#   prepare-comfy-build.sh <work dir> <set>...      e.g.  ./work swap
# Downloads source code only. Hash-pinned public weights are referenced by URL
# in the spec and fetched by Comfy's builder; gated (size-only) weights must be
# on disk before `comfy build push`, which this script prints the command for.
# It never signs in or calls comfy-cli. See docs/comfy-deployment.md.
set -eu

if [ "$#" -lt 2 ]; then
  echo "usage: prepare-comfy-build.sh <work dir> <set>..." >&2
  exit 2
fi
work="$1"
shift
here="$(cd "$(dirname "$0")/.." && pwd)"
for set in "$@"; do
  [ -f "$here/models/$set.txt" ] || { echo "no model set $set" >&2; exit 2; }
done
name="genobi-$(echo "$*" | tr ' ' '-')"

mkdir -p "$work"
sh "$here/scripts/install-sources.sh" "$here/sources.lock" "$work" "$@"
mkdir -p "$work/ComfyUI/models"
python3 "$here/scripts/comfy_build_spec.py" --name "$name" --sets "$@" > "$work/ComfyUI/comfy-build.yaml"
echo "wrote $work/ComfyUI/comfy-build.yaml"

gated=""
for set in "$@"; do
  if grep -v '^[[:space:]]*#' "$here/models/$set.txt" | grep -q ' -$'; then
    gated="$gated $here/models/$set.txt"
  fi
done

cat <<EOF

Next, on a machine with comfy-cli (pip install comfy-cli; nothing here is paid
until a deployment runs):

  comfy setup --where cloud
  cd "$work/ComfyUI"
  comfy build validate .
EOF
if [ -n "$gated" ]; then
  cat <<EOF

  # Gated files are uploaded from this folder. Accept their licences with the
  # token's Hugging Face account, then fetch only those (size-checked):
  HF_TOKEN=... python3 "$here/scripts/models.py" --gated-only ./models$gated
EOF
fi
cat <<EOF

  comfy build refs resolve <filename>   # each hand-pinned model URL, once
  comfy build validate --remote .
  comfy build push --dry-run --models-dir ./models --custom-nodes-dir ./custom_nodes
  comfy build push --release --target linux/nvidia --models-dir ./models --custom-nodes-dir ./custom_nodes
  comfy build status
  comfy deploy refs compute
  comfy deploy up . --gpu <RTX PRO 6000 id from refs compute> --region <region from refs compute> \\
    --min 0 --max 1 --create --name $name
EOF
