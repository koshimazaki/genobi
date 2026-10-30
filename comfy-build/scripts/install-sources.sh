#!/bin/sh
# Fetch every source tree of the chosen sets in sources.lock at its pinned
# commit, take the named subfolder, and apply its patch (needs git and patch).
#   install-sources.sh <sources.lock> <root dir> <set>...
# The core set (ComfyUI) is always installed and must come first in the lock.
# A destination named by two sets is installed once.
set -eu

lock="$1"
root="$2"
shift 2
here="$(cd "$(dirname "$lock")" && pwd)"
wanted=" core $* "
done_list=" "

grep -v '^[[:space:]]*\(#\|$\)' "$lock" > "$root/.sources.tmp"
while read -r set dest repo commit sub patch; do
  case "$wanted" in *" $set "*) ;; *) continue ;; esac
  case "$done_list" in *" $dest "*) continue ;; esac
  echo "source $dest @ $commit ($set)"
  tmp="$root/.fetch-$$"
  rm -rf "$tmp"
  git init -q "$tmp"
  git -C "$tmp" fetch -q --depth 1 "$repo" "$commit"
  git -C "$tmp" checkout -q FETCH_HEAD
  rm -rf "$tmp/.git"
  mkdir -p "$(dirname "$root/$dest")"
  rm -rf "${root:?}/$dest"
  if [ "$sub" = "." ]; then
    mv "$tmp" "$root/$dest"
  else
    mv "$tmp/$sub" "$root/$dest"
    rm -rf "$tmp"
  fi
  if [ "$patch" != "-" ]; then
    echo "patch $dest with $patch"
    # patch, not git apply: git apply silently skips files when the folder
    # sits inside another git checkout.
    patch -p1 --forward --batch -d "$root/$dest" < "$here/$patch"
  fi
  done_list="$done_list$dest "
done < "$root/.sources.tmp"
rm -f "$root/.sources.tmp"
