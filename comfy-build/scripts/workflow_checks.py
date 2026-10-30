"""Offline coverage checks for the worked LTX endpoint catalogue. No downloads."""
import json
from pathlib import Path
import re

MODEL_INPUTS = {"unet_name", "clip_name", "vae_name", "lora_name", "model_name"}
TOKEN = re.compile(r"__[A-Z0-9_]+__")


def check_workflows(sets, model_dir, workflow_dir=None):
    # The spec generator has already parsed every model pin with models.load_sets.
    import models
    folder = Path(workflow_dir) if workflow_dir else Path(__file__).resolve().parents[2] / "workflows"
    manifest = json.loads((folder / "ltx-world-builder.endpoints.json").read_text())
    names, used, count = set(), set(), 0
    for endpoint in manifest["endpoints"]:
        if endpoint["name"] in names:
            raise ValueError("duplicate endpoint name")
        names.add(endpoint["name"])
        family = endpoint["model_set"]
        if family not in sets:
            continue
        listed = {Path(m.path).name for m in models.load_sets([str(Path(model_dir) / f"{family}.txt")])}
        graph = json.loads((folder / endpoint["workflow"]).read_text())
        actual = set()
        for key, node in graph.items():
            if not isinstance(node.get("class_type"), str) or not isinstance(node.get("inputs"), dict):
                raise ValueError(f"{endpoint['name']}: invalid API node {key}")
            for field, value in node["inputs"].items():
                if isinstance(value, list):
                    if len(value) != 2 or str(value[0]) not in graph or type(value[1]) is not int or value[1] < 0:
                        raise ValueError(f"{endpoint['name']}: dangling/invalid link {key}.{field}")
                if field in MODEL_INPUTS:
                    if value not in listed:
                        raise ValueError(f"{endpoint['name']}: model {value} absent from {family}")
                    actual.add(value)
            if node["class_type"] == "DirectorStoryboardGrid":
                if (node["inputs"]["cell_width"], node["inputs"]["cell_height"]) != (448, 256):
                    raise ValueError("worked storyboard cells must remain 448×256")
            if "GemmaAPITextEncode" == node["class_type"]:
                raise ValueError("untried prompt enhancer in worked graph")
        if not TOKEN.search(json.dumps(graph)):
            raise ValueError(f"{endpoint['name']}: expected an unfilled template")
        used.update(actual)
        count += 1
    selected = {Path(m.path).name for m in models.load_sets([str(Path(model_dir) / f"{s}.txt") for s in sets])}
    # Exactness applies to these dedicated sets, never to older broader sets.
    if set(sets) <= set(manifest["model_sets"]) and selected != used:
        raise ValueError(f"unused model files in release: {sorted(selected - used)}")
    return count
