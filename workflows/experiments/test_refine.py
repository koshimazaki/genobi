"""UI-to-API conversion and the refine submit path. Synthetic fixtures; no network."""
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from common import read_json
from refine import RECEIPT, configure, locate, poll, submit_command
from refine_fixture import INFO, UI
from test_support import FakeComfy
from ui_convert import convert


class ConvertTests(unittest.TestCase):
    def setUp(self):
        self.graph, self.report = convert(copy.deepcopy(UI), INFO)

    def test_subgraph_is_expanded_with_prefixed_ids_and_boundary_links(self):
        self.assertEqual(set(self.graph), {"1", "2", "3", "5", "4:10", "4:11", "4:12", "4:13", "4:14", "4:15", "4:16", "4:17"})
        self.assertEqual(self.graph["4:14"]["inputs"]["video"], ["1", 0])
        self.assertEqual(self.graph["4:11"]["inputs"], {"text": ["2", 0], "clip": ["4:10", 0]})
        self.assertEqual(self.graph["5"]["inputs"]["video"], ["4:17", 0])  # through the subgraph output and a Reroute

    def test_widgets_map_by_server_order_skipping_frontend_values(self):
        self.assertEqual(self.graph["1"]["inputs"], {"file": ""})
        self.assertEqual(self.graph["5"]["inputs"]["filename_prefix"], "output")
        sampler = self.graph["4:16"]["inputs"]
        self.assertEqual((sampler["seed"], sampler["cfg"], sampler["tile_width"]), (7, 1.0, ["4:15", 0]))
        self.assertEqual(self.graph["4:15"]["inputs"], {"tile_size": "HD", "output_size": "4K", "image": ["4:14", 0]})
        self.assertIn("tiling_preview", self.report["notes"][0])

    def test_literal_switch_is_folded_and_unused_branch_pruned(self):
        self.assertEqual(self.graph["4:16"]["inputs"]["positive"], ["4:13", 0])
        for removed in ("4:20", "4:21", "4:22", "4:26", "4:18"):
            self.assertNotIn(removed, self.graph)

    def test_unknown_node_types_are_all_listed(self):
        info = {k: v for k, v in INFO.items() if k not in ("FakeDecode", "LoadVideo")}
        with self.assertRaisesRegex(ValueError, "FakeDecode, LoadVideo"):
            convert(copy.deepcopy(UI), info)

    @unittest.skipUnless(os.environ.get("GENOBI_TIFU_UI") and os.environ.get("GENOBI_TIFU_INFO"),
                         "set GENOBI_TIFU_UI/GENOBI_TIFU_INFO to dry-run the upstream graph")
    def test_upstream_tiled_fusion_dry_run(self):
        graph, _ = convert(read_json(os.environ["GENOBI_TIFU_UI"]), read_json(os.environ["GENOBI_TIFU_INFO"]))
        places = locate(graph)
        self.assertEqual(graph[places["save"]]["class_type"], "SaveVideo")
        self.assertNotIn("GemmaAPITextEncode", {n["class_type"] for n in graph.values()})


class SubmitTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.graph, _ = convert(copy.deepcopy(UI), INFO)
        (self.root / "refine.api.json").write_text(json.dumps(self.graph))
        (self.root / "clip.mp4").write_bytes(b"SYNTHETIC CLIP BYTES")
        self.client = FakeComfy(self.graph)
        self.client.catalogue = copy.deepcopy(INFO)

    def args(self, **extra):
        values = dict(graph=self.root / "refine.api.json", video=self.root / "clip.mp4", run_dir=self.root / "run",
                      prompt="Crisp 35 mm film grain, soft warm key light, teal-orange grade.", negative="",
                      output_size="FullHD", tile_size="HD", seed=42)
        values.update(extra)
        return type("Args", (), values)()

    def test_locates_by_class_and_sets_every_field(self):
        places = locate(self.graph)
        self.assertEqual(places["prompts"], {"positive": "2", "negative": "3"})
        out = configure(self.graph, places, "in/clip.mp4", "Soft grade.", "blur", "4K", "qHD", 9, "genobi-experiments/refine/x/refine")
        self.assertEqual(out["1"]["inputs"]["file"], "in/clip.mp4")
        self.assertEqual((out["2"]["inputs"]["value"], out["3"]["inputs"]["value"]), ("Soft grade.", "blur"))
        self.assertEqual((out["4:15"]["inputs"]["output_size"], out["4:15"]["inputs"]["tile_size"]), ("4K", "qHD"))
        self.assertEqual(out["4:16"]["inputs"]["seed"], 9)
        with self.assertRaises(ValueError):
            configure(self.graph, places, "f", "p", "", "16K", "HD", 1, "x")

    def test_submit_uploads_posts_once_and_records_receipt(self):
        receipt = submit_command(self.args(), self.client)
        self.assertEqual((self.client.posts, self.client.uploads), (1, ["source"]))
        self.assertEqual(receipt["status"], "queued")
        sent = self.client.graph
        self.assertEqual(sent["1"]["inputs"]["file"], receipt["upload"])
        self.assertEqual(sent["5"]["inputs"]["filename_prefix"], f"genobi-experiments/refine/{receipt['request_id']}/refine")
        self.assertEqual(read_json(self.root / "run" / RECEIPT)["prompt_id"], "server-assigned-id")
        with self.assertRaisesRegex(ValueError, "submitted once"):
            submit_command(self.args(), self.client)
        self.assertEqual(self.client.posts, 1)

    def test_lost_response_is_unknown_and_never_retried(self):
        self.client.failure = TimeoutError("fake")
        with self.assertRaisesRegex(RuntimeError, "submission_unknown"):
            submit_command(self.args(), self.client)
        self.assertEqual(poll(self.root / "run", self.client)["status"], "submission_unknown")
        self.assertEqual(self.client.posts, 1)

    def test_missing_model_fails_before_upload(self):
        self.client.catalogue["CLIPLoader"]["input"]["required"]["clip_name"] = [["other.safetensors"]]
        with self.assertRaisesRegex(ValueError, "required model"):
            submit_command(self.args(), self.client)
        self.assertEqual((self.client.uploads, self.client.posts), ([], 0))
        self.assertFalse((self.root / "run").exists())

    def test_status_downloads_only_the_isolated_output(self):
        receipt = submit_command(self.args(), self.client)
        folder = f"genobi-experiments/refine/{receipt['request_id']}"
        self.client.histories["server-assigned-id"] = {"status": {"completed": True},
            "outputs": {"5": {"images": [{"filename": "refine_00001_.mp4", "subfolder": folder, "type": "output"}]}}}
        self.client.download = lambda descriptor, path: path.write_bytes(b"refined")
        result = poll(self.root / "run", self.client)
        self.assertEqual(result["status"], "output_downloaded_unreviewed")
        self.assertEqual((self.root / "run" / "refined.mp4").read_bytes(), b"refined")
        self.assertEqual(self.client.posts, 1)

    def test_run_directory_must_be_outside_the_repository(self):
        with patch("refine.REPO", self.root):
            with self.assertRaisesRegex(ValueError, "outside the tracked repository"):
                submit_command(self.args(), self.client)


if __name__ == "__main__":
    unittest.main()
