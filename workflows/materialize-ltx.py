"""Fill a named LTX endpoint offline. Writes API JSON; never submits a job.

python3 workflows/materialize-ltx.py --endpoint party --values values.json --output /tmp/party.api.json
Values are an object keyed by token name without the surrounding double underscores.
"""
import argparse
import json
from pathlib import Path
import re

HERE = Path(__file__).resolve().parent
TOKEN = re.compile(r"__([A-Z0-9_]+)__")
SEEDS = {"SEED_STAGE_1", "SEED_STAGE_2", "REVERB_SEED"}
FILES = {"TAKE_WEBM", "DEPTH_WEBM", "REFERENCE_PNG", "FIRST_FRAME_PNG", "TRACK_AUDIO"}


def validate_value(name, value):
    if name in SEEDS:
        # DirectorSceneReverb takes a 32-bit seed; the samplers take 64-bit seeds.
        bits = 32 if name == "REVERB_SEED" else 64
        if type(value) is not int or not 0 <= value < 2**bits:
            raise ValueError(f"{name} must be an unsigned {bits}-bit JSON integer")
        return
    if not isinstance(value, str) or len(value.encode()) > (64000 if name == "RECIPE_JSON" else 12000):
        raise ValueError(f"{name} must be a bounded string")
    if name in FILES or name.endswith("_PREFIX"):
        if name == "DEPTH_WEBM" and value == "":
            return
        if (not value or len(value) > 240 or value.startswith(("/", "~"))
                or "\\" in value or ":" in value or ".." in value.split("/")
                or any(ord(c) < 32 or ord(c) == 127 for c in value)):
            raise ValueError(f"{name} must be a relative Comfy filename or output prefix")
    if name == "RECIPE_JSON":
        recipe = json.loads(value)
        expected = {"version": 1, "fps": 24, "width": 1024, "height": 576, "frames": 193}
        if not isinstance(recipe, dict) or any(type(recipe.get(k)) is not int or recipe.get(k) != v for k, v in expected.items()):
            raise ValueError("RECIPE_JSON must describe the captured v1, 24 fps, 1024×576, 193-frame take")
    if TOKEN.search(value):
        raise ValueError(f"{name} still contains a placeholder")


def materialize(graph, values):
    needed = {match[1] for match in TOKEN.finditer(json.dumps(graph))}
    if set(values) != needed:
        raise ValueError(f"missing values: {sorted(needed - set(values))}; unknown values: {sorted(set(values) - needed)}")
    for name, value in values.items():
        validate_value(name, value)

    def fill(value):
        if isinstance(value, str) and (match := TOKEN.fullmatch(value)):
            return values[match[1]]
        if isinstance(value, dict):
            return {k: fill(v) for k, v in value.items()}
        if isinstance(value, list):
            return [fill(v) for v in value]
        return value

    return fill(graph)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--values", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((HERE / "ltx-world-builder.endpoints.json").read_text())
    endpoint = next((e for e in manifest["endpoints"] if e["name"] == args.endpoint), None)
    if endpoint is None:
        parser.error(f"unknown endpoint {args.endpoint}")
    try:
        graph = json.loads((HERE / endpoint["workflow"]).read_text())
        values = json.loads(args.values.read_text())
        if not isinstance(values, dict):
            raise ValueError("values must be a JSON object")
        result = materialize(graph, values)
    except (ValueError, OSError) as error:
        parser.error(str(error))
    # Exclusive create avoids overwriting a prior submitted request by mistake.
    with args.output.open("x") as handle:
        json.dump(result, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"Wrote {args.output}; no job submitted.")


if __name__ == "__main__":
    main()
