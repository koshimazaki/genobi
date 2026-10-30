#!/bin/sh
# Download every file in models.txt into the models volume.
#   fetch-models.sh <models.txt> <models dir>
# A file already present and larger than 1 MB is kept. A gated or private
# repository answers 401 with an HTML page; that is refused rather than saved
# under a .safetensors name, where it would only fail when ComfyUI loads it.
set -eu

list="$1"
root="$2"
failed=0

if [ -z "${HF_TOKEN:-}" ]; then
  echo "HF_TOKEN is not set: LTX-2.5 is gated and the AKUSPACE LoRA is private." >&2
  echo "Accept the licence at https://huggingface.co/Lightricks/LTX-2.5 first." >&2
  exit 1
fi

size() { stat -c %s "$1" 2>/dev/null || echo 0; }

grep -v '^[[:space:]]*\(#\|$\)' "$list" > /tmp/akuspace-models.txt
while read -r folder url; do
  name="$(basename "$url")"
  dest="$root/$folder/$name"
  if [ "$(size "$dest")" -gt 1048576 ]; then
    echo "have $folder/$name"
    continue
  fi
  echo "fetch $folder/$name"
  mkdir -p "$root/$folder"
  if curl -fL --retry 3 -C - --progress-bar \
    -H "Authorization: Bearer $HF_TOKEN" -o "$dest.part" "$url" \
    && [ "$(size "$dest.part")" -gt 1048576 ] \
    && [ "$(head -c 1 "$dest.part")" != "<" ]; then
    mv "$dest.part" "$dest"
  else
    echo "failed $folder/$name: check the token has access and the licence is accepted" >&2
    rm -f "$dest.part"
    failed=$((failed + 1))
  fi
done < /tmp/akuspace-models.txt

[ "$failed" -eq 0 ] || exit 1
echo "models ready in $root"
