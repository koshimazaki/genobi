"""Synthetic fixtures only; never evidence of model execution."""
import json
from pathlib import Path
from unittest.mock import patch

from common import read_json
from prepare import SOURCE, prepare


def scene(frames=193):
    return {"version": 1, "fps": 24, "width": 384, "height": 256, "frames": frames,
            "objects": [], "sceneMotion": {"version": 1, "states": []}}


def video_metadata(timing=None):
    timing = timing or scene()
    return {"streams": [{"codec_type": "video", "width": timing["width"], "height": timing["height"],
                         "r_frame_rate": "24/1", "avg_frame_rate": "24/1", "nb_read_frames": str(timing["frames"]),
                         "duration": str(timing["frames"] / 24)}],
            "frames": [{"best_effort_timestamp_time": str(i / 24)} for i in range(timing["frames"])]}


def audio_metadata(duration=193 / 24):
    return {"streams": [{"codec_type": "audio", "sample_rate": "48000", "channels": 2, "duration": str(duration)}]}


def make_bundle(directory, mode="layout"):
    directory = Path(directory)
    inputs = directory / "inputs"
    inputs.mkdir(exist_ok=True)
    (inputs / "recipe.json").write_text(json.dumps(scene()))
    for filename in ("rgb.webm", "look.png", "audio.wav"):
        (inputs / filename).write_bytes(b"SYNTHETIC TEST BYTES: NOT MEDIA")

    def mock_probe(path, kind):
        if kind == "a:0":
            return audio_metadata()
        return video_metadata()

    with patch("prepare.probe", side_effect=mock_probe):
        prepare(directory / "bundle", inputs / "recipe.json", inputs / "rgb.webm", inputs / "look.png",
                inputs / "audio.wav", mode=mode, prompt="Synthetic unit-test look.")
    return directory / "bundle"


def schemas(graph):
    info = {}
    for node in graph.values():
        schema = info.setdefault(node["class_type"], {"input": {"required": {}}, "output": ["*"] * 6})
        for name, value in node["inputs"].items():
            if isinstance(value, str) and value.endswith(".safetensors"):
                choices = schema["input"]["required"].setdefault(name, [[]])[0]
                if value not in choices:
                    choices.append(value)
    return info


class FakeComfy:
    base = "http://127.0.0.1:8188"

    def __init__(self, graph):
        self.catalogue = schemas(graph)
        self.posts = 0
        self.uploads = []
        self.failure = None
        self.queued = {"queue_running": [], "queue_pending": []}
        self.histories = {}

    def info(self):
        return self.catalogue

    def stats(self):
        return {"system": {"comfyui_version": "MOCK-NOT-INSTALLED"}}

    def upload(self, path, request_id, role, expected_sha256):
        self.uploads.append(role)
        return f"genobi-experiments/{request_id}/{role}{path.suffix}"

    def submit(self, graph, request_id):
        self.posts += 1
        self.graph = graph
        self.request_id = request_id
        if self.failure:
            raise self.failure
        return {"prompt_id": "server-assigned-id"}

    def queue(self):
        return self.queued

    def history(self, prompt_id):
        return {prompt_id: self.histories[prompt_id]} if prompt_id in self.histories else {}


def source():
    return read_json(SOURCE)
