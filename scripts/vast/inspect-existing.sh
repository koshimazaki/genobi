#!/bin/sh
# Read-only inspection of a previously prepared Vast.ai GPU workspace.
# No downloads, no credentials, no model changes, no ComfyUI submissions.
set -eu
W=${VAST_WORKSPACE:-/workspace}
case "$W" in
  /*) ;;
  *) echo "VAST_WORKSPACE must be an absolute path" >&2; exit 2 ;;
esac
printf 'Vast workspace: %s\n' "$W"
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader || true
else
  echo 'nvidia-smi not installed'
fi
found=0
for C in "$W/ComfyUI" "$W/ComfyUI-ltx" "$W/genobi-ltx/ComfyUI"; do
  [ -d "$C" ] || continue
  found=1
  printf '\nFound ComfyUI candidate: %s\n' "$C"
  [ ! -f "$C/main.py" ] || echo '  main.py: present'
  if [ -d "$C/models" ]; then
    echo '  model storage:'
    du -sh "$C/models" 2>/dev/null || true
    echo '  model filenames (first 20):'
    find "$C/models" -type f -name '*.safetensors' -print 2>/dev/null | head -n 20 || true
    echo '  Exact model compatibility requires assets.py verify (SHA-256).'
  fi
  for p in custom_nodes/Koshi-Nodes custom_nodes/ComfyUI-LTXVideo custom_nodes/director_world_builder; do
    if [ -e "$C/$p" ]; then printf '  node pack: %s\n' "$p"; fi
  done
done
[ "$found" -ne 0 ] || echo 'No existing ComfyUI candidate at the three known paths.'
echo
for path in "$W/graphs" "$W/jobs" "$W/input" "$W/LOG.md" "$W/REPO_COMMIT" "$W/.ours"; do
  if [ -e "$path" ]; then printf 'Previous session artifact: %s\n' "$path"; fi
done
if command -v curl >/dev/null 2>&1; then
  echo
  for port in 18188 8188 8189; do
    if curl --noproxy '*' -fsS --connect-timeout 1 --max-time 2 -o /dev/null "http://127.0.0.1:$port/system_stats"; then
      printf 'ComfyUI responding on loopback :%s\n' "$port"
    else
      printf 'No ComfyUI system_stats on loopback :%s\n' "$port"
    fi
  done
fi
echo 'Inspection complete; nothing changed or submitted.'
