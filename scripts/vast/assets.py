"""Plan, verify or explicitly download the pinned BF16 Layout-to-Render stack.

This module deliberately excludes the separate int8/AKUSPACE model profile.
It reuses the repository's resumable downloader; existing bytes are always
hashed here instead of trusting a sidecar checksum marker.
"""

import argparse
import dataclasses
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "comfy-build/scripts"))
import models as pinned_models  # noqa: E402

MANIFEST = REPO / "comfy-build/models/ltx-world-key.txt"
FILENAMES = {
    "ltx-2.5-22b-distilled-transformer-bf16.safetensors",
    "gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    "ltx-2.5-video-vae-bf16.safetensors",
    "ltx-2.5-audio-vae-bf16.safetensors",
    "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
    "ltx-2.5-22b-ic-lora-layout-to-render-1.0.safetensors",
}
RESERVE_BYTES = 12 * 1024**3


def selected_models(manifest=MANIFEST):
    rows = pinned_models.load_sets([str(manifest)])
    selected = [row for row in rows if Path(row.path).name in FILENAMES]
    if len(selected) != len(FILENAMES) or any(not row.sha256 for row in selected):
        raise ValueError("The manifest must pin all six BF16 layout files by SHA-256")
    # Use immutable HF revisions; the existing deployment manifest also has
    # resolver URLs containing /main, whose bytes are protected by hashes.
    return [dataclasses.replace(row, source_uri=None) for row in selected]


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(8 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_model(model, directory, hash_bytes=True):
    path = Path(model.dest(str(directory)))
    if not path.is_file():
        return "missing"
    if path.stat().st_size != model.size:
        return "size_mismatch"
    if not hash_bytes:
        return "size_only"
    return "verified" if sha256_file(path) == model.sha256 else "hash_mismatch"


def model_plan(models, directory=None, hash_bytes=False):
    rows = []
    for model in models:
        row = {
            "file": model.name,
            "bytes": model.size,
            "sha256": model.sha256,
            "repository": model.repo,
            "revision": model.revision,
        }
        if directory is not None:
            row["status"] = inspect_model(model, directory, hash_bytes)
        rows.append(row)
    return {"profile": "layout-bf16", "model_bytes": sum(m.size for m in models), "files": rows}


def required_download_bytes(models, directory):
    needed = 0
    for model in models:
        part = Path(model.dest(str(directory)) + ".part")
        have = part.stat().st_size if part.is_file() else 0
        needed += model.size - have if 0 <= have <= model.size else model.size
    return needed


def download_models(models, directory, token=None):
    directory.mkdir(parents=True, exist_ok=True)
    missing = [model for model in models if inspect_model(model, directory) != "verified"]
    needed = required_download_bytes(missing, directory) + RESERVE_BYTES
    if shutil.disk_usage(directory).free < needed:
        raise ValueError(f"Need {needed / 1e9:.2f} GB free including download and working reserve")
    for model in missing:
        print(f"Fetching {model.name} ({model.size / 1e9:.2f} GB)", file=sys.stderr)
        pinned_models.download(model, str(directory), token=token)
    return model_plan(models, directory, hash_bytes=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("plan", "verify", "download"))
    parser.add_argument("--models-dir", type=Path)
    parser.add_argument("--confirm-download", action="store_true")
    args = parser.parse_args()
    if args.action != "plan" and args.models_dir is None:
        parser.error("--models-dir is required for verify/download")
    if args.action == "download" and not args.confirm_download:
        parser.error("Downloading requires --confirm-download; inspect plan first")
    try:
        models = selected_models()
        if args.action == "download":
            result = download_models(models, args.models_dir, os.environ.get("HF_TOKEN"))
        else:
            result = model_plan(models, args.models_dir, hash_bytes=args.action == "verify")
        print(json.dumps(result, indent=2))
        return int(args.action != "plan" and any(r["status"] != "verified" for r in result["files"]))
    except (OSError, ValueError, pinned_models.FetchError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
