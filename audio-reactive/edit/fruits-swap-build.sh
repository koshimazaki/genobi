#!/bin/bash
# Dance with Fruits swap edit, the template build. One loop (9.0 s) per character, cut on the measured grid,
# Nokia typography cards over the last two beats of each loop, 4-frame pixel ramps, an outro card.
#
# Usage:
#   RUN=<dir with the w0 renders> OUT=<work dir> ./fruits-swap-build.sh "mecha:fruit-mecha-explodeg1" \
#       "gorilla:char-gorilla-explode+watermelon:char-gold-gundam-explode" "unicorn:char-unicorn-explode"
#   Each argument is one loop: NAME:RENDER, optionally +NAME:RENDER for a mid-loop swap on the drop beat.
#   RENDER is the file stem in $RUN; the file is $RUN/<RENDER>-w0-layout-audio.mp4 (a window-0 render on the
#   explode guide). NAME is the word typed on the card (upper-cased). 1 to 3 loops: 9.1 s, 18.1 s or 27.1 s.
#   LOOP=<audio>: the 9 s loop file (default: the owner's mecha-fruits-9s-A2-starts-on-voice.mp3), tiled N times.
# Needs ffmpeg 7 (pixelize), python3 with Pillow, nokiafc22.ttf and Retro Gaming.ttf in ~/Library/Fonts.
#
# Grid (measured from the renders, 3 Nov 2026): loop 9.0 s, beat 0.59211 s (101.33 BPM); kicks sit on the grid
# from beat 8 of each loop. A w0 render covers loop-relative 0 to 8.0417 s; the card covers the rest.
set -euo pipefail
RUN=${RUN:?dir with the renders}; OUT=${OUT:?work dir}
LOOP=${LOOP:-"/Users/radek/Downloads/Dance with Fruits edit/mecha-fruits-9s-A2-starts-on-voice.mp3"}
[ $# -ge 1 ] && [ $# -le 3 ] || { echo "give 1 to 3 loop specs" >&2; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd); mkdir -p "$OUT/seg"
ENC="-an -c:v libx264 -preset medium -crf 15 -pix_fmt yuv420p -r 24 -g 12 -x264-params keyint=12:min-keyint=12:scenecut=0"
LOOP_F=216; BEAT=0.59211                  # 9.0 s at 24 fps; beat length
bf() { python3 -c "import sys; print(round(float(sys.argv[1])*24))" "$1"; }   # seconds -> frame
CARD_IN=$(bf $(echo "13*$BEAT" | bc -l))  # 185: beat 13, card starts
DROP=$(bf $(echo "8*$BEAT" | bc -l))      # 114: beat 8, mid-loop swap
OUTRO=$(bf $(echo "9*$BEAT" | bc -l))     # 128: beat 9, outro card starts in the last loop
OUTRO_LEN=42                              # to beat 12
ramp_out() { local n=$1; echo "pixelize=w=16:h=16:enable='between(n,$((n-4)),$((n-4)))',pixelize=w=32:h=32:enable='between(n,$((n-3)),$((n-3)))',pixelize=w=64:h=64:enable='between(n,$((n-2)),$((n-2)))',pixelize=w=128:h=128:enable='between(n,$((n-1)),$((n-1)))'"; }
ramp_in()  { echo "pixelize=w=128:h=128:enable='between(n,0,0)',pixelize=w=64:h=64:enable='between(n,1,1)',pixelize=w=32:h=32:enable='between(n,2,2)',pixelize=w=16:h=16:enable='between(n,3,3)'"; }
cut() { echo "trim=start_frame=$1:end_frame=$(( $2 + 1 )),setpts=PTS-STARTPTS"; }
# words for the cards: next loop's character name; mid-loop swap word
NAMES=(); MIDS=(); RENDERS=(); MIDRENDERS=()
for spec in "$@"; do
  main=${spec%%+*}; mid=""; [[ "$spec" == *+* ]] && mid=${spec#*+}
  NAMES+=("$(echo "${main%%:*}" | tr a-z A-Z)"); RENDERS+=("$RUN/${main#*:}-w0-layout-audio.mp4")
  MIDS+=("$( [ -n "$mid" ] && echo "${mid%%:*}" | tr a-z A-Z || true)"); MIDRENDERS+=("$( [ -n "$mid" ] && echo "$RUN/${mid#*:}-w0-layout-audio.mp4" || true)")
done
N=${#NAMES[@]}
python3 -I "$HERE/fruits-swap-cards.py" "$OUT" "${NAMES[@]:1}" --mids "${MIDS[@]}" >/dev/null
LIST="$OUT/seg/list.txt"; : > "$LIST"; k=0
seg() { k=$((k+1)); SEG=$(printf "%s/seg/%02d.mp4" "$OUT" "$k"); echo "file '$SEG'" >> "$LIST"; }   # sets $SEG, no subshell
for ((i=0;i<N;i++)); do
  last=$(( i == N-1 ? 1 : 0 )); end=$CARD_IN; [ $last = 1 ] && end=$OUTRO
  if [ -n "${MIDS[$i]}" ]; then
    # main character to the drop beat, then the mid-loop swap with its word typed over the picture
    seg; ffmpeg -v error -y -i "${RENDERS[$i]}" -filter_complex "[0:v]$(cut 0 $((DROP-1)))$( [ $i = 0 ] || echo ",$(ramp_in)")[out]" -map "[out]" $ENC "$SEG"
    seg; ffmpeg -v error -y -i "${MIDRENDERS[$i]}" -framerate 24 -i "$OUT/ov/mid$i/%04d.png" -filter_complex "[0:v]$(cut $DROP $((end-1)))[v];[v][1:v]overlay=eof_action=pass:format=auto[o];[o]$(ramp_out $((end-DROP)))[out]" -map "[out]" $ENC "$SEG"
  else
    ov=""; [ $i = 0 ] && ov="-framerate 24 -i $OUT/ov/title/%04d.png"
    fc="[0:v]$(cut 0 $((end-1)))$( [ $i = 0 ] || echo ",$(ramp_in)")[v]"
    [ $i = 0 ] && fc="$fc;[v][1:v]overlay=eof_action=pass:format=auto[v2]" || fc="$fc;[v]null[v2]"
    seg; ffmpeg -v error -y -i "${RENDERS[$i]}" $ov -filter_complex "$fc;[v2]$(ramp_out $end)[out]" -map "[out]" $ENC "$SEG"
  fi
  if [ $last = 1 ]; then seg; ffmpeg -v error -y -framerate 24 -i "$OUT/cards/outro/%04d.png" $ENC "$SEG"
  else seg; ffmpeg -v error -y -framerate 24 -i "$OUT/cards/card$i/%04d.png" $ENC "$SEG"; fi
done
ffmpeg -v error -y -f concat -safe 0 -i "$LIST" -c copy "$OUT/seg/video.mp4"
FRAMES=$(( (N-1)*LOOP_F + OUTRO + OUTRO_LEN )); DUR=$(echo "$FRAMES/24" | bc -l)
# audio: the 9 s loop tiled N times (sample-aligned with the renders, measured lag 0), fade over the last 0.63 s
ffmpeg -v error -y -stream_loop $((N-1)) -i "$LOOP" -filter_complex "[0:a]atrim=end=$DUR,afade=t=out:st=$(echo "$DUR-0.63" | bc -l):d=0.63[a]" -map "[a]" -c:a pcm_s16le "$OUT/seg/audio.wav"
ffmpeg -v error -y -i "$OUT/seg/video.mp4" -i "$OUT/seg/audio.wav" -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -movflags +faststart "$OUT/fruits-swap.mp4"
ffmpeg -v error -y -i "$OUT/fruits-swap.mp4" -vf "fps=2,scale=320:-1,tile=10x6" -frames:v 1 "$OUT/fruits-swap.sheet.png"
ffprobe -v error -show_entries stream=codec_type,nb_frames,duration -of csv=p=0 "$OUT/fruits-swap.mp4"
