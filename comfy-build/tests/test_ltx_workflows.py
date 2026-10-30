"""Worked API graphs, endpoint filling and audio wiring: offline, no models."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "comfy-build/scripts"))
import workflow_checks

spec = importlib.util.spec_from_file_location("materialize_ltx", ROOT / "workflows/materialize-ltx.py")
filler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(filler)
MANIFEST = json.loads((ROOT / "workflows/ltx-world-builder.endpoints.json").read_text())


def graph(name):
    endpoint = next(e for e in MANIFEST["endpoints"] if e["name"] == name)
    return json.loads((ROOT / "workflows" / endpoint["workflow"]).read_text())


def values_for(g):
    values = {}
    for name in {m[1] for m in filler.TOKEN.finditer(json.dumps(g))}:
        if name in filler.SEEDS:
            value = 123
        elif name == "RECIPE_JSON":
            value = json.dumps({"version": 1, "fps": 24, "width": 1024, "height": 576, "frames": 193})
        elif name == "DEPTH_WEBM":
            value = ""
        elif name in filler.FILES:
            value = {"TAKE_WEBM": "take.webm", "TRACK_AUDIO": "track.wav"}.get(name, "reference.png")
        else:
            value = "example"
        values[name] = value
    return values


class WorkedWorkflows(unittest.TestCase):
    def test_exact_model_coverage_and_graph_links(self):
        count = workflow_checks.check_workflows(MANIFEST["model_sets"], ROOT / "comfy-build/models")
        self.assertEqual(count, 23)
        self.assertTrue({"cathedral", "medium_room", "small_room", "party", "studio"} <= {e["name"] for e in MANIFEST["endpoints"]})
        for endpoint in MANIFEST["endpoints"]:
            self.assertTrue((ROOT / "workflows" / endpoint["workflow"].replace(".json", ".README.md")).is_file())

    def test_all_templates_fill_with_native_seed_types(self):
        for endpoint in MANIFEST["endpoints"]:
            g = graph(endpoint["name"])
            result = filler.materialize(g, values_for(g))
            self.assertIsNone(filler.TOKEN.search(json.dumps(result)))
            for node in result.values():
                for key in ("seed", "noise_seed"):
                    if key in node["inputs"]:
                        self.assertIs(type(node["inputs"][key]), int)

    def test_filler_refuses_missing_unknown_and_wrong_typed_values(self):
        g = graph("party"); values = values_for(g)
        for changes in ({"SEED_STAGE_1": "123"}, {"REVERB_SEED": -1}, {"REFERENCE_PNG": "/private/still.png"},
                        {"TAKE_WEBM": "../outside.webm"}, {"RECIPE_JSON": "{}"}):
            with self.assertRaises(ValueError):
                filler.materialize(g, {**values, **changes})
        with self.assertRaises(ValueError):
            filler.materialize(g, {})
        with self.assertRaises(ValueError):
            filler.materialize(g, {**values, "UNKNOWN": "x"})

    def test_a2v_reaches_both_samplers_and_cpu_reverb_stays_on_original_audio(self):
        for name in ("party", "party_v8", "studio"):
            g = graph(name)
            # Both stage latents concatenate the protected encoded track, then
            # separate video before guide-cropping and decoding.
            for stage, sampler, crop in (("1", "84", "85"), ("2", "94", "95")):
                self.assertEqual(g[sampler]["inputs"]["latent_image"], [f"x{stage}c", 0])
                self.assertEqual(g[f"x{stage}c"]["inputs"]["audio_latent"], [f"x{stage}m", 0])
                self.assertEqual(g[f"x{stage}m"]["inputs"]["samples"], ["av2", 0] if stage == "1" else ["x1s0", 1])
                self.assertEqual(g[crop]["inputs"]["latent"], [f"x{stage}s0", 0])
            self.assertEqual(g["av3"]["inputs"]["value"], 0)
            self.assertEqual(g["10"]["inputs"]["audio"], ["1", 1])
            self.assertEqual(g["60"]["inputs"]["audio"], ["10", 0])
            self.assertFalse(any(n["class_type"] == "LoraLoaderModelOnly" for n in g.values()))

    def test_i2v_cpu_and_akuspace_keep_the_tested_masks(self):
        for name, mask, mode in (("studio_cpu", 0, "Off"), ("studio_akuspace", 0.5, "Room")):
            g = graph(name)
            self.assertEqual(g["12"]["inputs"]["space_mode"], mode)
            for stage, sampler in (("1", "54"), ("2", "84")):
                self.assertEqual(g[sampler]["inputs"]["latent_image"], [f"m{stage}", 2])
                self.assertEqual(g[f"m{stage}"]["inputs"]["mask_init_value_audio"], mask)
            self.assertTrue(any(n["class_type"] == "LTXVAudioVAEEncode" for n in g.values()))

    def test_invalid_links_are_caught(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            g = graph("party"); g["84"]["inputs"]["noise"] = ["missing", 0]
            (folder / "broken.json").write_text(json.dumps(g))
            manifest = {**MANIFEST, "endpoints": [{"name": "broken", "workflow": "broken.json", "model_set": "world-builder-l2r"}]}
            (folder / "ltx-world-builder.endpoints.json").write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, "dangling"):
                workflow_checks.check_workflows(["world-builder-l2r"], ROOT / "comfy-build/models", folder)


if __name__ == "__main__":
    unittest.main()
