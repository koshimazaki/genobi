#!/usr/bin/env bash
# Build every second-pass bundle from captured guides and their look stills.
# Usage: make-bundles.sh GUIDES LOOKS BUNDLES [FRAMES]
#   GUIDES/<study>/{recipe.json,rgb.webm,depth.webm,control.wav,capture.json,keyframes.json}
#   LOOKS/<study>/{look-first.png,look-closed-NNNN.png}   (from look.py batch, or hand-made)
# One bundle per study in layout-audio, plus union-depth for the two wall studies.
# Prompts describe the finished shot in one or two sentences and never name the guide.
set -euo pipefail
GUIDES="${1:?guides dir}"; LOOKS="${2:?looks dir}"; BUNDLES="${3:?bundles dir}"; FRAMES="${4:-193}"
SRC="${SRC:-$(cd "$(dirname "$0")/../../.." && pwd)}"
PY="${PY:-python3}"
declare -A PROMPT=(
  [diamond]="A single faceted diamond hovers above a flat lit floor and breathes with the music, swelling on every bass hit and settling between them while the camera circles it once. Clean background, one light source, crisp edges."
  [pulse]="A lone pyramid on open ground swells and settles with the music while the camera circles it once. Clean sky, long shadows, still air."
  [cathedral-walls]="Inside a tall nave the rows of columns slide inward on every bass hit and ease back apart, the vault narrowing with them, seen from a high gallery that does not move. Soft daylight, stone and dust."
  [canyon]="Two rows of tall towers seen from above close in across the street on every bass hit and drift apart again, the camera fixed high over the avenue. Evening light, long shadows."
  [room-walls]="A small apartment whose walls press inward on the beat and open again around a figure dancing in the middle, seen from eye height. Warm lamp light, soft shadows."
  [pyramid-inside]="Inside a hollow stepped pyramid the terraced walls contract on every bass hit and expand back, a figure standing on the floor for scale, the camera low and slowly turning upward. Dim warm light from above."
  [fruit-dance]="A figure dances in an open studio while a large fruit circles close around them, changing from apple to banana and back on the beat. Clean floor, soft studio light."
)
mk() { # study mode [extra prepare args]
  local study="$1" mode="$2"; shift 2
  local g="$GUIDES/$study" l="$LOOKS/$study" out="$BUNDLES/$study-$mode"
  [ -f "$g/rgb.webm" ] || { echo "skip $study: no guide"; return; }
  [ -f "$l/look-first.png" ] || { echo "skip $study: no look-first.png in $l"; return; }
  local key=(); local closed; closed=$(ls "$l"/look-closed-*.png 2>/dev/null | head -1 || true)
  if [ -n "$closed" ]; then local idx; idx=$(basename "$closed" .png | sed 's/.*-//'); key=(--keyframe "$closed@$((10#$idx))"); fi
  "$PY" "$SRC/workflows/experiments/prepare.py" --recipe "$g/recipe.json" --rgb "$g/rgb.webm" --depth "$g/depth.webm" \
    --audio "$g/control.wav" --capture-receipt "$g/capture.json" --look "$l/look-first.png" "${key[@]}" \
    --mode "$mode" --frames "$FRAMES" --seed 42 --output "$out" --label "$study-$mode" --prompt "${PROMPT[$study]}" "$@"
  echo "bundle $out"
}
for s in diamond pulse cathedral-walls canyon room-walls pyramid-inside fruit-dance; do mk "$s" layout-audio; done
for s in cathedral-walls canyon; do mk "$s" union-depth; done
