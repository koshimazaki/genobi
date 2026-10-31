"""Offline checks for model integrity, safe setup and worker readiness."""

import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import assets
import bootstrap
import preflight


class VastPreparationTests(unittest.TestCase):
    def test_profile_is_complete_and_uses_immutable_urls(self):
        models = assets.selected_models()
        self.assertEqual(len(models), 6)
        self.assertEqual({Path(model.path).name for model in models}, assets.FILENAMES)
        self.assertGreater(sum(model.size for model in models), 72_000_000_000)
        self.assertLess(sum(model.size for model in models), 73_000_000_000)
        for model in models:
            self.assertIn(f"/resolve/{model.revision}/", model.url)
            self.assertNotIn("int8", model.name)
            self.assertNotIn("akuspace", model.name)

    def test_matching_sidecar_cannot_hide_changed_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model = assets.pinned_models.Model("vae", "a/b", "a" * 40, "tiny.bin", 4, hashlib.sha256(b"good").hexdigest())
            target = Path(model.dest(root))
            target.parent.mkdir()
            target.write_bytes(b"evil")
            Path(str(target) + ".sha256").write_text(model.sha256)
            self.assertEqual(assets.inspect_model(model, root), "hash_mismatch")
            target.write_bytes(b"good")
            self.assertEqual(assets.inspect_model(model, root), "verified")

    def test_resume_disk_plan_counts_remaining_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model = assets.pinned_models.Model("vae", "a/b", "a" * 40, "tiny.bin", 10, "a" * 64)
            part = Path(model.dest(root) + ".part")
            part.parent.mkdir()
            part.write_bytes(b"1234")
            self.assertEqual(assets.required_download_bytes([model], root), 6)
            part.write_bytes(b"x" * 12)
            self.assertEqual(assets.required_download_bytes([model], root), 10)

    def test_setup_refuses_nonempty_and_symlink_targets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            existing = root / "existing"
            existing.mkdir()
            (existing / "keep.txt").write_text("keep")
            with self.assertRaises(ValueError):
                bootstrap.validate_workspace(existing)
            link = root / "link"
            link.symlink_to(existing, target_is_directory=True)
            with self.assertRaises(ValueError):
                bootstrap.validate_workspace(link)
            self.assertEqual((existing / "keep.txt").read_text(), "keep")

    def test_comfy_origin_requires_loopback_without_credentials(self):
        self.assertEqual(preflight.loopback_url("http://127.0.0.1:8188/"), "http://127.0.0.1:8188")
        self.assertEqual(preflight.loopback_url("http://[::1]:8188"), "http://[::1]:8188")
        for value in ("http://example.com:8188", "http://localhost.evil.test", "http://token@localhost", "http://localhost:90000", "http://localhost/path", "http://localhost?key=secret"):
            with self.assertRaises(ValueError):
                preflight.loopback_url(value)

    def test_live_node_choices_check_actual_loader_names(self):
        graph = {
            "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "missing.safetensors"}},
            "2": {"class_type": "AbsentNode", "inputs": {}},
        }
        info = {"UNETLoader": {"input": {"required": {"unet_name": [["available.safetensors"]]}}}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "graph.json"
            path.write_text(json.dumps(graph))
            issues = preflight.workflow_requirements(path, info)
            self.assertEqual(len(issues), 2)
            graph["1"]["inputs"]["unet_name"] = "available.safetensors"
            del graph["2"]
            path.write_text(json.dumps(graph))
            self.assertEqual(preflight.workflow_requirements(path, info), [])
            info["UNETLoader"]["input"]["required"]["unet_name"] = ["COMBO", {"options": ["available.safetensors"]}]
            self.assertEqual(preflight.workflow_requirements(path, info), [])
            info["UNETLoader"]["input"]["required"]["unet_name"][1]["options"] = []
            self.assertEqual(len(preflight.workflow_requirements(path, info)), 1)

    def test_preflight_rejects_missing_unfilled_and_broken_graph_inputs(self):
        info = {
            "LoadAudio": {"input": {"required": {"audio": [["actual.wav"]]}}, "output": ["AUDIO"]},
            "SaveAudio": {"input": {"required": {"audio": ["AUDIO"], "filename_prefix": ["STRING"]}}, "output": []},
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "graph.json"
            graph = {
                "1": {"class_type": "LoadAudio", "inputs": {}},
                "2": {"class_type": "SaveAudio", "inputs": {"audio": ["missing", 0], "filename_prefix": "__PREFIX__"}},
            }
            path.write_text(json.dumps(graph))
            issues = preflight.workflow_requirements(path, info)
            self.assertTrue(any("required input" in issue for issue in issues))
            self.assertTrue(any("placeholder" in issue for issue in issues))
            self.assertTrue(any("linked node" in issue for issue in issues))
            graph["1"]["inputs"]["audio"] = "actual.wav"
            graph["2"]["inputs"] = {"audio": ["1", 1], "filename_prefix": "result"}
            path.write_text(json.dumps(graph))
            self.assertIn("linked output", preflight.workflow_requirements(path, info)[0])
            graph["2"]["inputs"]["audio"] = ["1", 0]
            path.write_text(json.dumps(graph))
            self.assertEqual(preflight.workflow_requirements(path, info), [])

    def test_install_resume_checks_actual_source_bytes_and_commit(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(bootstrap, "checkout_revision", return_value="a" * 40):
            root = Path(directory)
            comfy = root / "ComfyUI"
            comfy.mkdir()
            main = comfy / "main.py"
            main.write_text("original source")
            receipt = {
                "schema": "genobi-vast-source/1",
                "genobi_commit": "a" * 40,
                "source_lock_sha256": hashlib.sha256((bootstrap.REPO / "comfy-build/sources.lock").read_bytes()).hexdigest(),
                "installed_sources_sha256": bootstrap.source_digest(comfy),
            }
            (root / "source-receipt.json").write_text(json.dumps(receipt))
            bootstrap.existing_preparation(root)
            (comfy / "models").mkdir()
            (comfy / "models/model.bin").write_bytes(b"model bytes")
            (comfy / "__pycache__").mkdir()
            (comfy / "__pycache__/main.pyc").write_bytes(b"runtime cache")
            bootstrap.existing_preparation(root)
            main.write_text("changed source")
            with self.assertRaisesRegex(ValueError, "source.*changed"):
                bootstrap.existing_preparation(root)
            main.write_text("original source")
            with patch.object(bootstrap, "checkout_revision", return_value="b" * 40):
                with self.assertRaisesRegex(ValueError, "Genobi commit"):
                    bootstrap.existing_preparation(root)


if __name__ == "__main__":
    unittest.main()
