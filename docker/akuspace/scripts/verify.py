"""Check a running ComfyUI against the bundled AKUSPACE workflows.

Reads /object_info and, for every API-format graph in --workflows, checks that
each node type is registered, every required input is given, every link names
a node and output that exist, and every literal dropdown value is one the
instance offers. Model files and input files are dropdown values, so a missing
LoRA or reference recording shows up here rather than mid-render.

With --comfy-dir (the entrypoint passes it), it also imports the aligned
reference module the way ComfyUI does. That module registers its node even
when torch, torchaudio or ComfyUI's LTX core will not import, and only fails
when a graph runs, so /object_info alone cannot see the silent failure.

    python verify.py --workflows DIR [--models DIR] [--input DIR]
                     [--comfy-dir DIR] [--skip-files]

--skip-files reports missing model and input files as warnings, for a smoke
test of an image that has no weights. Exit status 1 means a check failed.
Standard library only.
"""

import argparse
import importlib.util
import json
import os
import sys
import urllib.request
from pathlib import Path

ALIGNED_MODULE = "custom_nodes/Koshi-Nodes/nodes/audio/aligned_ref.py"

AKUSPACE_NODES = (
    "AKUSPACEReferenceAudioAligned",
    "Koshi_AKUSPACEPrompt",
    "Koshi_AKUSPACETextEncode",
)
# Inputs whose dropdown lists files on disk rather than fixed options.
FILE_INPUTS = {
    "unet_name",
    "clip_name",
    "vae_name",
    "lora_name",
    "model_name",
    "audio",
    "image",
}
MIN_MODEL_BYTES = 1024 * 1024


def fetch_object_info(url):
    with urllib.request.urlopen(f"{url.rstrip('/')}/object_info", timeout=60) as response:
        return json.load(response)


def options(spec):
    """The allowed values of a dropdown input spec, or None for other types."""
    kind = spec[0] if isinstance(spec, (list, tuple)) and spec else None
    if isinstance(kind, list):
        return kind
    if kind == "COMBO" and len(spec) > 1 and isinstance(spec[1], dict):
        return spec[1].get("options")
    return None


def is_link(value):
    return (
        isinstance(value, list)
        and len(value) == 2
        and isinstance(value[0], str)
        and isinstance(value[1], int)
    )


class Report:
    def __init__(self, skip_files):
        self.skip_files = skip_files
        self.errors = []
        self.warnings = []

    def error(self, message):
        self.errors.append(message)

    def missing_file(self, message):
        (self.warnings if self.skip_files else self.errors).append(message)


def check_graph(name, graph, info, report):
    if not isinstance(graph, dict) or not graph:
        report.error(f"{name}: expected a non-empty API-format workflow")
        return
    for node_id, node in graph.items():
        if not isinstance(node, dict) or "class_type" not in node:
            report.error(f"{name} entry {node_id}: expected an API-format node")
            continue
        where = f"{name} node {node_id} ({node['class_type']})"
        schema = info.get(node["class_type"])
        if schema is None:
            report.error(f"{where}: node type is not registered")
            continue
        given = node.get("inputs", {})
        declared = {
            **schema.get("input", {}).get("optional", {}),
            **schema.get("input", {}).get("required", {}),
        }
        for input_name in schema.get("input", {}).get("required", {}):
            if input_name not in given:
                report.error(f"{where}: required input '{input_name}' is not set")
        for input_name, value in given.items():
            if is_link(value):
                source = graph.get(value[0])
                if source is None:
                    report.error(f"{where}: '{input_name}' links to missing node {value[0]}")
                    continue
                outputs = info.get(source.get("class_type"), {}).get("output", [])
                if value[1] < 0 or value[1] >= len(outputs):
                    report.error(f"{where}: '{input_name}' links to output {value[1]} of node {value[0]}, which has {len(outputs)}")
                continue
            allowed = options(declared.get(input_name))
            if allowed is None or value in allowed:
                continue
            message = f"{where}: '{input_name}' is '{value}', which this ComfyUI does not offer"
            if input_name in FILE_INPUTS:
                report.missing_file(message)
            else:
                report.error(message)


def check_aligned_runtime(comfy_dir, report):
    """Import aligned_ref.py as ComfyUI would and read whether its runtime loaded."""
    path = Path(comfy_dir) / ALIGNED_MODULE
    if not path.is_file():
        report.error(f"{path} is missing: Koshi-Nodes predates the aligned reference node")
        return
    sys.path.insert(0, str(comfy_dir))
    argv = sys.argv
    try:
        # Import ComfyUI's core with the server's own flags (COMFY_ARGS, such as
        # --cpu), so device detection matches the running instance.
        import comfy.options

        comfy.options.enable_args_parsing()
        sys.argv = [argv[0], *os.environ.get("COMFY_ARGS", "").split()]
        spec = importlib.util.spec_from_file_location("akuspace_aligned_check", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    except Exception as error:  # the module itself failing to import
        report.error(f"{path} does not import: {error}")
        return
    finally:
        sys.argv = argv
        sys.path.remove(str(comfy_dir))
    if not getattr(module, "_COMFY", False):
        report.error(
            "AKUSPACEReferenceAudioAligned registers but cannot run: "
            f"{getattr(module, '_IMPORT_ERROR', 'unknown import failure')}"
        )


def check_models(models_dir, report):
    for path in sorted(Path(models_dir).rglob("*.safetensors")):
        if path.stat().st_size < MIN_MODEL_BYTES:
            report.error(f"{path}: under 1 MB, most likely a saved 401 page; delete it and fetch again")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--url", default=os.environ.get("COMFY_URL", "http://127.0.0.1:8188"))
    parser.add_argument("--workflows", required=True)
    parser.add_argument("--models")
    parser.add_argument("--input", help="ComfyUI's input folder, named in hints")
    parser.add_argument("--comfy-dir", help="ComfyUI's own folder, when run in its Python")
    parser.add_argument("--skip-files", action="store_true")
    args = parser.parse_args()

    try:
        info = fetch_object_info(args.url)
    except OSError as error:
        print(f"no ComfyUI at {args.url}: {error}", file=sys.stderr)
        return 1

    report = Report(args.skip_files)
    for node in AKUSPACE_NODES:
        if node not in info:
            report.error(f"{node} is not registered: check Koshi-Nodes imported cleanly (torchaudio, nodes/audio/aligned_ref.py)")

    workflows = sorted(Path(args.workflows).glob("*.json"))
    if not workflows:
        report.error(f"no workflows in {args.workflows}")
    for path in workflows:
        check_graph(path.name, json.loads(path.read_text()), info, report)
    if args.models:
        check_models(args.models, report)
    if args.comfy_dir:
        check_aligned_runtime(args.comfy_dir, report)

    for message in report.warnings:
        print(f"warn  {message}")
    for message in report.errors:
        print(f"FAIL  {message}")
    if report.errors:
        if args.input:
            print(f"Reference recordings and first frames go in {args.input}; model files in {args.models}.")
        return 1
    print(f"ok    {len(workflows)} workflows match this ComfyUI ({len(info)} node types)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
