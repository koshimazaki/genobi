"""Offline checks for the three key workflow families. No model downloads."""
import json
from pathlib import Path
import re

MODEL_INPUTS = {"unet_name", "clip_name", "vae_name", "lora_name", "model_name"}
TOKEN = re.compile(r"__[A-Z0-9_]+__")
ROOT = Path(__file__).resolve().parents[2]


def check_graph(graph, name):
    actual = set()
    for key, node in graph.items():
        if not isinstance(node.get("class_type"), str) or not isinstance(node.get("inputs"), dict):
            raise ValueError(f"{name}: invalid API node {key}")
        for field, value in node["inputs"].items():
            if isinstance(value, list):
                if len(value) != 2 or str(value[0]) not in graph or type(value[1]) is not int or value[1] < 0:
                    raise ValueError(f"{name}: dangling/invalid link {key}.{field}")
            if field in MODEL_INPUTS:
                actual.add(value)
        if node["class_type"] == "DirectorStoryboardGrid":
            if (node["inputs"]["cell_width"], node["inputs"]["cell_height"]) != (448, 256):
                raise ValueError("key storyboard cells must remain 448×256")
        if node["class_type"] == "GemmaAPITextEncode":
            raise ValueError("untried prompt enhancer in key graph")
    if not TOKEN.search(json.dumps(graph)):
        raise ValueError(f"{name}: expected an unfilled template")
    return actual


def check_workflows(sets, model_dir, workflow_dir=None):
    import models
    folder = Path(workflow_dir) if workflow_dir else ROOT / "workflows"
    manifest = json.loads((folder / "ltx-world-builder.endpoints.json").read_text())
    names, used, count = set(), set(), 0
    for endpoint in manifest["endpoints"]:
        name = endpoint["name"]
        if name in names:
            raise ValueError("duplicate endpoint name")
        names.add(name)
        if endpoint["model_set"] is not None and endpoint["model_set"] not in sets:
            continue
        graph = json.loads((folder / endpoint["workflow"]).read_text())
        actual = check_graph(graph, name)
        if endpoint["runtime"] == "local-cpu" and actual:
            raise ValueError("CPU reverb must have no model loaders")
        used.update(actual)
        count += 1
        for preset, workflow in endpoint.get("presets", {}).items():
            variant = json.loads((folder / workflow).read_text())
            # Only the documented guide/mask dimensions may differ.
            expected = json.loads(json.dumps(graph))
            for node, fields in (("9", ("resize_type.width", "resize_type.height")),
                                 ("av3", ("width", "height"))):
                for field, value in zip(fields, (1024, 576)):
                    expected[node]["inputs"][field] = value
            if preset != "studio" or variant != expected:
                raise ValueError(f"{name}: preset changes more than input dimensions")
            used.update(check_graph(variant, preset))
            count += 1
    selected = {Path(m.path).name for m in models.load_sets([str(Path(model_dir) / f"{s}.txt") for s in sets])}
    if sets == ["ltx-world-key"] and selected != used:
        raise ValueError(f"model coverage mismatch: unused={sorted(selected - used)}, missing={sorted(used - selected)}")
    return count
