"""Materialize the CPU-only scene reverb graph; never queue or contact a server.

python3 workflows/make-cpu-reverb.py --recipe scene.json --audio track.wav --output /tmp/room.api.json
The recipe may be a World Builder recipe or its capture receipt's recipe field.
"""
import argparse
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("materialize_ltx", HERE / "materialize-ltx.py")
materializer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(materializer)


def make_graph(recipe, audio, prefix="audio/room", seed=0):
    if isinstance(recipe, dict) and "recipe" in recipe:
        recipe = recipe["recipe"]
    template = json.loads((HERE / "world-builder-adaptive-reverb-cpu.json").read_text())
    return materializer.materialize(template, {
        "RECIPE_JSON": json.dumps(recipe), "TRACK_AUDIO": audio,
        "REVERB_SEED": seed, "IR_PREFIX": prefix + "-ir", "WET_PREFIX": prefix + "-wet",
    })


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--recipe", required=True, type=Path)
    parser.add_argument("--audio", required=True, help="uploaded filename relative to ComfyUI input/")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--prefix", default="audio/room")
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    try:
        graph = make_graph(json.loads(args.recipe.read_text()), args.audio, args.prefix, args.seed)
        with args.output.open("x") as handle:
            json.dump(graph, handle, indent=2)
            handle.write("\n")
    except (ValueError, OSError) as error:
        parser.error(str(error))
    print(f"Wrote {args.output}; no job submitted.")


if __name__ == "__main__":
    main()
