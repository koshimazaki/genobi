"""Small private-file and provenance helpers for local candidate experiments."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]


def digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()


def write_json(path, value, exclusive=False):
    """Fsync the file and directory before a network mutation can follow."""
    path = Path(path)
    raw = json_bytes(value)
    if exclusive:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
    else:
        fd, temporary = tempfile.mkstemp(prefix=".receipt-", dir=path.parent)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(raw)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def local_file(value, role, suffixes, limit=128 * 1024 * 1024):
    if not value:
        raise ValueError(f"Missing {role}; supply a local file before preparing a GPU job.")
    path = Path(value).expanduser().resolve()
    if not path.is_file():
        raise ValueError(f"Missing {role}: {path.name}")
    if path.suffix.lower() not in suffixes or not 0 < path.stat().st_size <= limit:
        raise ValueError(f"{role} must be a nonempty {', '.join(sorted(suffixes))} file under {limit // 1024 // 1024} MiB.")
    return path


def source_version():
    try:
        commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
        changed = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=REPO, text=True)
    except (OSError, subprocess.CalledProcessError):
        return {"commit": None, "tracked_changes": None}
    return {"commit": commit, "tracked_changes": bool(changed)}


def safe_bundle_path(root, relative):
    if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
        raise ValueError("Bundle paths must be relative.")
    path = (Path(root) / relative).resolve()
    if not path.is_relative_to(Path(root).resolve()):
        raise ValueError("Bundle path escapes its private directory.")
    return path
