"""The comfy-build.yaml generator reads the pinned sources and model sets.
Run with:  python3 -I tests/test_comfy_spec.py"""

import importlib.util
import os
import unittest

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
_spec = importlib.util.spec_from_file_location("comfy_build_spec", os.path.join(ROOT, "scripts", "comfy_build_spec.py"))
spec_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(spec_module)


class ComfySpecTest(unittest.TestCase):
    def test_swap_spec_pins_comfy_the_patched_pack_and_public_urls(self):
        spec = spec_module.build_spec("genobi-swap", ["swap"])
        definition = spec["definition"]
        self.assertEqual(definition["baseComfyVersion"], "98cc0bf84b7cb1383654c5b402e7612d875d6d22")
        self.assertEqual(definition["customNodes"], [{"name": "h3_character_swap", "source": "local", "localPath": "h3_character_swap"}])
        self.assertEqual(len(definition["models"]), 7)
        for model in definition["models"]:
            self.assertTrue(model["sourceUri"].startswith("https://huggingface.co/"))
            self.assertRegex(model["sha256"], r"^[0-9a-f]{64}$")
            self.assertNotIn("localPath", model, "public weights are never uploaded")

    def test_gated_files_are_local_uploads_and_shared_files_appear_once(self):
        definition = spec_module.build_spec("all", ["swap", "akuspace", "layout-to-render"])["definition"]
        names = [(m["type"], m["filename"]) for m in definition["models"]]
        self.assertEqual(len(names), len(set(names)))
        gated = [m for m in definition["models"] if "sourceUri" not in m]
        self.assertTrue(gated and all(m["source"] == "local" for m in gated))
        nodes = {node["name"]: node for node in definition["customNodes"]}
        self.assertEqual(set(nodes), {"h3_character_swap", "Koshi-Nodes", "ComfyUI-LTXVideo"})
        self.assertEqual(nodes["ComfyUI-LTXVideo"]["gitRef"], "220e1d45aa0469f518e982102fca4dca92a61862")

    def test_worked_ltx_release_has_exact_models_and_patched_world_builder(self):
        definition = spec_module.build_spec("genobi-ltx-world", ["world-builder-l2r", "ltx-i2v"])["definition"]
        self.assertEqual(len(definition["models"]), 9)
        self.assertEqual(sum(m["sizeBytes"] for m in definition["models"]), 109464422961)
        nodes = {node["name"]: node for node in definition["customNodes"]}
        self.assertEqual(set(nodes), {"Koshi-Nodes", "ComfyUI-LTXVideo", "director_world_builder"})
        self.assertEqual(nodes["director_world_builder"], {"name": "director_world_builder", "source": "local", "localPath": "director_world_builder"})
        self.assertFalse(any("union-control" in m["filename"] or "gemma4_e2b" in m["filename"] for m in definition["models"]))

    def test_yaml_output_is_plain_scalars(self):
        text = "\n".join(spec_module.to_yaml(spec_module.build_spec("genobi-swap", ["swap"])))
        self.assertIn('baseComfyVersion: "98cc0bf84b7cb1383654c5b402e7612d875d6d22"', text)
        self.assertIn("id: null", text)
        self.assertIn('    - name: "h3_character_swap"', text)


if __name__ == "__main__":
    unittest.main()
