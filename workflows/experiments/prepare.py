"""Freeze a private moving-scene candidate bundle. Offline; never uploads or submits."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil

from common import HERE, REPO, digest, local_file, read_json, source_version, write_json
from graph import MODES, bindings, candidate, output_timing
from media import audio_contract, image_contract, probe, video_contract

SOURCE = REPO / "workflows/world-builder-l2r-a2v-studio.json"


def recipe_contract(path, frames):
    raw = Path(path).read_text(encoding="utf-8")
    if len(raw.encode()) > 2 * 1024 * 1024:
        raise ValueError("Readable recipe file exceeds 2 MiB; use the exported scene JSON.")
    # The native 64 KB cap belongs to the JSON string sent as recipe_json.
    # A readable, indented export may be larger without changing that payload.
    compact = json.dumps(json.loads(raw), separators=(",", ":"), allow_nan=False)
    spec = importlib.util.spec_from_file_location("capture_contract", REPO / "custom_nodes/director_world_builder/capture_contract.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    recipe = module.recipe_data(compact)
    if frames not in (97, 193, 241) or recipe["frames"] != frames or not isinstance(recipe.get("objects"), list):
        raise ValueError("Recipe must have objects and exactly the requested 97, 193 or 241 frames; retime and recapture explicitly.")
    return recipe


def prepare(output, recipe, rgb, look, audio, mode="layout", frames=193, seed=42,
            prompt="", negative="", audio_start=0.0, depth=None, capture_receipt=None, label=None):
    output = Path(output).expanduser().resolve()
    if output == REPO.resolve() or REPO.resolve() in output.parents:
        raise ValueError("Choose a private output directory outside the tracked repository.")
    if output.exists():
        raise ValueError("Output already exists; preserve it and choose a fresh bundle directory.")
    label = label or mode
    if not isinstance(label, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", label):
        raise ValueError("Label must be 1–64 lowercase letters/digits/hyphens.")
    paths = {"recipe": local_file(recipe, "scene recipe", {".json"}),
             "rgb": local_file(rgb, "RGB guide", {".webm"}),
             "look": local_file(look, "art-directed first-frame look", {".png", ".jpg", ".jpeg", ".webp"}),
             "audio": local_file(audio, "control/original audio", {".wav", ".flac", ".mp3", ".ogg", ".m4a"})}
    if depth:
        paths["depth"] = local_file(depth, "depth evidence", {".webm"})
    if capture_receipt:
        paths["capture_receipt"] = local_file(capture_receipt, "capture receipt", {".json"})
    scene = recipe_contract(paths["recipe"], frames)
    timing = {k: scene[k] for k in ("width", "height", "frames", "fps")}
    timing.update(duration_fraction=f"{frames}/24", duration_seconds=frames / 24,
                  last_frame_time_seconds=(frames - 1) / 24)
    probes = {"rgb": video_contract(probe(paths["rgb"], "v:0"), timing),
              "look": image_contract(probe(paths["look"], "v:0"), timing),
              "audio": audio_contract(probe(paths["audio"], "a:0"), timing, audio_start)}
    if depth:
        probes["depth"] = video_contract(probe(paths["depth"], "v:0"), timing, "Depth evidence")
    assets = {role: {"path": f"assets/{role}{path.suffix.lower()}", "sha256": digest(path),
                     "bytes": path.stat().st_size} for role, path in paths.items()}
    if capture_receipt:
        capture = read_json(paths["capture_receipt"])
        if capture.get("recipe") != scene or capture.get("sha256", {}).get("video") != assets["rgb"]["sha256"]:
            raise ValueError("Capture receipt must bind this exact recipe and RGB guide.")
        if depth and capture.get("sha256", {}).get("depth") != assets["depth"]["sha256"]:
            raise ValueError("Depth evidence does not match the capture receipt.")
        companion, evaluation = capture.get("audioCompanion") or {}, capture.get("sceneEvaluation") or {}
        if not isinstance(companion, dict) or not isinstance(evaluation, dict):
            raise ValueError("Capture audio binding must be an object.")
        control_hashes = {value for value in (companion.get("sha256"), evaluation.get("controlAudioSha256")) if value is not None}
        if control_hashes and (len(control_hashes) != 1 or audio_start != 0 or assets["audio"]["sha256"] not in control_hashes):
            raise ValueError("Use the capture's exact control-audio companion at zero offset, or recapture the chosen audio segment.")
        if capture.get("sha256", {}).get("first") == assets["look"]["sha256"]:
            raise ValueError("Supply an art-directed look derived from the first frame, not the unmodified guide frame.")
    graph = candidate(read_json(SOURCE), scene, {k: v["path"] for k, v in assets.items()},
                      mode, seed, prompt, negative, audio_start)
    roles = bindings(graph)
    timing["output"] = output_timing(graph, timing["width"], timing["height"])
    script_hashes = {path.name: digest(path) for path in HERE.glob("*.py") if not path.name.startswith("test_")}
    manifest = {"version": 1, "status": "prepared_not_run", "candidate": True,
                "label": label, "mode": mode, "seed": seed, "timing": timing, "assets": assets,
                "bindings": roles,
                "media": probes, "source": {"path": "workflows/world-builder-l2r-a2v-studio.json",
                  "sha256": digest(SOURCE), **source_version(), "experiment_scripts_sha256": script_hashes},
                "conditioning": "empty frozen audio latent" if mode == "layout" else "frozen original audio latent",
                "soundtrack": "original trimmed audio; no audio decode or room treatment; container encoding may change bytes",
                "depth": "archived evidence only; not connected to generation",
                "alignment": "first-frame look aspect checked within recorded one-output-pixel rounding bound; geometric/appearance alignment needs visual review",
                "qualification": "not a passed case in workflows/qualification/matrix.json",
                "workflow": {"path": "workflow.api.json"}, "inputs_uploaded": False}
    output.mkdir(parents=True, mode=0o700)
    os.chmod(output, 0o700)
    (output / "assets").mkdir(mode=0o700)
    for role, path in paths.items():
        destination = output / assets[role]["path"]
        shutil.copyfile(path, destination)
        os.chmod(destination, 0o600)
        if digest(destination) != assets[role]["sha256"]:
            raise ValueError(f"Input {role} changed during preparation; discard this incomplete bundle.")
    write_json(output / "workflow.api.json", graph, exclusive=True)
    manifest["workflow"]["sha256"] = digest(output / "workflow.api.json")
    write_json(output / "experiment.json", manifest, exclusive=True)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("recipe", "rgb", "audio", "output"):
        parser.add_argument(f"--{name}", type=Path, required=True)
    parser.add_argument("--look", type=Path, help="Required art-directed still derived from the guide's first frame")
    parser.add_argument("--mode", choices=MODES, default="layout")
    parser.add_argument("--frames", type=int, choices=(97, 193, 241), default=193)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--negative", default="")
    parser.add_argument("--audio-start", type=float, default=0.0)
    parser.add_argument("--depth", type=Path)
    parser.add_argument("--capture-receipt", type=Path)
    parser.add_argument("--label")
    args = parser.parse_args()
    try:
        manifest = prepare(**vars(args))
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.error(str(error))
    print(json.dumps({"status": manifest["status"], "candidate": True, "mode": manifest["mode"],
                      "frames": manifest["timing"]["frames"], "duration_fraction": manifest["timing"]["duration_fraction"],
                      "output": str(args.output), "submitted": False}))


if __name__ == "__main__":
    main()
