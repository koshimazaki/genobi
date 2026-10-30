#!/bin/sh
# Install every pack in custom-nodes.lock at its pinned commit, then its
# requirements under the torch constraints. Runs at image build time.
#   install-nodes.sh <lock file> <ComfyUI custom_nodes dir> <constraints file>
set -eu

lock="$1"
dest="$2"
constraints="$3"

grep -v '^[[:space:]]*\(#\|$\)' "$lock" | while read -r dir repo commit; do
  echo "custom node: $dir @ $commit"
  git init -q "$dest/$dir"
  git -C "$dest/$dir" fetch -q --depth 1 "$repo" "$commit"
  git -C "$dest/$dir" checkout -q FETCH_HEAD
  rm -rf "$dest/$dir/.git"
  if [ -f "$dest/$dir/requirements.txt" ]; then
    pip install --no-cache-dir -c "$constraints" -r "$dest/$dir/requirements.txt"
  fi
done
