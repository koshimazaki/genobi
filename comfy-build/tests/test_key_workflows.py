"""Key release coverage, pins and audio routing; offline, no models or server."""
import importlib.util
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "comfy-build/scripts"))
import comfy_build_spec
import models
import workflow_checks


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, ROOT / "workflows" / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


filler = load_script("materialize-ltx")
cpu = load_script("make-cpu-reverb")
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
            value = json.dumps({"version": 1, "fps": 24, "width": 1024, "height": 576, "frames": 193, "objects": []})
        elif name == "DEPTH_WEBM":
            value = ""
        elif name in filler.FILES:
            value = {"TAKE_WEBM": "take.webm", "TRACK_AUDIO": "track.wav"}.get(name, "reference.png")
        else:
            value = "example"
        values[name] = value
    return values


class KeyWorkflows(unittest.TestCase):
    def test_exact_endpoints_and_model_coverage(self):
        self.assertEqual({e["name"] for e in MANIFEST["endpoints"]}, {"layout-to-video", "akuspace", "cpu-reverb"})
        self.assertEqual(workflow_checks.check_workflows(["ltx-world-key"], ROOT / "comfy-build/models"), 4)
        for e in MANIFEST["endpoints"]:
            self.assertTrue((ROOT / "workflows" / e["workflow"].replace(".json", ".README.md")).is_file())

    def test_release_has_no_local_models_and_only_required_packs(self):
        definition = comfy_build_spec.build_spec("genobi-ltx-world", ["ltx-world-key"])["definition"]
        weights = definition["models"]
        self.assertEqual(len(weights), 9)
        for model in weights:
            self.assertNotEqual(model.get("source"), "local", model["filename"])
            self.assertNotIn("localPath", model)
            self.assertTrue(model["sourceUri"].startswith("https://huggingface.co/"))
            self.assertRegex(model["sha256"], r"^[0-9a-f]{64}$")
            self.assertGreater(model["sizeBytes"], 0)
        nodes = {n["name"]: n for n in definition["customNodes"]}
        self.assertEqual(set(nodes), {"ComfyUI-LTXVideo", "Koshi-Nodes", "director_world_builder"})
        self.assertEqual(nodes["director_world_builder"], {"name": "director_world_builder", "source": "local", "localPath": "director_world_builder"})
        for name in ("ComfyUI-LTXVideo", "Koshi-Nodes"):
            self.assertEqual(nodes[name]["source"], "git")
            self.assertRegex(nodes[name]["gitRef"], r"^[0-9a-f]{40}$")

    def test_akuspace_pin_is_unchanged(self):
        old = next(m for m in models.load_sets([ROOT / "comfy-build/models/akuspace.txt"]) if m.path.startswith("akuspace-"))
        new = next(m for m in models.load_sets([ROOT / "comfy-build/models/ltx-world-key.txt"]) if m.path.startswith("akuspace-"))
        self.assertEqual((old.url, old.sha256, old.size), (new.url, new.sha256, new.size))

    def test_release_refuses_local_upload_fallback_and_extra_sets(self):
        with tempfile.TemporaryDirectory() as temp:
            (Path(temp) / "ltx-world-key.txt").write_text("vae org/repo " + "a" * 40 + " file.safetensors 123 -\n")
            with self.assertRaisesRegex(ValueError, "remote models"):
                comfy_build_spec.build_spec("key", ["ltx-world-key"], model_dir=temp)
        with self.assertRaisesRegex(ValueError, "standalone"):
            comfy_build_spec.build_spec("key", ["ltx-world-key", "swap"])

    def test_local_node_source_is_copied_from_checkout(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            pack = folder / "pack"
            pack.mkdir()
            (pack / "__init__.py").write_text("# local pack\n")
            lock = folder / "sources.lock"
            lock.write_text("ltx-world-key ComfyUI/custom_nodes/director_world_builder local - pack -\n")
            dest = folder / "install"
            dest.mkdir()
            subprocess.run(["sh", str(ROOT / "comfy-build/scripts/install-sources.sh"), str(lock), str(dest), "ltx-world-key"],
                           check=True, capture_output=True, timeout=10)
            self.assertEqual((dest / "ComfyUI/custom_nodes/director_world_builder/__init__.py").read_text(), "# local pack\n")

    def test_all_templates_fill_and_seed_boundaries_match_nodes(self):
        for e in MANIFEST["endpoints"]:
            g = graph(e["name"])
            result = filler.materialize(g, values_for(g))
            self.assertIsNone(filler.TOKEN.search(json.dumps(result)))
            for node in result.values():
                for key in ("seed", "noise_seed"):
                    if key in node["inputs"]:
                        self.assertIs(type(node["inputs"][key]), int)
        for name, bits in (("REVERB_SEED", 32), ("SEED_STAGE_1", 64), ("SEED_STAGE_2", 64)):
            filler.validate_value(name, 2**bits - 1)
            for bad in (-1, 2**bits, True, "123"):
                with self.assertRaises(ValueError):
                    filler.validate_value(name, bad)

    def test_filler_refuses_bad_input_and_does_not_drop_tokens(self):
        g = graph("layout-to-video")
        values = values_for(g)
        for changes in ({"REFERENCE_PNG": "/private/still.png"}, {"TAKE_WEBM": "../outside.webm"},
                        {"RECIPE_JSON": "{}"}, {"RECIPE_JSON": json.dumps({"version": 1, "objects": []})}):
            with self.assertRaises(ValueError):
                filler.materialize(g, {**values, **changes})
        for bad in ({}, {**values, "UNKNOWN": "x"}, []):
            with self.assertRaises(ValueError):
                filler.materialize(g, bad)

    def test_layout_audio_reaches_both_samplers_but_reverb_uses_original(self):
        g = graph("layout-to-video")
        for stage, sampler, crop in (("1", "84", "85"), ("2", "94", "95")):
            self.assertEqual(g[sampler]["inputs"]["latent_image"], [f"x{stage}c", 0])
            self.assertEqual(g[f"x{stage}c"]["inputs"]["audio_latent"], [f"x{stage}m", 0])
            self.assertEqual(g[f"x{stage}m"]["inputs"]["samples"], ["av2", 0] if stage == "1" else ["x1s0", 1])
            self.assertEqual(g[crop]["inputs"]["latent"], [f"x{stage}s0", 0])
        self.assertEqual(g["av3"]["inputs"]["value"], 0)
        self.assertEqual(g["1"]["inputs"]["audio"], ["40", 0])
        self.assertEqual(g["10"]["inputs"]["audio"], ["1", 1])
        self.assertEqual(g["60"]["inputs"]["audio"], ["10", 0])
        self.assertFalse(any(n["class_type"] == "LoraLoaderModelOnly" for n in g.values()))

    def test_akuspace_keeps_the_worked_audio_masks_and_preset(self):
        g = graph("akuspace")
        self.assertEqual({k: g["12"]["inputs"][k] for k in ("space_mode", "room_preset", "application", "effect_level")},
                         {"space_mode": "Room", "room_preset": "small_room", "application": "Heavy", "effect_level": "high"})
        for stage, sampler in (("1", "54"), ("2", "84")):
            self.assertEqual(g[sampler]["inputs"]["latent_image"], [f"m{stage}", 2])
            self.assertEqual(g[f"m{stage}"]["inputs"]["mask_init_value_audio"], 0.5)
        self.assertEqual(g["a3"]["inputs"]["audio"], ["41", 0])
        self.assertEqual(g["63"]["inputs"]["samples"], ["85", 1])

    def test_cpu_builder_takes_recipe_or_receipt_and_needs_no_capture(self):
        recipe = json.loads((ROOT / "custom_nodes/director_world_builder/examples/rooms/cathedral.json").read_text())
        g = cpu.make_graph(recipe, "track.wav", seed=2**32 - 1)
        self.assertEqual(g, cpu.make_graph({"recipe": recipe}, "track.wav", seed=2**32 - 1))
        self.assertFalse(any("Capture" in n["class_type"] for n in g.values()))
        self.assertEqual(g["10"]["inputs"]["decay_scale"], 1.0)
        self.assertEqual(g["10"]["inputs"]["audio"], ["40", 0])
        self.assertEqual(g["2"]["inputs"]["recipe"], g["10"]["inputs"]["recipe"])
        self.assertEqual(g["13"]["inputs"]["audio"], ["10", 0])

    def test_broken_links_and_unlisted_models_are_caught(self):
        g = graph("layout-to-video")
        g["84"]["inputs"]["noise"] = ["missing", 0]
        with self.assertRaisesRegex(ValueError, "dangling"):
            workflow_checks.check_graph(g, "broken")
        with tempfile.TemporaryDirectory() as temp:
            original = (ROOT / "comfy-build/models/ltx-world-key.txt").read_text()
            (Path(temp) / "ltx-world-key.txt").write_text(original + "vae org/repo " + "a" * 40 + " unused.safetensors 123 " + "b" * 64 + "\n")
            with self.assertRaisesRegex(ValueError, "unused"):
                workflow_checks.check_workflows(["ltx-world-key"], temp)


if __name__ == "__main__":
    unittest.main()
