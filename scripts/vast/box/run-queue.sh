#!/usr/bin/env bash
# Sequential LTX pilot runner on the box: one GPU job at a time, append-only log.
# Usage: run-queue.sh <bundle-name>...   (bundles under $RUN/bundles)
set -u
RUN="${RUN:-/workspace/run}"
SRC="${SRC:-/workspace/genobi-src}"
PY="${PY:-/workspace/genobi-ltx/venv/bin/python}"
URL="${URL:-http://127.0.0.1:8189}"
LOG="$RUN/LOG.md"
cd "$SRC"
mkdir -p "$RUN/outputs"
for name in "$@"; do
  b="$RUN/bundles/$name"
  [ -d "$b" ] || { echo "$(date +%H:%M) SKIP $name (no bundle)" | tee -a "$LOG"; continue; }
  echo "$(date +%H:%M) SUBMIT $name" | tee -a "$LOG"
  start=$(date +%s)
  "$PY" workflows/experiments/run.py --bundle "$b" --url "$URL" --submit --budget-usd 5 --wait-seconds 1500 --poll-interval 10 > "$RUN/$name.run.log" 2>&1
  rc=$?
  status=$("$PY" -c "import json;print(json.load(open('$b/run.private.json')).get('status'))" 2>/dev/null)
  pid=$("$PY" -c "import json;print(json.load(open('$b/run.private.json')).get('prompt_id'))" 2>/dev/null)
  echo "$name $pid" >> "$RUN/job_ids.txt"
  echo "$(date +%H:%M) RESULT $name rc=$rc status=$status prompt_id=$pid wall=$(( $(date +%s) - start ))s vram=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader)" | tee -a "$LOG"
  tail -3 "$RUN/$name.run.log" | cut -c1-200
done
echo "$(date +%H:%M) QUEUE DONE" | tee -a "$LOG"
