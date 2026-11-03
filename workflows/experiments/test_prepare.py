"""Offline timing and graph contracts. These tests do not qualify LTX output."""
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch

from common import digest, read_json
from graph import STATIC_NODES, candidate
from media import audio_contract, image_contract, video_contract
from prepare import prepare, recipe_contract
from test_support import audio_metadata, make_bundle, scene, source, video_metadata


class CandidateTests(unittest.TestCase):
    def graph(self, mode="layout", frames=193):
        return candidate(source(), scene(frames), {"rgb": "rgb.webm", "look": "look.png", "audio": "track.wav"},
                         mode=mode, prompt="A polished fruit sculpture.")

    def test_moving_scene_derivative_cannot_enter_static_acoustics(self):
        graph = self.graph()
        self.assertFalse(STATIC_NODES & graph.keys())
        self.assertFalse(any(node["class_type"].startswith(("DirectorSceneAcoustics", "DirectorSceneReverb", "Koshi_")) for node in graph.values()))
        self.assertEqual(graph["31"]["inputs"]["text"], ["30", 0])

    def test_audio_comparison_changes_only_conditioning_not_soundtrack(self):
        baseline, conditioned = self.graph(), self.graph("layout-audio")
        self.assertEqual(baseline["av2"]["class_type"], "LTXVEmptyLatentAudio")
        self.assertEqual(conditioned["av2"]["class_type"], "LTXVAudioVAEEncode")
        for graph in (baseline, conditioned):
            self.assertEqual(graph["60"]["inputs"]["audio"], ["av0", 0])
            self.assertEqual(graph["av3"]["inputs"]["value"], 0)
            self.assertEqual(graph["1"]["inputs"]["depth_file"], "")
            for node in ("x1m", "x2m"):
                self.assertEqual(graph[node]["inputs"]["mask"], ["av3", 0])
        different = {key for key in baseline if baseline[key] != conditioned[key]}
        self.assertEqual(different, {"av2", "61"})

    def test_97_frame_option_retimes_all_scalar_frame_and_audio_lengths(self):
        graph = self.graph(frames=97)
        self.assertEqual(graph["5"]["inputs"]["length"], 97)
        self.assertEqual(graph["av0"]["inputs"]["duration"], 97 / 24)
        self.assertEqual(graph["av2"]["inputs"]["frames_number"], 97)

    def test_changed_source_is_not_silently_rewired(self):
        changed = source()
        changed["10"]["class_type"] = "DifferentNode"
        with self.assertRaisesRegex(ValueError, "Studio source changed"):
            candidate(changed, scene(), {}, prompt="Test")

    def test_missing_look_fails_before_output_or_media_work(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "recipe.json").write_text("{}")
            (root / "rgb.webm").write_bytes(b"test")
            with self.assertRaisesRegex(ValueError, "Missing art-directed first-frame look"):
                prepare(root / "output", root / "recipe.json", root / "rgb.webm", None, None)
            self.assertFalse((root / "output").exists())

    def test_bundle_is_frozen_candidate_with_private_modes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = make_bundle(temp)
            manifest = read_json(root / "experiment.json")
            self.assertEqual(manifest["status"], "prepared_not_run")
            self.assertEqual(manifest["timing"]["duration_fraction"], "193/24")
            self.assertEqual(manifest["media"]["audio"]["samples"], 386000)
            self.assertEqual((root.stat().st_mode & 0o777), 0o700)
            self.assertEqual(((root / "experiment.json").stat().st_mode & 0o777), 0o600)

    def test_readable_recipe_is_checked_by_its_compact_transport_size(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "recipe.json"
            path.write_text(json.dumps(scene(), indent=6000))
            self.assertGreater(path.stat().st_size, 64000)
            self.assertEqual(recipe_contract(path, 193), scene())
            oversized = {**scene(), "prompt": "x" * 64000}
            path.write_text(json.dumps(oversized))
            with self.assertRaisesRegex(ValueError, "under 64 KB"):
                recipe_contract(path, 193)

    def test_capture_receipt_cannot_bind_another_control_track(self):
        with tempfile.TemporaryDirectory() as temp:
            make_bundle(temp)
            root = Path(temp)
            inputs = root / "inputs"
            capture = {"recipe": scene(), "sha256": {"video": digest(inputs / "rgb.webm")},
                       "audioCompanion": {"sha256": "0" * 64}}
            path = inputs / "capture.json"
            path.write_text(json.dumps(capture))

            def fake_probe(source, kind):
                return audio_metadata() if kind == "a:0" else video_metadata()

            with patch("prepare.probe", side_effect=fake_probe):
                with self.assertRaisesRegex(ValueError, "exact control-audio companion"):
                    prepare(root / "mismatched", inputs / "recipe.json", inputs / "rgb.webm", inputs / "look.png",
                            inputs / "audio.wav", capture_receipt=path, prompt="Synthetic test")
            self.assertFalse((root / "mismatched").exists())

    def test_vfr_or_offset_frames_are_rejected_despite_matching_fps_header(self):
        metadata = video_metadata()
        self.assertEqual(video_contract(metadata, scene())["frames"], 193)
        metadata["frames"][31]["best_effort_timestamp_time"] = str(31 / 24 + 0.015)
        with self.assertRaisesRegex(ValueError, "timestamps"):
            video_contract(metadata, scene())

    def test_silence_padding_and_wrong_look_aspect_are_refused(self):
        with self.assertRaisesRegex(ValueError, "too short"):
            audio_contract(audio_metadata(duration=8), scene(), 0)
        wrong = video_metadata()
        wrong["streams"][0]["width"] = 400
        with self.assertRaisesRegex(ValueError, "same aspect ratio"):
            image_contract(wrong, scene())

    def test_look_allows_only_one_output_pixel_of_integer_aspect_rounding(self):
        timing = {**scene(), "width": 768, "height": 448}
        rounded = {"streams": [{"width": 1642, "height": 958}]}
        report = image_contract(rounded, timing)
        self.assertAlmostEqual(report["aspect_error_output_pixels"]["maximum"], 0.26722338204592)
        self.assertEqual(report["expected_output_dimensions"], {"width": 1536, "height": 896})
        self.assertEqual(report["aspect_tolerance_output_pixels"], 1.0)
        self.assertFalse(report["resampling"]["source_file_modified"])
        with self.assertRaisesRegex(ValueError, "same aspect ratio"):
            image_contract({"streams": [{"width": 1920, "height": 1080}]}, timing)

    def test_reference_node_resize_cannot_drift_from_the_measured_contract(self):
        changed = source()
        changed["71"]["inputs"]["crop"] = "disabled"
        with self.assertRaisesRegex(ValueError, "look-still resizing"):
            candidate(changed, scene(), {}, prompt="Test")

    def test_audio_offset_is_exact_samples_and_does_not_change_duration(self):
        audio = audio_contract(audio_metadata(20), scene(), 2)
        self.assertEqual((audio["start_sample"], audio["samples"]), (96000, 386000))
        with self.assertRaisesRegex(ValueError, "sample boundaries"):
            audio_contract(audio_metadata(20), scene(), 0.000001)


if __name__ == "__main__":
    unittest.main()
