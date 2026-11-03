"""Pure native capture bounds; no tensor library, browser or model required."""
import importlib.util
import json
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "custom_nodes/director_world_builder/capture_contract.py"
spec = importlib.util.spec_from_file_location("capture_contract", SOURCE)
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)


class CaptureDuration(unittest.TestCase):
    def setUp(self):
        self.recipe = {"version": 1, "fps": 24, "width": 512, "height": 320, "frames": 721}

    def test_thirty_second_endpoint_and_grid(self):
        self.assertEqual(contract.recipe_data(json.dumps(self.recipe)), self.recipe)
        self.assertEqual((self.recipe["frames"] - 1) / 24, 30)
        for frames in (0, 8, 720, 722, 729, True):
            with self.assertRaisesRegex(ValueError, "frame count"):
                contract.recipe_data(json.dumps({**self.recipe, "frames": frames}))

    def test_short_legacy_captures_remain_valid(self):
        for frames in (9, 97, 193, 241):
            recipe = {**self.recipe, "frames": frames}
            self.assertEqual(contract.recipe_data(json.dumps(recipe)), recipe)

    def test_thirty_seconds_keeps_existing_decoded_memory_budget(self):
        with self.assertRaisesRegex(ValueError, "2 GiB"):
            contract.recipe_data(json.dumps({**self.recipe, "width": 1024, "height": 576}))

    def test_recipe_budget_and_rate_are_unchanged(self):
        with self.assertRaisesRegex(ValueError, "64 KB"):
            contract.recipe_data(" " * 64001)
        with self.assertRaisesRegex(ValueError, "24 fps"):
            contract.recipe_data(json.dumps({**self.recipe, "fps": 30}))


if __name__ == "__main__":
    unittest.main()
