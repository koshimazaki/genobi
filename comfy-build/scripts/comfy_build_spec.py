"""Write a Comfy Developer Platform comfy-build.yaml from sources.lock and the
model sets, so every Comfy build is made from one set of pins.

  python3 scripts/comfy_build_spec.py --name genobi-swap --sets swap > comfy-build.yaml

The spec follows comfy-cli v1.23.0's format (its comfy-build-authoring skill):
- baseComfyVersion is the ComfyUI commit in sources.lock.
- A node pack with a patch is `source: local` (push zips and uploads the patched
  folder from custom_nodes/); every other pack is `repository` + `gitRef`.
- A hash-pinned public model is a `sourceUri` at its pinned Hugging Face
  revision with its SHA-256, which the builder fetches itself: nothing is
  downloaded or uploaded from this machine.
- A size-only (gated) model is `source: local`: the builder fetches anonymously
  and cannot reach a gated file, so push uploads it from models/, which must
  hold it first (models.py --gated-only).
- pipDependencies is left empty: the builder installs ComfyUI's and each pack's
  requirements.txt and owns torch.
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import models  # noqa: E402


def read_lock(path, sets):
    wanted = {"core", *sets}
    rows, seen = [], set()
    with open(path) as handle:
        for line in handle:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            set_name, dest, repo, commit, sub, patch = line.split()
            if set_name in wanted and dest not in seen:
                seen.add(dest)
                rows.append({"set": set_name, "dest": dest, "repo": repo, "commit": commit, "sub": sub, "patch": patch})
    return rows


def node_entry(row):
    name = row["dest"].rsplit("/", 1)[-1]
    if row["patch"] != "-" or row["sub"] != ".":
        return {"name": name, "source": "local", "localPath": name}
    return {"name": name, "repository": row["repo"], "gitRef": row["commit"], "source": "git"}


def model_entry(model):
    entry = {"type": model.folder, "filename": os.path.basename(model.path), "sizeBytes": model.size}
    if model.sha256:
        entry.update(sourceUri=model.url, sha256=model.sha256)
    else:
        entry.update(source="local", localPath=f"{model.folder}/{os.path.basename(model.path)}")
    return entry


def build_spec(name, sets, lock=None, model_dir=None):
    rows = read_lock(lock or os.path.join(ROOT, "sources.lock"), sets)
    core = [row for row in rows if row["set"] == "core"]
    if len(core) != 1:
        raise ValueError("sources.lock needs exactly one core ComfyUI row")
    model_dir = model_dir or os.path.join(ROOT, "models")
    wanted = models.load_sets([os.path.join(model_dir, f"{name_}.txt") for name_ in sets])
    return {
        "schema": "comfy-build/1",
        "id": None,
        "name": name,
        "description": f"Genobi ComfyUI: {', '.join(sets)} (generated from comfy-build)",
        "syncedRevision": None,
        "definition": {
            "schema": "distribution-definition/0",
            "baseComfyVersion": core[0]["commit"],
            "models": [model_entry(model) for model in wanted],
            "customNodes": [node_entry(row) for row in rows if row["set"] != "core"],
        },
    }


def to_yaml(value, indent=0):
    """A small YAML writer; scalars are JSON-quoted, which YAML reads as-is."""
    pad = "  " * indent
    lines = []
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, (dict, list)) and item:
                lines.append(f"{pad}{key}:")
                lines.extend(to_yaml(item, indent + 1))
            else:
                lines.append(f"{pad}{key}: {json.dumps(item) if item != {} else '{}'}")
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                inner = to_yaml(item, indent + 1)
                lines.append(f"{pad}- {inner[0].lstrip()}")
                lines.extend(inner[1:])
            else:
                lines.append(f"{pad}- {json.dumps(item)}")
    return lines


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--name", required=True)
    parser.add_argument("--sets", nargs="+", required=True)
    parser.add_argument("--check-workflows", action="store_true", help="check worked API links and exact model coverage offline")
    args = parser.parse_args()
    for name in args.sets:
        if not os.path.exists(os.path.join(ROOT, "models", f"{name}.txt")):
            raise SystemExit(f"no model set {name}")
    spec = build_spec(args.name, args.sets)
    if args.check_workflows:
        from workflow_checks import check_workflows
        count = check_workflows(args.sets, os.path.join(ROOT, "models"))
        print(f"Offline workflow coverage: {count} templates", file=sys.stderr)
    print("\n".join(to_yaml(spec)))


if __name__ == "__main__":
    main()
