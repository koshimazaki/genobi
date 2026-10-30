"""Read-only, loopback-only viewer for local Hermes Creative and Developer."""
import argparse
from urllib.parse import urlsplit
import json
import re
import sqlite3
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "lib" / "hermes-supervisor"


def studio_origin(value):
    url = urlsplit(value)
    if (url.scheme != "http" or url.hostname not in ("127.0.0.1", "localhost", "::1")
            or url.username or url.password or url.path not in ("", "/")
            or url.query or url.fragment):
        raise argparse.ArgumentTypeError("Use an HTTP loopback origin without credentials or a path")
    try:
        port = url.port
    except ValueError as error:
        raise argparse.ArgumentTypeError("Invalid studio port") from error
    host = "[::1]" if url.hostname == "::1" else url.hostname
    return f"http://{host}" + (f":{port}" if port and port != 80 else "")


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--port", type=int, default=4329)
parser.add_argument("--studio-origin", action="append", type=studio_origin)
parser.add_argument("--hermes-root", type=Path, default=Path.home() / ".hermes")
parser.add_argument("--developer-session", help="Pin a session; otherwise show the latest saved session")
parser.add_argument("--creative-session", help="Pin a session; otherwise show the latest saved session")
parser.add_argument("--ledger", type=Path, help="Optional local JSON credit ledger (display only)")
options = parser.parse_args()
if not 1024 <= options.port <= 65535:
    parser.error("port must be between 1024 and 65535")
PORT = options.port
ORIGINS = options.studio_origin or ["http://127.0.0.1:4317", "http://localhost:4317"]
SESSIONS = {"developer": options.developer_session, "creative": options.creative_session}
STARTED = time.time()


def scrub(value):
    value = str(value or "")
    value = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", value)
    value = re.sub(r"(?i)(bearer\s+)[\w.\-/+=]+", r"\1[redacted]", value)
    value = re.sub(r"\b(?:sk|hf|ghp|gho|github_pat)[_-][A-Za-z0-9_-]{12,}", "[redacted]", value)
    value = re.sub(r"(?i)((?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|authorization|pairing[_-]?code)\s*[=:]\s*)[^\s,;]+", r"\1[redacted]", value)
    value = re.sub(r"(https?://[^\s?]+)\?[^\s]+", r"\1?[query hidden]", value)
    return value


def profile(role, processes):
    path = options.hermes_root.expanduser() / "profiles" / f"hermes-{role}" / "state.db"
    result = {"role": role, "session": SESSIONS[role] or f"hermes-{role}", "running": f"-p hermes-{role} chat" in processes}
    try:
        with sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=1) as db:
            db.row_factory = sqlite3.Row
            session = SESSIONS[role]
            if not session:
                latest = db.execute("SELECT id FROM sessions ORDER BY started_at DESC LIMIT 1").fetchone()
                if latest:
                    session = latest["id"]
                    result["session"] = session
            row = db.execute(
                "SELECT title,model,last_activity_at,started_at,ended_at FROM sessions WHERE id=?",
                (session,),
            ).fetchone()
            if not row:
                return {**result, "error": "Session has not been saved yet", "events": []}
            result.update(dict(row))
            rows = db.execute(
                "SELECT id,role,content,tool_calls,tool_name,timestamp FROM messages WHERE session_id=? AND COALESCE(_compressed_summary,0)=0 ORDER BY id DESC LIMIT 180",
                (session,),
            ).fetchall()
            events = []
            for row in reversed(rows):
                kind = row["role"]
                if kind not in ("user", "assistant", "tool"):
                    continue
                text = scrub(row["content"]) if kind != "tool" else ""
                names = []
                if row["tool_calls"]:
                    try:
                        for call in json.loads(row["tool_calls"]):
                            name = call.get("function", {}).get("name") or call.get("name")
                            if name:
                                names.append(scrub(name))
                    except (ValueError, AttributeError, TypeError):
                        names = ["Tool call recorded"]
                if kind == "tool":
                    text = f"Result recorded: {scrub(row['tool_name'] or 'tool')}"
                if not text and not names:
                    continue
                events.append({"id": row["id"], "kind": kind, "text": text[:16000],
                               "truncated": len(text) > 16000, "tools": names, "time": row["timestamp"]})
            result["events"] = events
            result["lastEventAt"] = max((e["time"] or 0 for e in events), default=0)
    except (sqlite3.Error, OSError) as error:
        result.update(error=type(error).__name__ + ": session temporarily unavailable", events=[])
    return result


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.headers.get("Host") not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}"):
            self.send_error(403)
            return
        if self.path == "/api/sessions":
            try:
                processes = subprocess.run(["ps", "-axo", "command"], capture_output=True, text=True, timeout=3).stdout
            except (OSError, subprocess.TimeoutExpired):
                processes = ""
            ledger_path = options.ledger
            budget = None
            if ledger_path and ledger_path.exists():
                try:
                    ledger = json.loads(ledger_path.read_text())
                    values = {key: ledger.get(key, 0) for key in ("maximum", "confirmedSpend", "reserved", "uncertain")}
                    if all(type(value) in (int, float) and 0 <= value <= 1e12 for value in values.values()):
                        budget = values
                except (ValueError, OSError):
                    pass
            payload = json.dumps({"now": time.time(), "viewerStarted": STARTED,
                                  "budget": budget,
                                  "profiles": [profile(role, processes) for role in SESSIONS]}).encode()
            content_type = "application/json; charset=utf-8"
        elif self.path in ("/", "/index.html"):
            configuration = json.dumps({"studioOrigins": ORIGINS}).replace("<", "\\u003c")
            payload = (ROOT / "index.html").read_text().replace("__SUPERVISOR_CONFIG__", configuration).encode()
            content_type = "text/html; charset=utf-8"
        elif self.path in ("/style.css", "/viewer.js"):
            payload = (ROOT / self.path[1:]).read_bytes()
            content_type = "text/css" if self.path.endswith(".css") else "text/javascript"
        elif self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors " + " ".join(ORIGINS))
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    print(f"Hermes observer: http://127.0.0.1:{PORT}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
