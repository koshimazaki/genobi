"""Keyframe guides and Union Control derivative. Synthetic fixtures; no model runs."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from common import read_json
from graph import UNION_LORA, bindings, candidate, validate_links
from keyframes import parse_keyframe
from prepare import prepare
from run import bundle_inputs, submit_once
from test_support import FakeComfy, audio_metadata, scene, source, video_metadata

ASSETS = {"rgb": "rgb.webm", "look": "look.png", "audio": "track.wav", "depth": "depth.webm",
          "key1": "key1.png", "key2": "key2.png"}
KEYS = [{"role": "key1", "frame_idx": 48, "strength": 0.8}, {"role": "key2", "frame_idx": 144, "strength": 1.0}]


def build(mode="layout", keyframes=None):
    return candidate(source(), scene(), ASSETS, mode=mode, prompt="A polished fruit sculpture.", keyframes=keyframes)


def bundle(directory, mode="layout", keyframes=(), difference=40.0, look_size=(768, 512)):
    """Prepare a bundle with mocked probes; key stills default to an aspect-correct size."""
    inputs = Path(directory) / "inputs"
    inputs.mkdir(exist_ok=True)
    (inputs / "recipe.json").write_text(json.dumps(scene()))
    for name in ("rgb.webm", "depth.webm", "look.png", "audio.wav", "key1.png", "key2.png"):
        (inputs / name).write_bytes(b"SYNTHETIC TEST BYTES: " + name.encode())

    def fake_probe(path, kind):
        if kind == "a:0":
            return audio_metadata()
        if Path(path).name.startswith("key"):
            return {"streams": [{"width": look_size[0], "height": look_size[1]}]}
        return video_metadata()

    specs = [f"{inputs / name}@{index}@{strength}" for name, index, strength in keyframes]
    with patch("prepare.probe", side_effect=fake_probe), patch("keyframes.probe", side_effect=fake_probe), \
            patch("keyframes.guide_frame_difference", return_value=difference):
        prepare(Path(directory) / "bundle", inputs / "recipe.json", inputs / "rgb.webm", inputs / "look.png",
                inputs / "audio.wav", mode=mode, prompt="Synthetic look.",
                depth=inputs / "depth.webm" if mode == "union-depth" else None, keyframes=specs)
    return Path(directory) / "bundle"


class KeyframeGraphTests(unittest.TestCase):
    def test_no_keyframes_leaves_the_look_as_the_last_guide(self):
        graph = build(keyframes=[])
        self.assertEqual(graph, build())
        self.assertEqual(graph["81"]["inputs"]["positive"], ["71", 0])
        self.assertFalse(any(key.startswith("key") for key in graph))

    def test_one_keyframe_chains_after_the_look_in_both_stages(self):
        graph = build(keyframes=KEYS[:1])
        validate_links(graph)
        self.assertEqual(graph["key1"], {"class_type": "LoadImage", "inputs": {"image": "key1.png"}})
        for stage, look, consumers in ((1, "71", ("81", "85", "x1c")), (2, "73", ("91", "95", "x2c"))):
            node = graph[f"key1s{stage}"]["inputs"]
            self.assertEqual(graph[f"key1s{stage}"]["class_type"], "LTXAddVideoICLoRAGuide")
            self.assertEqual((node["positive"], node["negative"], node["latent"]), ([look, 0], [look, 1], [look, 2]))
            self.assertEqual((node["image"], node["frame_idx"], node["strength"], node["crop"]), (["key1", 0], 48, 0.8, "center"))
            self.assertEqual((node["vae"], node["latent_downscale_factor"]), (graph[look]["inputs"]["vae"], ["21", 1]))
            guider, crop, concat = consumers
            self.assertEqual(graph[guider]["inputs"]["positive"], [f"key1s{stage}", 0])
            self.assertEqual(graph[crop]["inputs"]["negative"], [f"key1s{stage}", 1])
            self.assertEqual(graph[concat]["inputs"]["video_latent"], [f"key1s{stage}", 2])

    def test_two_keyframes_chain_in_order_with_deterministic_ids(self):
        graph = build(keyframes=KEYS)
        validate_links(graph)
        self.assertEqual(graph["key2s1"]["inputs"]["positive"], ["key1s1", 0])
        self.assertEqual(graph["key2s2"]["inputs"]["latent"], ["key1s2", 2])
        self.assertEqual(graph["x1c"]["inputs"]["video_latent"], ["key2s1", 2])
        self.assertEqual(graph["95"]["inputs"]["positive"], ["key2s2", 0])
        self.assertEqual(json.dumps(graph, sort_keys=True), json.dumps(build(keyframes=KEYS), sort_keys=True))
        added = set(graph) - set(build())
        self.assertEqual(added, {"key1", "key2", "key1s1", "key1s2", "key2s1", "key2s2"})
        self.assertEqual(list(bindings(graph, keyframes=2)), ["rgb", "look", "audio", "key1", "key2", "save"])

    def test_keyframe_index_and_strength_are_bounded(self):
        for row in ({"role": "key1", "frame_idx": 0, "strength": 1.0}, {"role": "key1", "frame_idx": 193, "strength": 1.0},
                    {"role": "key1", "frame_idx": 10, "strength": 0.05}, {"role": "key2", "frame_idx": 10, "strength": 1.0}):
            with self.assertRaises(ValueError):
                build(keyframes=[row])

    def test_union_depth_swaps_guide_track_and_lora_only(self):
        audio, union = build("layout-audio"), build("union-depth")
        self.assertEqual(union["1"]["inputs"]["capture_file"], "depth.webm")
        self.assertEqual(union["1"]["inputs"]["depth_file"], "")
        self.assertEqual((union["21"]["inputs"]["lora_name"], union["21"]["inputs"]["strength_model"]), (UNION_LORA, 1.0))
        self.assertEqual(union["61"]["inputs"]["filename_prefix"], "genobi-experiments/union-depth/candidate")
        self.assertEqual({key for key in audio if audio[key] != union[key]}, {"1", "21", "61"})
        self.assertEqual(union["71"]["inputs"]["frame_idx"], -1)
        self.assertEqual(list(bindings(union, "union-depth")), ["depth", "look", "audio", "save"])
        validate_links(build("union-depth", KEYS))
        with self.assertRaisesRegex(ValueError, "depth track"):
            candidate(source(), scene(), {**ASSETS, "depth": ""}, mode="union-depth", prompt="Test")


class KeyframePrepareTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def test_spec_parsing(self):
        self.assertEqual(parse_keyframe("/a@b/look.png@96"), ("/a@b/look.png", 96, 1.0))
        self.assertEqual(parse_keyframe("look.png@96@0.5"), ("look.png", 96, 0.5))
        with self.assertRaises(ValueError):
            parse_keyframe("look.png")

    def test_out_of_range_index_is_refused_before_output(self):
        for index in (0, 193, 400):
            with self.assertRaisesRegex(ValueError, "strictly between"):
                bundle(self.temp.name, keyframes=[("key1.png", index, 1.0)])
        self.assertFalse((Path(self.temp.name) / "bundle").exists())

    def test_aspect_mismatch_and_unmodified_guide_frame_are_refused(self):
        with self.assertRaisesRegex(ValueError, "same aspect ratio"):
            bundle(self.temp.name, keyframes=[("key1.png", 96, 1.0)], look_size=(800, 512))
        with self.assertRaisesRegex(ValueError, "unmodified guide frame 96"):
            bundle(self.temp.name, keyframes=[("key1.png", 96, 1.0)], difference=0.4)
        self.assertFalse((Path(self.temp.name) / "bundle").exists())

    def test_bundle_freezes_keyframes_and_run_rewrites_their_roles(self):
        root = bundle(self.temp.name, keyframes=[("key1.png", 48, 0.8), ("key2.png", 144, 1.0)])
        manifest = read_json(root / "experiment.json")
        self.assertEqual(manifest["keyframes"], KEYS)
        self.assertEqual(manifest["assets"]["key2"]["path"], "assets/key2.png")
        self.assertEqual(manifest["media"]["key1"]["guide_frame"]["index"], 48)
        self.assertEqual(manifest["bindings"]["key1"], {"node": "key1", "class_type": "LoadImage", "field": "image"})
        _, graph = bundle_inputs(root)
        client = FakeComfy(graph)
        receipt = submit_once(root, client, 10)
        self.assertEqual(client.uploads, ["rgb", "look", "audio", "key1", "key2"])
        self.assertEqual(client.graph["key2"]["inputs"]["image"], receipt["uploads"]["key2"]["filename"])
        self.assertEqual(client.graph["key1s2"]["inputs"]["frame_idx"], 48)

    def test_union_depth_requires_depth_and_uploads_it_as_the_guide(self):
        root = bundle(self.temp.name, mode="union-depth")
        inputs = Path(self.temp.name) / "inputs"
        with self.assertRaisesRegex(ValueError, "needs --depth"):
            prepare(Path(self.temp.name) / "x", inputs / "recipe.json", inputs / "rgb.webm", inputs / "look.png",
                    inputs / "audio.wav", mode="union-depth", prompt="Synthetic look.")
        manifest = read_json(root / "experiment.json")
        self.assertEqual((manifest["guide"], manifest["bindings"]["depth"]["node"]), ("depth", "1"))
        self.assertIn("unused by generation", manifest["rgb"])
        _, graph = bundle_inputs(root)
        client = FakeComfy(graph)
        receipt = submit_once(root, client, 10)
        self.assertEqual(client.uploads, ["depth", "look", "audio"])
        self.assertEqual(client.graph["1"]["inputs"]["capture_file"], receipt["uploads"]["depth"]["filename"])

    def test_tampered_key_binding_field_is_refused(self):
        root = bundle(self.temp.name, keyframes=[("key1.png", 48, 1.0)])
        manifest = read_json(root / "experiment.json")
        manifest["bindings"]["key1"]["field"] = "upload"
        (root / "experiment.json").write_text(json.dumps(manifest))
        client = FakeComfy(bundle_inputs(root)[1])
        with self.assertRaisesRegex(ValueError, "unexpected input"):
            submit_once(root, client, 10)
        self.assertEqual((client.uploads, client.posts), ([], 0))


if __name__ == "__main__":
    unittest.main()
