"""Offline contract tests only. No test here produces or qualifies generated media."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import wave

from evidence import check_metric, matches_template, validate, verified_file
from prepare import GRAPHS, REPO, digest, graph_snapshot, make_audio, prepare, write_json


class QualificationTests(unittest.TestCase):
    def test_audio_is_deterministic_and_has_exact_frame_duration(self):
        with tempfile.TemporaryDirectory() as tmp:
            one, two = Path(tmp) / "a.wav", Path(tmp) / "b.wav"
            first, second = make_audio(one), make_audio(two)
            self.assertEqual(first["sha256"], second["sha256"])
            with wave.open(str(one)) as audio:
                self.assertEqual(audio.getnframes(), 193 * 48000 // 24)
                self.assertEqual(audio.getframerate(), 48000)
                self.assertEqual(audio.getnchannels(), 1)
                self.assertEqual(audio.getsampwidth(), 2)

    def test_swap_moves_every_event_and_changes_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = make_audio(Path(tmp) / "a.wav")
            second = make_audio(Path(tmp) / "b.wav", 4)
            self.assertNotEqual(first["sha256"], second["sha256"])
            self.assertEqual(first["samples"], second["samples"])
            self.assertTrue(all(b["centre_frame"] - a["centre_frame"] == 4
                                for a, b in zip(first["events"], second["events"])))

    def test_preparation_is_pending_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "fixture"
            fixture = prepare(output)
            self.assertEqual(fixture["status"], "prepared_not_run")
            evidence = json.loads((output / "evidence.template.json").read_text())
            self.assertTrue(all(r["status"] == "not_run" for r in evidence["records"]))
            with self.assertRaisesRegex(ValueError, "not measured"):
                validate(output, evidence)
            with self.assertRaisesRegex(ValueError, "already exists"):
                prepare(output)

    def test_rejects_output_inside_repository(self):
        with self.assertRaisesRegex(ValueError, "outside"):
            prepare(REPO / "fixture-must-not-be-created")

    def test_rejects_changed_audio_masks_and_duration(self):
        original = json.loads((REPO / GRAPHS["layout_studio"]).read_text())
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "graph.json"
            for node, field, value in (("av3", "value", 0.5), ("av0", "duration", 3.0)):
                graph = copy.deepcopy(original)
                graph[node]["inputs"][field] = value
                write_json(path, graph)
                with self.assertRaises(ValueError):
                    graph_snapshot("layout_studio", path)

    def test_akuspace_source_trim_is_part_of_the_contract(self):
        original = json.loads((REPO / GRAPHS["akuspace"]).read_text())
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "graph.json"
            for field, value in (("start_index", 1.0), ("duration", 3.0)):
                graph = copy.deepcopy(original)
                graph["41"]["inputs"][field] = value
                write_json(path, graph)
                with self.assertRaisesRegex(ValueError, "source trim"):
                    graph_snapshot("akuspace", path)

    def test_graph_materialization_cannot_change_fixed_inputs(self):
        template = {"x": {"inputs": {"seed": "__SEED_STAGE_1__", "value": 193, "file": "__TRACK_AUDIO__"}}}
        actual = {"x": {"inputs": {"seed": 42, "value": 193, "file": "control.wav"}}}
        self.assertTrue(matches_template(actual, template))
        actual["x"]["inputs"]["value"] = 73
        self.assertFalse(matches_template(actual, template))
        actual["x"]["inputs"]["value"] = 193
        actual["x"]["inputs"]["seed"] = True
        self.assertFalse(matches_template(actual, template))

    def test_rejects_nonfinite_and_boolean_numeric_metrics(self):
        for value in (None, True, float("nan"), float("inf"), -1, 3):
            with self.assertRaises(ValueError):
                check_metric("lag", value, {"min": 0, "max": 2})
        check_metric("lag", 2, {"min": 0, "max": 2})
        with self.assertRaises(ValueError):
            check_metric("review", 1, {"equals": True})

    def test_rejects_missing_tampered_and_external_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "proof.txt"
            path.write_text("recorded data")
            item = {"path": "proof.txt", "sha256": digest(path)}
            self.assertEqual(verified_file(root, item, "proof"), path)
            path.write_text("changed data")
            with self.assertRaisesRegex(ValueError, "hash-mismatched"):
                verified_file(root, item, "proof")
            with self.assertRaisesRegex(ValueError, "inside"):
                verified_file(root, {"path": "../outside", "sha256": "0" * 64}, "proof")

    def test_rejects_rewritten_acceptance_thresholds(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "fixture"
            prepare(output)
            matrix = json.loads((output / "matrix.json").read_text())
            matrix["motion_checks"]["max_event_lag_frames"]["max"] = 100
            write_json(output / "matrix.json", matrix)
            with self.assertRaisesRegex(ValueError, "matrix changed"):
                validate(output, {"version": 1, "records": []})

    def test_release_needs_three_runs_and_unknown_case_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "fixture"
            prepare(output)
            evidence = {"version": 1, "records": []}
            with self.assertRaisesRegex(ValueError, "3 measured"):
                validate(output, evidence, phase="release")
            with self.assertRaisesRegex(ValueError, "Unknown qualification"):
                validate(output, evidence, case_id="invented")

    def test_measured_label_without_artifacts_does_not_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "fixture"
            prepare(output)
            evidence = json.loads((output / "evidence.template.json").read_text())
            record = evidence["records"][0]
            record.update(status="measured", seed=42, reviewer="unit-test-only",
                          execution={"kind": "local_gpu", "hardware": "mock", "wall_seconds": 1})
            with self.assertRaisesRegex(ValueError, "supply path and sha256"):
                validate(output, evidence, case_id="object_motion")


if __name__ == "__main__":
    unittest.main()
