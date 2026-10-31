"""UNIT TEST SUPPORT ONLY: synthetic records, dummy video bytes, no GPU measurements.

Tests write these mocks exclusively inside TemporaryDirectory and never release them.
The complete positive fixture exercises consistency checks, not inference quality.
"""
import copy
import json
from pathlib import Path

from prepare import digest, write_json


class MockRun:
    def __init__(self, root, case_id="object_motion", seed=42):
        self.root = Path(root)
        self.fixture = json.loads((self.root / "fixture.json").read_text())
        self.matrix = json.loads((self.root / "matrix.json").read_text())
        self.case = next(c for c in self.matrix["cases"] if c["id"] == case_id)
        self.directory = self.root / f"unit-test-only/{case_id}-{seed}"
        self.directory.mkdir(parents=True)
        self.record = {"case_id": case_id, "status": "measured", "seed": seed,
                       "workflow": self.case["workflow"], "control_audio": self.case["control_audio"],
                       "reviewer": "unit-test-only", "artifacts": {},
                       "execution": {"kind": "local_gpu", "hardware": "MOCK, NO GPU EXECUTED", "wall_seconds": 1}}
        self.build(seed)

    @property
    def artifacts(self):
        return self.record["artifacts"]

    def save(self, role, value):
        path = self.directory / role
        if isinstance(value, bytes):
            path.write_bytes(value)
        else:
            write_json(path, value)
        self.artifacts[role] = {"path": str(path.relative_to(self.root)), "sha256": digest(path)}

    def read(self, role):
        return json.loads((self.root / self.artifacts[role]["path"]).read_text())

    def rebind_workflow(self):
        manifest = self.read("executed_inputs")
        manifest["workflow_sha256"] = self.artifacts["workflow_json"]["sha256"]
        self.save("executed_inputs", manifest)

    def refresh_capture(self):
        receipt = self.read("capture_receipt")
        receipt["recipe"] = self.read("source_recipe")
        self.save("capture_receipt", receipt)
        graph = self.read("workflow_json")
        graph["1"]["inputs"]["recipe_json"] = json.dumps(receipt["recipe"])
        self.save("workflow_json", graph)
        manifest = self.read("executed_inputs")
        for role in ("capture_receipt", "source_recipe", "control_curves"):
            manifest["capture"][role] = self.artifacts[role]["sha256"]
        manifest["workflow_sha256"] = self.artifacts["workflow_json"]["sha256"]
        self.save("executed_inputs", manifest)
        measured = self.read("measurements")
        measured["input_sha256"] = self.input_hashes()
        self.save("measurements", measured)

    def input_hashes(self):
        return {"control_audio": self.fixture["audio"][self.case["control_audio"]]["sha256"],
                **{role: self.artifacts[role]["sha256"] for role in
                   ("guide_rgb", "control_curves", "look", "capture_receipt")}}

    def build(self, seed):
        control = self.fixture["audio"][self.case["control_audio"]]
        curve = [max(max(0, 1 - abs(i - e["centre_frame"]) / 4) for e in control["events"]) for i in range(193)]
        curves = {"envelope": curve, "bandEnvelopes": {k: curve for k in ("low", "mid", "high")},
                  "audioRoutes": [{"target": "prop", "parameter": "height", "band": "low"}]}
        recipe = {"version": 1, "width": 1024, "height": 576, "fps": 24, "frames": 193,
                  "objects": [], **curves}
        self.save("source_recipe", recipe)
        self.save("control_curves", curves)
        self.save("guide_rgb", b"MOCK WEBM, NOT REAL VIDEO " + self.case["control_audio"].encode())
        self.save("generated_video", b"MOCK MP4, NOT REAL VIDEO " + self.case["id"].encode())
        self.save("first_frame", b"MOCK FIRST FRAME, NOT REAL PNG")
        self.save("look", b"MOCK LOOK, NOT REAL PNG")
        self.save("captured_audio", (self.root / control["path"]).read_bytes())
        receipt = {"version": 1, "recipe": recipe, "frameCount": 193, "duration": 193 / 24,
                   "sha256": {"video": self.artifacts["guide_rgb"]["sha256"], "first": self.artifacts["first_frame"]["sha256"]},
                   "audioCompanion": {"sha256": self.artifacts["captured_audio"]["sha256"]}}
        self.save("capture_receipt", receipt)
        substitutions = {"__TAKE_WEBM__": "uploads/mock-guide.webm", "__REFERENCE_PNG__": "uploads/mock-look.png",
                         "__TRACK_AUDIO__": "uploads/mock-dry.wav", "__RECIPE_JSON__": json.dumps(recipe), "__DEPTH_WEBM__": ""}
        template = self.fixture["workflows"][self.case["workflow"]]
        graph = json.loads((self.root / template["path"]).read_text())

        def resolve(value):
            if isinstance(value, dict):
                return {k: resolve(v) for k, v in value.items()}
            if isinstance(value, list):
                return [resolve(v) for v in value]
            if isinstance(value, str) and value.startswith("__"):
                return seed if "SEED" in value else substitutions.get(value, "mock-unit-test-only")
            return value

        graph = resolve(graph)
        self.save("workflow_json", graph)
        bindings = {}
        for role, location in (("control_audio", "40.audio"), ("guide_rgb", "1.capture_file"), ("look", "8.image")):
            node, key = location.split(".")
            bindings[role] = {"graph_input": location, "filename": graph[node]["inputs"][key],
                              "sha256": control["sha256"] if role == "control_audio" else self.artifacts[role]["sha256"]}
        capture = {role: self.artifacts[role]["sha256"] for role in
                   ("capture_receipt", "source_recipe", "control_curves", "first_frame", "look")}
        capture.update(control_audio=control["sha256"], reviewer="unit-test-only", alignment="look derived from matching first frame")
        self.save("executed_inputs", {"version": 1, "workflow_sha256": self.artifacts["workflow_json"]["sha256"],
                                     "source_control_sha256": control["sha256"], "bindings": bindings, "capture": capture})
        probe = {"method": "SYNTHETIC UNIT TEST, NO MEDIA DECODE"}
        for role in ("guide_rgb", "generated_video"):
            width, height = (1024, 576) if role == "guide_rgb" else tuple(2 * graph["9"]["inputs"][f"resize_type.{k}"] for k in ("width", "height"))
            probe[role] = {"sha256": self.artifacts[role]["sha256"], "width": width, "height": height,
                           "frames": 193, "fps": 24, "duration_seconds": 193 / 24,
                           "frame_pts_seconds": [i / 24 for i in range(193)]}
            if role == "generated_video":
                probe[role]["soundtrack"] = {"start_seconds": 0, "duration_seconds": 193 / 24,
                                              "unexplained_offset": False, "offset_review": "MOCK, NO DECODE"}
        self.save("media_probe", probe)
        self.save("execution_log", b"UNIT TEST ONLY, NO GPU EXECUTED")
        self.save("software_manifest", {"versions": {"app": "mock-unit-test-only"},
                                        "models": {name: "1" * 64 for name in template["model_filenames"]}})
        metrics = {"source_max_frame_error": 0, "generated_motion_correlation": 1,
                   "max_event_lag_frames": 0, "retained_displacement_ratio": 1,
                   "visual_review_pass": True, "no_unexplained_disappearance": True, "no_unplanned_replacement": True}
        for name, rule in self.case.get("checks", {}).items():
            metrics[name] = rule["equals"] if "equals" in rule else rule.get("min", 0)
        points = [[0.25 + v * 0.1, 0.5] for v in curve]
        annotations = {"method": "SYNTHETIC UNIT TEST, NO HUMAN OR CV REVIEW", "landmarks": [],
                       "events": [{"id": f"event-{i}", "expected_frame": t, "source_frame": t,
                                   "generated_frame": t} for i, t in enumerate(self.case["expected_event_frames"])],
                       "motion_series": {"definition": "MOCK normalized prop height", "expected": curve, "observed": curve}}
        for kind in ("rigid", "wall"):
            if f"max_{kind}_landmark_error_diagonal" in self.case.get("checks", {}):
                annotations["landmarks"].append({"id": f"{kind}-point", "kind": kind,
                                                 "expected_xy": points, "observed_xy": copy.deepcopy(points), "occlusions": []})
        if "expected_state_frames" in self.case:
            annotations["states"] = [{"expected_id": f"state-{i}", "observed_id": f"state-{i}",
                                      "expected_frame": t, "observed_frame": t} for i, t in enumerate(self.case["expected_state_frames"])]
        self.record["metrics"] = metrics
        self.save("measurements", {"method": "SYNTHETIC UNIT TEST, NO MEASUREMENT", "reviewer": "unit-test-only",
                                   "media_sha256": self.artifacts["generated_video"]["sha256"],
                                   "input_sha256": self.input_hashes(), "metrics": metrics, "annotations": annotations})
