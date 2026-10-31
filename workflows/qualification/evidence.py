"""Check evidence completeness and declared thresholds; does not perform GPU inference or scoring."""
import argparse
import json
import math
from pathlib import Path
import re

from prepare import digest
from bindings import check_inputs, check_probe
from measurements import check_annotations, check_serial_review

TOKEN = re.compile(r"__([A-Z0-9_]+)__")


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def verified_file(root, item, label):
    if not isinstance(item, dict) or set(item) != {"path", "sha256"}:
        raise ValueError(f"{label}: supply path and sha256.")
    if not isinstance(item["path"], str) or not isinstance(item["sha256"], str):
        raise ValueError(f"{label}: invalid path or hash.")
    relative = Path(item["path"])
    path = (root / relative).resolve()
    if relative.is_absolute() or root.resolve() not in path.parents:
        raise ValueError(f"{label}: evidence must stay inside the fixture directory.")
    if not path.is_file() or path.stat().st_size == 0 or digest(path) != item["sha256"]:
        raise ValueError(f"{label}: missing, empty or hash-mismatched file.")
    return path


def matches_template(actual, expected):
    """Only full-value placeholders may change in the reference workflow."""
    if isinstance(expected, str) and (match := TOKEN.fullmatch(expected)):
        name = match[1]
        if "SEED" in name:
            bits = 32 if name == "REVERB_SEED" else 64
            return type(actual) is int and 0 <= actual < 2 ** bits
        return isinstance(actual, str) and TOKEN.search(actual) is None
    if type(actual) is not type(expected):
        return False
    if isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(matches_template(actual[k], v) for k, v in expected.items())
    if isinstance(expected, list):
        return len(actual) == len(expected) and all(matches_template(a, b) for a, b in zip(actual, expected))
    return actual == expected


def check_metric(name, value, rule):
    if "equals" in rule:
        expected = rule["equals"]
        if type(value) is not type(expected) or value != expected:
            raise ValueError(f"{name}: expected {expected!r}; record a failure rather than inventing a pass.")
        return
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError(f"{name}: needs a finite measured number.")
    if value < rule.get("min", -math.inf) or value > rule.get("max", math.inf):
        raise ValueError(f"{name}: measured value is outside the proposed acceptance range.")


def check_record(root, fixture, matrix, case, record):
    if record.get("status") != "measured":
        raise ValueError(f"{case['id']}: not measured; a prepared fixture is not GPU evidence.")
    if record.get("workflow") != case["workflow"] or record.get("control_audio") != case["control_audio"]:
        raise ValueError(f"{case['id']}: wrong workflow or control source.")
    if type(record.get("seed")) is not int or not 0 <= record["seed"] < 2 ** 64:
        raise ValueError(f"{case['id']}: record the actual unsigned 64-bit seed.")
    if not isinstance(record.get("reviewer"), str) or not record["reviewer"].strip():
        raise ValueError(f"{case['id']}: name the human reviewer.")
    audio = fixture["audio"][case["control_audio"]]
    verified_file(root, {k: audio[k] for k in ("path", "sha256")}, "immutable control audio")
    execution = record.get("execution")
    if not isinstance(execution, dict) or execution.get("kind") not in ("local_gpu", "comfy_deployment", "cpu"):
        raise ValueError(f"{case['id']}: record the actual execution kind.")
    if ("generated_video" in case["artifacts"] or case.get("requires_model")) and execution["kind"] == "cpu":
        raise ValueError(f"{case['id']}: CPU preparation does not qualify model-generated media.")
    if not isinstance(execution.get("hardware"), str) or not execution["hardware"].strip():
        raise ValueError(f"{case['id']}: record actual hardware.")
    check_metric("wall_seconds", execution.get("wall_seconds"), {"min": 0.000001})
    artifacts = record.get("artifacts")
    if not isinstance(artifacts, dict):
        raise ValueError(f"{case['id']}: missing artifacts.")
    required = [*case["artifacts"], "workflow_json", "software_manifest", "execution_log"]
    for name in required:
        if name not in artifacts:
            raise ValueError(f"{name}: supply path and sha256.")
    files = {name: verified_file(root, item, name) for name, item in artifacts.items()}
    actual = read_json(files["workflow_json"])
    if not isinstance(actual, dict) or not actual or TOKEN.search(json.dumps(actual)):
        raise ValueError("The executed workflow must be a nonempty resolved JSON graph.")
    if case["workflow"] != "candidate":
        template = fixture["workflows"][case["workflow"]]
        template_path = verified_file(root, {k: template[k] for k in ("path", "sha256")}, "workflow snapshot")
        if not matches_template(actual, read_json(template_path)):
            raise ValueError("Executed graph differs from its reference beyond filled inputs; declare a candidate experiment.")
        seed_nodes = ("80", "90") if case["workflow"].startswith("layout") else ("50", "80")
        if any(actual[node]["inputs"]["noise_seed"] != record["seed"] for node in seed_nodes):
            raise ValueError("Recorded seed must match both executed sampler stages.")
    check_inputs(root, actual, fixture, case, artifacts, files, record["reviewer"])
    if "generated_video" in case["artifacts"]:
        check_probe(actual, case, artifacts, files)
    rules = {**(matrix["motion_checks"] if case.get("metrics") == "motion" else {}), **case.get("checks", {})}
    metrics = record.get("metrics")
    if not isinstance(metrics, dict):
        raise ValueError(f"{case['id']}: missing measurements.")
    for name, rule in rules.items():
        check_metric(name, metrics.get(name), rule)
    measured = read_json(files["measurements"])
    media = "generated_video" if "generated_video" in artifacts else "processed_audio"
    if not isinstance(measured, dict) or measured.get("metrics") != metrics or measured.get("reviewer") != record["reviewer"]:
        raise ValueError("Measurement artifact must agree with the recorded metrics and reviewer.")
    if measured.get("media_sha256") != artifacts[media]["sha256"] or not measured.get("method"):
        raise ValueError("Measurements must name their method and bind the reviewed media hash.")
    identities = {"control_audio": audio["sha256"], **{name: artifacts[name]["sha256"] for name in
                  ("guide_rgb", "control_curves", "look", "capture_receipt", "reference_audio", "cpu_audio", "akuspace_audio")
                  if name in artifacts}}
    if measured.get("input_sha256") != identities:
        raise ValueError("Measurements must bind every reviewed guide, control, look and audio reference.")
    if "guide_rgb" in case["artifacts"]:
        check_annotations(measured, fixture, case, metrics)
    if case["id"] == "serial_cpu_akuspace":
        check_serial_review(measured)
    software = read_json(files["software_manifest"])
    if not isinstance(software, dict) or not software.get("versions"):
        raise ValueError("Record software versions and, for model runs, model hashes.")
    if execution["kind"] != "cpu":
        models = software.get("models")
        if not isinstance(models, dict) or not models or any(
            not isinstance(v, str) or re.fullmatch(r"[0-9a-f]{64}", v) is None for v in models.values()
        ):
            raise ValueError("Model execution requires actual SHA-256 model hashes.")
        if case["workflow"] != "candidate" and not set(template["model_filenames"]).issubset(models):
            raise ValueError("Model manifest omits a required workflow model.")
    return record


