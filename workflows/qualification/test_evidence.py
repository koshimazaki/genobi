"""Regressions use synthetic complete records; these tests are never GPU qualification."""
import copy
from pathlib import Path
import tempfile
import unittest

from evidence import validate
from mock_evidence import MockRun
from prepare import prepare


class CompleteEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "fixture"
        prepare(self.root)
        self.run = MockRun(self.root)

    def validate(self, run=None, extra=()):
        run = run or self.run
        return validate(self.root, {"version": 1, "records": [run.record, *extra]}, case_id=run.case["id"])

    def test_complete_mock_record_exercises_positive_contract(self):
        result = self.validate()
        self.assertEqual(result["records_checked"], 1)
        self.assertEqual(result["result"], "evidence_complete_within_declared_thresholds")
        self.assertIn("does not independently", result["limit"])

    def test_changed_graph_inputs_do_not_match_fresh_attached_artifacts(self):
        original_graph = self.run.read("workflow_json")
        for node, field in (("1", "capture_file"), ("8", "image"), ("40", "audio")):
            with self.subTest(input=f"{node}.{field}"):
                graph = copy.deepcopy(original_graph)
                graph[node]["inputs"][field] = "uploads/stale-media"
                self.run.save("workflow_json", graph)
                self.run.rebind_workflow()
                with self.assertRaisesRegex(ValueError, "filename/hash"):
                    self.validate()

    def test_rewritten_graph_recipe_does_not_match_capture(self):
        graph = self.run.read("workflow_json")
        graph["1"]["inputs"]["recipe_json"] = '{"version":1}'
        self.run.save("workflow_json", graph)
        self.run.rebind_workflow()
        with self.assertRaisesRegex(ValueError, "recipe differs"):
            self.validate()

    def test_missing_input_mappings_fail_closed(self):
        original = self.run.read("executed_inputs")
        for role in (None, "control_audio", "guide_rgb", "look"):
            with self.subTest(role=role):
                manifest = copy.deepcopy(original)
                if role is None:
                    manifest["bindings"] = {}
                else:
                    del manifest["bindings"][role]
                self.run.save("executed_inputs", manifest)
                with self.assertRaisesRegex(ValueError, "bindings|binding"):
                    self.validate()

    def test_depth_used_by_graph_requires_real_bound_depth_artifact(self):
        graph = self.run.read("workflow_json")
        graph["1"]["inputs"]["depth_file"] = "uploads/missing-depth.webm"
        self.run.save("workflow_json", graph)
        self.run.rebind_workflow()
        with self.assertRaisesRegex(ValueError, "guide_depth"):
            self.validate()

    def test_capture_must_contain_matching_audio_and_curves(self):
        receipt = self.run.read("capture_receipt")
        receipt["audioCompanion"]["sha256"] = "f" * 64
        self.run.save("capture_receipt", receipt)
        with self.assertRaisesRegex(ValueError, "matching WAV"):
            self.validate()

    def test_curve_distribution_cannot_be_replaced_independently(self):
        curves = self.run.read("control_curves")
        curves["envelope"][12] = 0.5
        self.run.save("control_curves", curves)
        with self.assertRaisesRegex(ValueError, "curves/routes"):
            self.validate()

    def test_measurements_bind_actual_guide_and_curves(self):
        measured = self.run.read("measurements")
        measured["input_sha256"]["guide_rgb"] = "f" * 64
        self.run.save("measurements", measured)
        with self.assertRaisesRegex(ValueError, "Measurements must bind"):
            self.validate()

    def test_decoded_count_cadence_and_duration_are_checked(self):
        original = self.run.read("media_probe")
        for field, value in (("frames", 192), ("fps", 30), ("duration_seconds", 7.9), ("frame_pts_seconds", [i / 30 for i in range(193)])):
            with self.subTest(field=field):
                probe = copy.deepcopy(original)
                probe["generated_video"][field] = value
                self.run.save("media_probe", probe)
                with self.assertRaisesRegex(ValueError, "Decoded"):
                    self.validate()

    def test_landmark_maximum_is_required_and_enforced(self):
        for value in (None, -0.1, 0.02001):
            with self.subTest(value=value):
                self.run.record["metrics"]["max_rigid_landmark_error_diagonal"] = value
                with self.assertRaisesRegex(ValueError, "max_rigid"):
                    self.validate()

    def test_unexplained_disappearance_cannot_pass(self):
        measured = self.run.read("measurements")
        measured["annotations"]["landmarks"][0]["observed_xy"][12] = None
        self.run.save("measurements", measured)
        with self.assertRaisesRegex(ValueError, "occlusion ledger"):
            self.validate()

    def test_scalars_need_full_observation_distributions(self):
        original = self.run.read("measurements")
        for key in ("landmarks", "events", "motion_series"):
            with self.subTest(key=key):
                measured = copy.deepcopy(original)
                del measured["annotations"][key]
                self.run.save("measurements", measured)
                with self.assertRaises(ValueError):
                    self.validate()

    def test_annotation_errors_cannot_hide_behind_passing_scalars(self):
        measured = self.run.read("measurements")
        measured["annotations"]["landmarks"][0]["observed_xy"][12][0] += 0.1
        self.run.save("measurements", measured)
        with self.assertRaisesRegex(ValueError, "scalar does not agree"):
            self.validate()

    def test_dropped_or_duplicated_events_cannot_hide_a_miss(self):
        original = self.run.read("measurements")
        for change in ("drop", "duplicate"):
            with self.subTest(change=change):
                measured = copy.deepcopy(original)
                if change == "drop":
                    measured["annotations"]["events"].pop()
                else:
                    event = copy.deepcopy(measured["annotations"]["events"][0])
                    event["id"] = "duplicate-target"
                    measured["annotations"]["events"].append(event)
                self.run.save("measurements", measured)
                with self.assertRaisesRegex(ValueError, "every scheduled target exactly once"):
                    self.validate()

    def test_source_error_cannot_hide_generated_total_lag(self):
        measured = self.run.read("measurements")
        event = measured["annotations"]["events"][0]
        event["source_frame"] += 1
        event["generated_frame"] += 3
        self.run.record["metrics"].update(source_max_frame_error=1, max_event_lag_frames=2)
        measured["metrics"] = self.run.record["metrics"]
        self.run.save("measurements", measured)
        with self.assertRaisesRegex(ValueError, "max_event_lag_frames: scalar"):
            self.validate()

    def test_soundtrack_requires_an_explained_bounded_offset(self):
        original = self.run.read("media_probe")
        for field, value in (("start_seconds", 0.1), ("duration_seconds", 8.2), ("unexplained_offset", True)):
            with self.subTest(field=field):
                probe = copy.deepcopy(original)
                probe["generated_video"]["soundtrack"][field] = value
                self.run.save("media_probe", probe)
                with self.assertRaisesRegex(ValueError, "soundtrack"):
                    self.validate()

    def test_three_states_is_fixture_specific_and_ordered(self):
        run = MockRun(self.root, "three_states")
        self.validate(run)
        measured = run.read("measurements")
        measured["annotations"]["states"][1]["observed_id"] = "state-2"
        run.save("measurements", measured)
        with self.assertRaisesRegex(ValueError, "wrong order"):
            self.validate(run)

    def test_swap_pair_requires_new_guide_and_new_curves(self):
        base, swapped = MockRun(self.root, "combined_funny"), MockRun(self.root, "audio_swap")
        self.validate(swapped, [base.record])
        # Keep swapped capture/audio identity internally consistent but reuse baseline curves.
        baseline_curves = base.read("control_curves")
        swapped.save("control_curves", baseline_curves)
        recipe = swapped.read("source_recipe")
        recipe.update(baseline_curves)
        swapped.save("source_recipe", recipe)
        swapped.refresh_capture()
        with self.assertRaisesRegex(ValueError, "control_curves was reused"):
            self.validate(swapped, [base.record])


if __name__ == "__main__":
    unittest.main()
