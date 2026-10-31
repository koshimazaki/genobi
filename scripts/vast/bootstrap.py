"""Prepare pinned Comfy sources in a NEW folder; install Python only on request.

No model download, generation, account login, GPU rental or service exposure
is performed. Python dependencies use the selected machine's CUDA PyTorch.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

REPO = Path(__file__).resolve().parents[2]


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def validate_workspace(path):
    path = path.expanduser().absolute()
    if path.is_symlink():
        raise ValueError("Workspace must not be a symlink")
    if path.exists() and (not path.is_dir() or any(path.iterdir())):
        raise ValueError("Use a new or empty workspace; existing Comfy installations are not replaced")
    return path


def checkout_revision():
    revision = run(["git", "-C", str(REPO), "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    dirty = run([
        "git", "-C", str(REPO), "status", "--porcelain", "--untracked-files=normal",
        "--", "scripts/vast", "comfy-build", "custom_nodes/director_world_builder",
    ], capture_output=True, text=True).stdout.strip()
    if dirty:
        raise ValueError("Commit the preparation scripts, source pins and local node pack before preparing a pinned worker")
    return revision


def source_digest(comfy):
    """Fingerprint installed source bytes, excluding runtime data and caches."""
    digest = hashlib.sha256()
    storage = {"models", "input", "output", "temp", "user", "logs"}
    for root, dirs, files in os.walk(comfy, followlinks=False):
        relative = Path(root).relative_to(comfy)
        dirs[:] = sorted(d for d in dirs if d not in {".git", "__pycache__"}
                         and not (relative == Path(".") and d in storage))
        for name in sorted([*files, *(d for d in dirs if (Path(root) / d).is_symlink())]):
            path = Path(root) / name
            if path.suffix in {".pyc", ".pyo", ".log"}:
                continue
            digest.update(str(path.relative_to(comfy)).encode() + b"\0")
            if path.is_symlink():
                digest.update(b"link\0" + hashlib.sha256(os.readlink(path).encode()).digest())
            else:
                digest.update(b"file\0")
                contents = hashlib.sha256()
                with path.open("rb") as handle:
                    for chunk in iter(lambda: handle.read(8 << 20), b""):
                        contents.update(chunk)
                digest.update(contents.digest())
            digest.update(b"\0")
    return digest.hexdigest()


def prepare(workspace):
    revision = checkout_revision()
    workspace = validate_workspace(workspace)
    workspace.mkdir(parents=True, exist_ok=True)
    lock = REPO / "comfy-build/sources.lock"
    run(["sh", str(REPO / "comfy-build/scripts/install-sources.sh"), str(lock), str(workspace), "ltx-world-key"])
    receipt = {
        "schema": "genobi-vast-source/1",
        "genobi_commit": revision,
        "source_lock_sha256": hashlib.sha256(lock.read_bytes()).hexdigest(),
        "model_profile": "layout-bf16",
        "installed_sources_sha256": source_digest(workspace / "ComfyUI"),
        "python_dependencies_installed": False,
    }
    (workspace / "source-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    (workspace / "sources.lock").write_bytes(lock.read_bytes())
    return workspace, receipt


def runtime_versions():
    if sys.version_info < (3, 12):
        raise ValueError("Use the GPU image's Python 3.12+ interpreter")
    # The image supplies a CUDA-compatible Torch. Never silently choose a CPU
    # wheel or reinstall a different Torch stack through custom node deps.
    try:
        probe = run([
            sys.executable, "-c",
            "import torch; assert torch.cuda.is_available(), 'CUDA PyTorch is unavailable'; "
            "import importlib.metadata as m, json; "
            "print(json.dumps({p:m.version(p) for p in ('torch','torchvision','torchaudio')}))",
        ], capture_output=True, text=True)
    except subprocess.CalledProcessError as error:
        raise ValueError("The selected Python must provide working CUDA torch, torchvision and torchaudio; check the GPU image first") from error
    return json.loads(probe.stdout.strip())


def existing_preparation(workspace):
    workspace = workspace.expanduser().absolute()
    if workspace.is_symlink():
        raise ValueError("Workspace must not be a symlink")
    receipt = json.loads((workspace / "source-receipt.json").read_text())
    source_hash = hashlib.sha256((REPO / "comfy-build/sources.lock").read_bytes()).hexdigest()
    if (receipt.get("schema") != "genobi-vast-source/1"
            or receipt.get("source_lock_sha256") != source_hash
            or receipt.get("genobi_commit") != checkout_revision()
            or not (workspace / "ComfyUI/main.py").is_file()):
        raise ValueError("Existing preparation does not match this Genobi commit and source lock; use a fresh workspace")
    if receipt.get("installed_sources_sha256") != source_digest(workspace / "ComfyUI"):
        raise ValueError("Prepared Comfy sources changed or have no byte receipt; use a fresh workspace")
    return workspace, receipt


def install_python(workspace, receipt, versions):
    constraints = workspace / "torch-constraints.txt"
    constraints.write_text("".join(f"{name}=={value}\n" for name, value in versions.items()))
    environment = workspace / "venv"
    run([sys.executable, "-m", "venv", "--system-site-packages", str(environment)])
    python = environment / "bin/python"
    comfy = workspace / "ComfyUI"
    requirements = [comfy / "requirements.txt"]
    requirements.extend(sorted((comfy / "custom_nodes").glob("*/requirements.txt")))
    args = [str(python), "-m", "pip", "install", "-c", str(constraints)]
    for requirement in requirements:
        args.extend(["-r", str(requirement)])
    run(args)
    frozen = run([str(python), "-m", "pip", "freeze"], capture_output=True, text=True).stdout
    (workspace / "runtime-freeze.txt").write_text(frozen)
    if receipt.get("installed_sources_sha256") != source_digest(comfy):
        raise ValueError("Python installation changed the prepared source bytes; inspect before accepting this worker")
    receipt["python_dependencies_installed"] = True
    receipt["torch_versions"] = versions
    (workspace / "source-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare", action="store_true", help="fetch source code into the empty folder")
    mode.add_argument("--install-only", action="store_true", help="resume Python installation in a previously prepared folder")
    parser.add_argument("--install-python", action="store_true", help="also create a venv and install pinned-source requirements")
    args = parser.parse_args()
    try:
        versions = runtime_versions() if args.install_python or args.install_only else None
        workspace, receipt = existing_preparation(args.workspace) if args.install_only else prepare(args.workspace)
        if versions is not None:
            install_python(workspace, receipt, versions)
        print(json.dumps(receipt, indent=2))
        print("Models are separate: run scripts/vast/assets.py plan, then explicit download.", file=sys.stderr)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Setup stopped: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
