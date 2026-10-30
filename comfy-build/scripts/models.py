"""Download the model files of one or more model sets at their pinned revisions.

A set is a file in models/ (swap.txt, akuspace.txt, ...). Each line is
  <folder> <repository> <revision> <path in repository> <bytes> <sha256 or ->
and the file lands at <root>/<folder>/<basename of path>; a file named by two
sets is fetched once. A file already there with the right size and a matching
.sha256 marker is kept without rehashing; one with the right size and no marker
is hashed once. "-" (a gated repository hides the hash) means size only.
Downloads resume from a .part file, are checked before they are renamed into
place, and send HF_TOKEN (when set) to huggingface.co only, never to the CDN a
download redirects to. The token is never logged.

Also a command:  python3 models.py [--gated-only] <models dir> <set file>...
"""

import concurrent.futures
import hashlib
import logging
import os
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

LOG = logging.getLogger("comfy-build")
CHUNK = 8 << 20
HEX = set("0123456789abcdef")


@dataclass(frozen=True)
class Model:
    folder: str
    repo: str
    revision: str
    path: str
    size: int
    sha256: str | None

    def dest(self, root):
        return os.path.join(root, self.folder, os.path.basename(self.path))

    @property
    def name(self):
        return f"{self.folder}/{os.path.basename(self.path)}"

    @property
    def url(self):
        return (
            f"https://huggingface.co/{self.repo}/resolve/{self.revision}/"
            f"{urllib.parse.quote(self.path)}"
        )


class FetchError(Exception):
    pass


def parse_models(text):
    models = []
    for number, line in enumerate(text.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 6:
            raise ValueError(f"models line {number}: expected 6 fields")
        folder, repo, revision, path, size, sha256 = parts
        sha256 = None if sha256 == "-" else sha256
        bad = (
            ".." in folder.split("/")
            or ".." in path.split("/")
            or folder.startswith("/")
            or not size.isdigit()
            or (sha256 is not None and (len(sha256) != 64 or not set(sha256) <= HEX))
            or len(revision) != 40
        )
        if bad:
            raise ValueError(f"models line {number}: bad folder, path, size, hash or revision")
        models.append(Model(folder, repo, revision, path, int(size), sha256))
    return models


def load_sets(paths):
    """The models of several set files, each destination once."""
    models, seen = [], {}
    for path in paths:
        with open(path) as handle:
            for model in parse_models(handle.read()):
                key = (model.folder, os.path.basename(model.path))
                if key in seen:
                    if seen[key] != (model.size, model.sha256):
                        raise ValueError(f"{model.name} is pinned twice with different files")
                    continue
                seen[key] = (model.size, model.sha256)
                models.append(model)
    return models


def _hash_file(path, digest=None):
    digest = digest or hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            chunk = handle.read(CHUNK)
            if not chunk:
                return digest
            digest.update(chunk)


def _marker(dest):
    return dest + ".sha256"


def present(model, root):
    """True when the file is in place with the right size and hash."""
    dest = model.dest(root)
    try:
        if os.path.getsize(dest) != model.size:
            return False
    except OSError:
        return False
    if model.sha256 is None:
        return True
    try:
        with open(_marker(dest)) as handle:
            if handle.read().strip() == model.sha256:
                return True
    except OSError:
        pass
    if _hash_file(dest).hexdigest() != model.sha256:
        LOG.warning("model %s has the right size but the wrong hash; fetching again", model.name)
        return False
    _write_marker(dest, model.sha256)
    return True


def _write_marker(dest, sha256):
    if sha256 is None:
        return
    with open(_marker(dest), "w") as handle:
        handle.write(sha256 + "\n")


def _default_open(request, timeout):
    return urllib.request.urlopen(request, timeout=timeout)


def download(model, root, token=None, open_url=_default_open, attempts=3):
    dest = model.dest(root)
    part = dest + ".part"
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    last = "no attempt made"
    for attempt in range(1, attempts + 1):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        if have > model.size:
            os.unlink(part)
            have = 0
        if have == model.size:
            # A complete download that was not renamed before a restart.
            if model.sha256 is None or _hash_file(part).hexdigest() == model.sha256:
                os.replace(part, dest)
                _write_marker(dest, model.sha256)
                return
            os.unlink(part)
            have = 0
        request = urllib.request.Request(model.url, headers={"User-Agent": "genobi-comfy-build"})
        if token:
            # Unredirected: urllib drops it on the redirect to the download CDN.
            request.add_unredirected_header("Authorization", f"Bearer {token}")
        if have:
            request.add_header("Range", f"bytes={have}-")
        try:
            with open_url(request, 120) as response:
                resumed = have and response.status == 206
                digest = _hash_file(part) if resumed else hashlib.sha256()
                with open(part, "ab" if resumed else "wb") as handle:
                    while True:
                        chunk = response.read(CHUNK)
                        if not chunk:
                            break
                        digest.update(chunk)
                        handle.write(chunk)
        except urllib.error.HTTPError as error:
            last = f"HTTP {error.code}"
            if error.code in (401, 403, 404):
                break  # access or a wrong pin: retrying will not help
            continue
        except (urllib.error.URLError, OSError) as error:
            last = type(error).__name__
            continue
        size = os.path.getsize(part)
        if size != model.size:
            last = f"got {size} of {model.size} bytes"
            continue
        if model.sha256 is not None and digest.hexdigest() != model.sha256:
            os.unlink(part)
            raise FetchError(f"{model.name}: SHA-256 does not match the pinned file")
        os.replace(part, dest)
        _write_marker(dest, model.sha256)
        return
    if os.path.exists(part) and last.startswith("HTTP 4"):
        os.unlink(part)
    raise FetchError(f"{model.name}: download failed ({last})")


def ensure_models(models, root, token=None, workers=4, open_url=_default_open):
    """Fetch every missing model; raise FetchError naming what failed."""
    missing = [model for model in models if not present(model, root)]
    for model in models:
        if model not in missing:
            LOG.info("have %s", model.name)
    if not missing:
        return
    os.makedirs(root, exist_ok=True)
    needed = sum(model.size for model in missing)
    free = shutil.disk_usage(root).free
    if free < needed:
        raise FetchError(
            f"the models volume has {free / 1e9:.1f} GB free and needs {needed / 1e9:.1f} GB"
        )
    LOG.info("fetching %d model files, %.1f GB", len(missing), needed / 1e9)
    failures = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        jobs = {
            pool.submit(download, model, root, token, open_url): model for model in missing
        }
        for job in concurrent.futures.as_completed(jobs):
            model = jobs[job]
            try:
                job.result()
                LOG.info("fetched %s", model.name)
            except FetchError as error:
                failures.append(str(error))
    if failures:
        raise FetchError("; ".join(sorted(failures)))


def main(argv):
    gated_only = "--gated-only" in argv
    argv = [arg for arg in argv if arg != "--gated-only"]
    if len(argv) < 3:
        print("usage: models.py [--gated-only] <models dir> <set file>...", file=sys.stderr)
        return 2
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    models = load_sets(argv[2:])
    if gated_only:  # the size-only files a Comfy build must upload itself
        models = [model for model in models if model.sha256 is None]
    try:
        ensure_models(models, argv[1], os.environ.get("HF_TOKEN") or None)
    except FetchError as error:
        LOG.error("model fetch failed: %s", error)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
