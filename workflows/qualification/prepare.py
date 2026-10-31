"""Prepare deterministic audio fixtures and an honest pending ledger; no network or inference."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import shutil
import struct
import wave

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
GRAPHS = {
    "layout": "workflows/world-builder-l2r-a2v.json",
    "layout_studio": "workflows/world-builder-l2r-a2v-studio.json",
    "akuspace": "workflows/ltx-i2v-a2v-akuspace.json",
}


def digest(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def graph_snapshot(key, source):
    graph = json.loads(source.read_text(encoding="utf-8"))
    if key.startswith("layout"):
        if graph["5"]["inputs"]["length"] != 193 or not math.isclose(
            graph["av0"]["inputs"]["duration"], 193 / 24, abs_tol=1e-12
        ):
            raise ValueError("Layout timing changed; update and review the qualification contract.")
        if graph["av3"]["inputs"]["value"] != 0:
            raise ValueError("The reference layout workflow must freeze its audio tokens.")
        for node in ("x1m", "x2m"):
            if graph[node]["inputs"]["mask"] != ["av3", 0]:
                raise ValueError("Both layout sampler stages must use the frozen audio mask.")
        if graph["60"]["inputs"]["audio"] != ["10", 0]:
            raise ValueError("Layout soundtrack routing changed; review the evidence contract.")
        sound = "original fitted waveform through static CPU reverb"
    else:
        if graph["30"]["inputs"]["value"] != 193 or graph["31"]["inputs"]["value"] != 24:
            raise ValueError("AKUSPACE timing changed; update and review the qualification contract.")
        trim = graph["41"]["inputs"]
        if trim["start_index"] != 0 or not math.isclose(trim["duration"], 193 / 24, abs_tol=1e-12):
            raise ValueError("AKUSPACE source trim changed; review the qualification contract.")
        for node in ("m1", "m2"):
            inputs = graph[node]["inputs"]
            if inputs["mask_init_value_audio"] != 0.5 or not math.isclose(
                inputs["end_time"], 193 / 24, abs_tol=1e-12
            ):
                raise ValueError("AKUSPACE mask/timing changed; review the qualification contract.")
        if graph["64"]["inputs"]["audio"] != ["63", 0]:
            raise ValueError("AKUSPACE must be identified as decoded, regenerated audio.")
        sound = "AKUSPACE LoRA with audio mask 0.5; decoded regenerated audio"
    models = sorted({
        value for node in graph.values() for value in node["inputs"].values()
        if isinstance(value, str) and value.endswith(".safetensors")
    })
    return {"path": f"workflow-snapshots/{source.name}", "sha256": digest(source),
            "model_filenames": models, "soundtrack": sound}


def make_audio(path, offset_frames=0):
    """Eight windowed sine bursts, no downloaded or privately owned sample audio."""
    rate, fps, frames = 48000, 24, 193
    count = frames * rate // fps
    samples = [0.0] * count
    events = []
    bands = [("low", 80), ("mid", 800), ("high", 6000)]
    half = round(0.075 * rate)
    for index, frame in enumerate((12, 36, 60, 84, 108, 132, 156, 180)):
        band, frequency = bands[index % len(bands)]
        centre = (frame + offset_frames) * rate // fps
        for local in range(-half, half + 1):
            at = centre + local
            if 0 <= at < count:
                window = (1 + math.cos(math.pi * local / half)) / 2
                samples[at] += 0.6 * window * math.cos(2 * math.pi * frequency * local / rate)
        events.append({"band": band, "frequency_hz": frequency,
                       "centre_frame": frame + offset_frames, "centre_sample": centre})
    pcm = b"".join(struct.pack("<h", round(max(-1, min(1, sample)) * 32767)) for sample in samples)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(pcm)
    return {"path": path.name, "sha256": digest(path), "sample_rate": rate,
            "samples": count, "channels": 1, "events": events}


def prepare(output, repo=REPO):
    output = Path(output).resolve()
    if output == repo.resolve() or repo.resolve() in output.parents:
        raise ValueError("Choose an output directory outside the tracked repository.")
    if output.exists():
        raise ValueError("Output already exists; use a new directory to preserve earlier evidence.")
    matrix = json.loads((HERE / "matrix.json").read_text(encoding="utf-8"))
    # Inspect every graph before writing an output directory.
    snapshots = {key: graph_snapshot(key, repo / path) for key, path in GRAPHS.items()}
    output.mkdir(parents=True)
    (output / "workflow-snapshots").mkdir()
    for path in GRAPHS.values():
        shutil.copyfile(repo / path, output / "workflow-snapshots" / Path(path).name)
    audio = {name: make_audio(output / name, shift) for name, shift in
             (("control.wav", 0), ("control-swapped.wav", 4))}
    fixture = {"version": 1, "status": "prepared_not_run", "timing": matrix["timing"],
               "duration_seconds": 193 / 24, "audio": audio, "workflows": snapshots,
               "matrix_sha256": digest(HERE / "matrix.json")}
    write_json(output / "fixture.json", fixture)
    shutil.copyfile(HERE / "matrix.json", output / "matrix.json")
    pending = [{"case_id": case["id"], "status": "not_run", "seed": None,
                "workflow": case["workflow"], "control_audio": case["control_audio"],
                "artifacts": {}, "metrics": {}, "execution": None, "reviewer": None}
               for case in matrix["cases"]]
    write_json(output / "evidence.template.json", {"version": 1, "records": pending})
    return fixture


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        prepare(args.output)
    except (KeyError, ValueError, OSError) as error:
        parser.error(str(error))
    print(f"Prepared {args.output}; no capture, GPU run, upload or paid submission occurred.")


if __name__ == "__main__":
    main()
