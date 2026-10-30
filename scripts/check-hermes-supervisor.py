"""Smoke the optional viewer against synthetic sessions, never private logs."""
import json
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

script = Path(__file__).with_name("hermes-supervisor.py")
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    home = root / "profiles" / "hermes-developer"
    home.mkdir(parents=True)
    with sqlite3.connect(home / "state.db") as db:
        db.executescript("""
            CREATE TABLE sessions (id TEXT, title TEXT, model TEXT,
                last_activity_at REAL, started_at REAL, ended_at REAL);
            CREATE TABLE messages (id INTEGER, session_id TEXT, role TEXT,
                content TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL,
                _compressed_summary INTEGER, reasoning TEXT);
        """)
        db.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?)",
                   ("test-session", "Example", "test-model", 1, 1, None))
        for row in [
            (1, "system", "SYSTEM_SECRET", None, None, 0),
            (2, "user", "Inspect http://localhost:4317/?token=QUERY_SECRET", None, None, 0),
            (3, "assistant", "Authorization: Bearer TOKEN_SECRET", json.dumps([
                {"function": {"name": "example_tool", "arguments": "ARG_SECRET"}}
            ]), None, 0),
            (4, "tool", "RESULT_SECRET", None, "example_tool", 0),
            (5, "assistant", "SUMMARY_SECRET", None, None, 1),
        ]:
            ident, role, content, calls, name, compressed = row
            db.execute("INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?)",
                       (ident, "test-session", role, content, calls, name, 1,
                        compressed, "REASONING_SECRET"))
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    process = subprocess.Popen(
        [sys.executable, str(script), "--port", str(port), "--hermes-root", str(root)],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    try:
        base = f"http://127.0.0.1:{port}"
        for attempt in range(50):
            try:
                with urlopen(base + "/api/sessions", timeout=1) as response:
                    raw = response.read().decode()
                break
            except URLError:
                if process.poll() is not None:
                    raise RuntimeError(process.stderr.read().decode())
                time.sleep(0.1)
        else:
            raise AssertionError("Viewer did not start")
        assert "SECRET" not in raw, raw
        snapshot = json.loads(raw)
        assert snapshot["budget"] is None
        assert snapshot["profiles"][0]["session"] == "test-session"
        assert len(snapshot["profiles"][0]["events"]) == 3
        assert snapshot["profiles"][1]["events"] == []
        assert "error" in snapshot["profiles"][1]
        for route in ("/", "/viewer.js", "/style.css"):
            with urlopen(base + route) as response:
                assert response.status == 200
                assert "frame-ancestors http://127.0.0.1:4317" in response.headers["Content-Security-Policy"]
                assert "__SUPERVISOR_CONFIG__" not in response.read().decode()
        for request, expected in [
            (Request(base, headers={"Host": "untrusted.example"}), 403),
            (Request(base + "/../state.db"), 404),
        ]:
            try:
                urlopen(request)
            except HTTPError as error:
                assert error.code == expected
            else:
                raise AssertionError("Expected refusal")
        refused = subprocess.run(
            [sys.executable, str(script), "--studio-origin", "https://untrusted.example"],
            capture_output=True,
        )
        assert refused.returncode == 2
        print("PASS: loopback/Host boundaries, assets, missing profiles, latest session and omitted private fields")
    finally:
        process.terminate()
        process.wait(timeout=5)
