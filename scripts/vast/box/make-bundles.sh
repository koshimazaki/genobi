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
  [cathedral-walls]="Inside a tall nave with pointed arches and a ribbed vault, the rows of clustered columns slide inward on every bass hit and ease back apart, the vault narrowing with them toward a tall arched window at the far end, seen from a high gallery that does not move. Soft daylight, stone and dust."
  [canyon]="Two rows of tall towers seen from above close in across the street on every bass hit and drift apart again, the camera fixed high over the avenue. Evening light, long shadows."
  [room-walls]="A small empty room whose bare walls press inward on the beat and open again around a figure dancing in the middle, seen from eye height. Warm lamp light, soft shadows."
  [pyramid-inside]="Inside a vast hollow stepped pyramid the towering terraced walls contract on every bass hit and expand back, a small figure standing on the floor for scale, the camera low and wide, looking up toward the open top. Dim warm light from above."
  [pyramid-inside-spin]="Inside a vast hollow stepped pyramid the camera stands near the middle of the floor and turns slowly all the way round, looking a little up, while the towering terraced walls tighten on every bass hit and ease back, a small figure standing on the floor for scale. Dim warm light from above."
  [falling]="Seen straight down from high above, two rows of Manhattan glass office towers at golden hour, the camera descending between them toward a gothic cathedral facade below. Warm reflections in the glass, hard afternoon light."
  [fruit-dance]="A figure dances in an open studio, seen from the front, while a large fruit beside them changes from apple to banana to papaya and back on the beat. Clean floor, soft studio light, still camera."
  [fruit-mecha]="A blocky mecha figure dances on a dark studio sweep between a banana and an apple floating at shoulder height; on the heavy beats each fruit changes into another fruit, and both swell and glow with the bass. Hard studio light, still camera, seen from the front."
  [fruit-apple-banana]="A single red apple hovers over a dark studio floor, seen from the front; on every bass swell it stretches and bends into a ripe yellow banana and relaxes back into the apple as the bass fades. Hard studio light, still camera."
  [fruit-banana-apple]="A single ripe yellow banana hovers over a dark studio floor, seen from the front; on every bass swell it curls and rounds into a red apple and relaxes back into the banana as the bass fades. Hard studio light, still camera."
  [fruit-apple]="A single large apple rests on a clean studio floor, seen from the front, swelling gently on every bass hit. Soft studio light, still camera."
  [fruit-banana]="A single large banana rests on a clean studio floor, seen from the front, swelling gently on every bass hit. Soft studio light, still camera."
  [fruit-papaya]="A single large papaya rests on a clean studio floor, seen from the front, swelling gently on every bass hit. Soft studio light, still camera."
)
mk() { # study mode [extra prepare args]
  local study="$1" mode="$2"; shift 2
  local g="$GUIDES/$study" l="$LOOKS/$study" out="$BUNDLES/$study-$mode"
  [ -f "$g/rgb.webm" ] || { echo "skip $study: no guide"; return; }
  [ -f "$l/look-first.png" ] || { echo "skip $study: no look-first.png in $l"; return; }
  [ -e "$out" ] && { echo "skip $study: bundle exists"; return; }
  local key=(); local closed; closed=$(ls "$l"/look-closed-*.png 2>/dev/null | head -1 || true)
  if [ -n "$closed" ]; then local idx; idx=$(basename "$closed" .png | sed 's/.*-//'); key=(--keyframe "$closed@$((10#$idx))"); fi
  "$PY" "$SRC/workflows/experiments/prepare.py" --recipe "$g/recipe.json" --rgb "$g/rgb.webm" --depth "$g/depth.webm" \
    --audio "$g/control.wav" --capture-receipt "$g/capture.json" --look "$l/look-first.png" "${key[@]}" \
    --mode "$mode" --frames "$FRAMES" --seed 42 --output "$out" --label "$study-$mode" --prompt "${PROMPT[$study]}" "$@"
  echo "bundle $out"
}
for s in diamond pulse cathedral-walls canyon room-walls pyramid-inside pyramid-inside-spin falling fruit-dance fruit-mecha fruit-apple-banana fruit-banana-apple fruit-apple fruit-banana fruit-papaya; do mk "$s" layout-audio; done
for s in cathedral-walls canyon; do mk "$s" union-depth; done
