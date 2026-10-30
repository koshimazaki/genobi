#!/bin/sh
# CPU only: convolve the whole track with each World Builder IR, level each
# wet signal to the dry, and fade it in during its room's window.
# Usage: room-reverb.sh <track> <start seconds> <lengths CSV> <out.wav> <IR|dry>...
# WET: wet relative to dry in dB (-2); DRY: linear gain (0.6); RAMP: seconds (0.6).
set -eu
[ "$#" -ge 5 ] || { echo "usage: room-reverb.sh track start lengths out.wav IR|dry ..." >&2; exit 2; }
track=$1; start=$2; segs=$3; out=$4; shift 4
n=$#
WET=${WET:--2}; DRY=${DRY:-0.6}; RAMP=${RAMP:-0.6}
for tool in ffmpeg bc awk; do command -v "$tool" >/dev/null || { echo "need $tool" >&2; exit 2; }; done
# Restrict numbers before putting them in bc expressions or filter graphs.
number() { awk -v v="$1" 'BEGIN { exit !(v ~ /^-?[0-9]+([.][0-9]+)?$/) }'; }
for v in "$start" "$WET" "$DRY" "$RAMP"; do number "$v" || { echo "invalid numeric setting" >&2; exit 2; }; done
awk -v s="$start" -v d="$DRY" -v r="$RAMP" 'BEGIN { exit !(s >= 0 && d >= 0 && r > 0) }' || exit 2
echo "$segs" | awk -F, -v n="$n" '{ if (NF != n) exit 1; for (i=1;i<=NF;i++) if ($i !~ /^[0-9]+([.][0-9]+)?$/ || $i <= 0) exit 1 }' || { echo "need one positive length per space" >&2; exit 2; }
[ -r "$track" ] || { echo "track is not readable" >&2; exit 2; }
for ir in "$@"; do [ "$ir" = dry ] || [ -r "$ir" ] || { echo "IR is not readable" >&2; exit 2; }; done
total=$(echo "$segs" | tr ',' '+' | bc)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' 0
trap 'exit 1' HUP INT TERM
mean() {
  ffmpeg -hide_banner -i "$1" -af volumedetect -f null - 2>&1 | awk '/mean_volume:/ {print $(NF-1)}'
}
ffmpeg -v error -nostdin -y -ss "$start" -t "$(echo "$total + 6" | bc)" -i "$track" -ac 2 -ar 48000 "$tmp/dry.wav"
ref=$(mean "$tmp/dry.wav")
number "$ref" || { echo "dry track has no finite mean level" >&2; exit 2; }
graph="[0]volume=$DRY[d];"; mix="[d]"
i=1; a=0; k=1
for ir in "$@"; do
  len=$(echo "$segs" | cut -d, -f"$i"); b=$(echo "$a + $len" | bc)
  if [ "$ir" != dry ]; then
    ffmpeg -v error -nostdin -y -i "$ir" -ac 2 -ar 48000 "$tmp/ir$i.wav"
    ffmpeg -v error -nostdin -y -i "$tmp/dry.wav" -i "$tmp/ir$i.wav" -filter_complex "[0][1]afir=gtype=none" "$tmp/raw$i.wav"
    level=$(mean "$tmp/raw$i.wav")
    number "$level" || { echo "IR $i has no finite wet level" >&2; exit 2; }
    gain=$(echo "$ref - $level + $WET" | bc)
    up="clip((t-$a+$RAMP/2)/$RAMP\,0\,1)"; [ "$i" -ne 1 ] || up=1
    down="clip(($b+$RAMP/2-t)/$RAMP\,0\,1)"; [ "$i" -ne "$n" ] || down=1
    graph="$graph[$k]volume=${gain}dB,volume='$up*$down':eval=frame[w$i];"
    mix="$mix[w$i]"; k=$((k + 1))
    echo "space $i: ${a}-${b}s, wet levelled by ${gain} dB"
  fi
  a=$b; i=$((i + 1))
done
# Keep paths as individual arguments, including temporary directories with spaces.
set -- -i "$tmp/dry.wav"
i=1
while [ "$i" -le "$n" ]; do
  [ ! -f "$tmp/raw$i.wav" ] || set -- "$@" -i "$tmp/raw$i.wav"
  i=$((i + 1))
done
total=$(LC_ALL=C printf "%.3f" "$total")  # bc can print ".5"; FFmpeg needs "0.500"
graph="$graph${mix}amix=inputs=$k:normalize=0,atrim=0:$total,alimiter=limit=0.9,loudnorm=I=-14:TP=-1.5"
ffmpeg -v error -nostdin -y "$@" -filter_complex "$graph" -ar 48000 "$out"
echo "wrote output: spaces $segs seconds from ${start}s"
