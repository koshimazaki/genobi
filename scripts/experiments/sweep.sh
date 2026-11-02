#!/usr/bin/env bash
# Capture one study at motion-gain 0.5, 1.0 and 2.0 into <out>-g05, <out>-g10
# and <out>-g20, to find the sweet spot of change before swapping images.
# Usage: scripts/experiments/sweep.sh --output DIR --studies ID [capture flags]
# Every other flag passes through to capture.mjs; --motion-gain is owned here.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out=""
pass=()
while (($#)); do
  case "$1" in
    --output) out="${2:?--output needs a value}"; shift 2 ;;
    --output=*) out="${1#--output=}"; shift ;;
    --motion-gain | --motion-gain=*)
      echo "sweep.sh sets --motion-gain itself; drop it." >&2; exit 2 ;;
    *) pass+=("$1"); shift ;;
  esac
done
if [[ -z "$out" ]]; then
  echo "Usage: sweep.sh --output DIR --studies ID [capture flags]" >&2
  exit 2
fi
out="${out%/}"
for pair in "05 0.5" "10 1" "20 2"; do
  set -- $pair
  echo "== motion-gain $2 -> ${out}-g$1"
  node "$here/capture.mjs" --output "${out}-g$1" --motion-gain "$2" \
    ${pass[@]+"${pass[@]}"}
done