def validate(root, evidence, phase="pilot", case_id=None, dynamic_sound=False):
    root = Path(root).resolve()
    fixture, matrix = read_json(root / "fixture.json"), read_json(root / "matrix.json")
    if not all(isinstance(value, dict) for value in (fixture, matrix, evidence)):
        raise ValueError("Fixture, matrix and evidence must be JSON objects.")
    if fixture.get("version") != 1 or evidence.get("version") != 1:
        raise ValueError("Unknown evidence/fixture version.")
    if digest(root / "matrix.json") != fixture["matrix_sha256"]:
        raise ValueError("The acceptance matrix changed after fixture preparation.")
    if fixture.get("timing") != {"fps": 24, "frames": 193, "sample_rate": 48000}:
        raise ValueError("Unsupported fixture timing; parameterize the production duration contract first.")
    all_cases = matrix["cases"]
    if case_id and case_id not in {c["id"] for c in all_cases}:
        raise ValueError("Unknown qualification case.")
    selected = [c for c in all_cases if c["id"] == case_id] if case_id else [
        c for c in all_cases if c["phase"] == "required" or
        (dynamic_sound and c["phase"] == "required_for_dynamic_sound")]
    records = evidence.get("records")
    if not isinstance(records, list):
        raise ValueError("Evidence must contain a records list.")
    accepted = []
    for case in selected:
        runs = [r for r in records if isinstance(r, dict) and r.get("case_id") == case["id"]]
        needed = matrix["release_seed_count"] if phase == "release" and case.get("metrics") == "motion" else 1
        if len(runs) < needed:
            raise ValueError(f"{case['id']}: requires {needed} measured run(s); found {len(runs)}.")
        checked = [check_record(root, fixture, matrix, case, r) for r in runs]
        if len({r["seed"] for r in checked}) < needed:
            raise ValueError(f"{case['id']}: repeat on {needed} distinct seeds.")
        accepted.extend(checked)
    # A new soundtrack requires a new guide, not a relabelled old capture.
    for swap in (r for r in accepted if r["case_id"] == "audio_swap"):
        base = next((r for r in records if isinstance(r, dict) and r.get("case_id") == "combined_funny" and r.get("seed") == swap["seed"]), None)
        if not base or base.get("status") != "measured":
            raise ValueError("audio_swap: include the measured combined_funny reference at the same seed.")
        base_case = next(c for c in all_cases if c["id"] == "combined_funny")
        check_record(root, fixture, matrix, base_case, base)
        for role in ("guide_rgb", "control_curves", "capture_receipt"):
            if swap["artifacts"][role]["sha256"] == base["artifacts"][role]["sha256"]:
                raise ValueError(f"audio_swap: {role} was reused after control audio changed.")
    return {"scope": case_id or phase, "records_checked": len(accepted),
            "result": "evidence_complete_within_declared_thresholds",
            "limit": "Checks supplied files and measurements; does not independently judge model fidelity or audio quality."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--phase", choices=("pilot", "release"), default="pilot")
    parser.add_argument("--case")
    parser.add_argument("--dynamic-sound", action="store_true")
    args = parser.parse_args()
    try:
        result = validate(args.fixture, read_json(args.evidence), args.phase, args.case, args.dynamic_sound)
    except (KeyError, TypeError, ValueError, OSError) as error:
        parser.error(str(error))
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
