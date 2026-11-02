#!/usr/bin/env bash
# Wait for the tmux "models" download session, verify every pinned file, then start the queue.
# Usage: EXPECT=8 after-download.sh <bundle names...>
RUN="${RUN:-/workspace/run}"; SRC="${SRC:-/workspace/genobi-src}"
MODELS="${MODELS:-/workspace/genobi-ltx/ComfyUI/models}"
PROFILE="${PROFILE:-second-pass}"; EXPECT="${EXPECT:-8}"
while tmux has-session -t models 2>/dev/null; do sleep 10; done
cd "$SRC"
echo "$(date +%H:%M) DOWNLOAD session ended" >> "$RUN/LOG.md"
python3 scripts/vast/assets.py verify --profile "$PROFILE" --models-dir "$MODELS" > "$RUN/verify.json" 2>&1
python3 - "$RUN/verify.json" "$EXPECT" <<'PY' >> "$RUN/LOG.md"
import json, sys
d = json.load(open(sys.argv[1])); expect = int(sys.argv[2])
files = d.get("files", d) if isinstance(d, dict) else d
rows = files if isinstance(files, list) else []
ok = [f for f in rows if f.get("status") == "verified"]
bad = [f for f in rows if f.get("status") != "verified"]
print("VERIFY", f"all {expect} verified" if len(ok) == expect and not bad else "PROBLEM " + json.dumps(bad or rows)[:300])
PY
grep -q "all $EXPECT verified" "$RUN/LOG.md" || { echo "verify failed; queue not started" >> "$RUN/LOG.md"; exit 1; }
exec "$RUN/run-queue.sh" "$@"
