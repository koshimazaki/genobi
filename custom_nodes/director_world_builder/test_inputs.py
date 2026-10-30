"""Regression checks for the worked GPU take and large-render return path.
No server, model, FFmpeg or GPU needed.
"""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image
import torch

from test_nodes import load_package


class CaptureAndInputs(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.node = load_package(self.temp.name)

    def test_eight_second_take_fits_but_oversized_capture_is_refused(self):
        recipe = {"version": 1, "fps": 24, "width": 1024, "height": 576, "frames": 193}
        self.assertEqual(self.node.recipe_data(json.dumps(recipe)), recipe)
        with self.assertRaisesRegex(ValueError, "2 GiB"):
            self.node.recipe_data(json.dumps({**recipe, "width": 1536, "height": 1024}))

    def test_large_image_count_downscales_the_return_preview(self):
        images = torch.ones((1, 8, 8, 3))
        original = images.clone()
        # Simulate an over-budget tensor without allocating a gigabyte in a CPU test.
        with patch.object(torch.Tensor, "numel", return_value=4 * 320 * 1024 * 1024):
            result = self.node.DirectorSceneInputs().prepare(24, images=images)
        name = result["ui"]["world_inputs"][0]["screen"][0]["filename"]
        with Image.open(Path(self.temp.name) / name) as image:
            self.assertEqual(image.size, (4, 4))
        self.assertTrue(torch.equal(images, original), "the generated tensor must remain unchanged")

    def test_small_image_keeps_its_size(self):
        result = self.node.DirectorSceneInputs().prepare(24, images=torch.ones((1, 8, 8, 3)))
        name = result["ui"]["world_inputs"][0]["screen"][0]["filename"]
        with Image.open(Path(self.temp.name) / name) as image:
            self.assertEqual(image.size, (8, 8))


if __name__ == "__main__":
    unittest.main()
