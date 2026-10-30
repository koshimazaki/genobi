"""Acoustics, depth, canny, take audio and storyboard checks. No Comfy server or model needed:
python3 custom_nodes/director_world_builder/test_nodes.py
"""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
import wave

import numpy as np
import torch
from PIL import Image

HERE = Path(__file__).resolve().parent


def load_package(input_dir):
    folders = types.ModuleType("folder_paths")
    folders.get_input_directory = lambda: str(input_dir)
    folders.get_temp_directory = lambda: str(input_dir)
    sys.modules["folder_paths"] = folders
    spec = importlib.util.spec_from_file_location("director_world_builder", HERE / "__init__.py",
                                                  submodule_search_locations=[str(HERE)])
    module = importlib.util.module_from_spec(spec)
    sys.modules["director_world_builder"] = module
    spec.loader.exec_module(module)
    return module


class Acoustics(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.node = load_package(cls.temp.name)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_room_library_snaps_to_its_namesake(self):
        for name in ("small_room", "medium_room", "empty_club", "cathedral"):
            text = (HERE / "examples/rooms" / f"{name}.json").read_text()
            preset, level, rt60, summary, mode, application, room = self.node.DirectorSceneAcoustics().measure(text)
            self.assertEqual(preset, name)
            self.assertIn(level, ("low", "mid", "high"))
            self.assertGreater(rt60, 0)
            self.assertTrue(summary.startswith(name + " · "))
            self.assertEqual((mode, room), ("Room", name))
            size = json.loads((HERE / "acoustics.json").read_text())["rooms"][name]["size_m"]
            self.assertIn(f"{size[0]:g}×{size[1]:g}×{size[2]:g} m", summary)

    def test_outputs_fit_akuspace_combos(self):
        cls = self.node.DirectorSceneAcoustics
        text = (HERE / "examples/rooms/cathedral.json").read_text()
        for value, kind in zip(cls().measure(text)[4:], cls.RETURN_TYPES[4:]):
            self.assertIn(value, kind)

    def test_sabine_bands_and_open_sky(self):
        acoustics = sys.modules["director_world_builder.acoustics"]
        self.assertEqual(acoustics.snap(0.05), ("dry", "low"))
        self.assertEqual(acoustics.snap(0.9), ("small_room", "high"))
        self.assertEqual(acoustics.snap(20), ("cathedral", "high"))
        day = acoustics.estimate({"version": 1, "light": 2, "objects": []})
        night = acoustics.estimate({"version": 1, "light": 0.4, "objects": []})
        self.assertEqual((day["preset"], night["preset"]), ("outdoor_day", "outdoor_night"))
        self.assertEqual(acoustics.widgets("outdoor_night", "low"), ("Space", "Night", "medium_room"))
        # A closed 10 m concrete cube: RT60 = 0.161 · 1000 / (0.02 · 600) ≈ 13.4 s.
        cube = [{"id": f"room-{i}", "shape": "box", "x": 0, "y": 5, "z": 0, "scale": 8, "scaleX": 1.25,
                 "scaleY": 1.25, "scaleZ": 1.25, "color": "#808080", "prompt": "concrete"} for i in range(1)]
        result = acoustics.estimate({"version": 1, "objects": cube})
        self.assertAlmostEqual(result["volume"], 1000, places=3)


class Tools(unittest.TestCase):
    def test_find_tool_falls_back_to_package_manager_dirs(self):
        with tempfile.TemporaryDirectory() as temp:
            node = load_package(temp)
            script = Path(temp) / "fakeffmpeg"
            script.write_text("#!/bin/sh\n")
            script.chmod(0o755)
            (Path(temp) / "notexecutable").write_text("")
            original_dirs, original_which = node.TOOL_DIRS, node.shutil.which
            node.TOOL_DIRS, node.shutil.which = (temp,), lambda name: None
            try:
                self.assertEqual(node.find_tool("fakeffmpeg"), str(script))
                self.assertIsNone(node.find_tool("notexecutable"))
                self.assertIsNone(node.find_tool("missing"))
                node.shutil.which = lambda name: "/from/path/" + name
                self.assertEqual(node.find_tool("fakeffmpeg"), "/from/path/fakeffmpeg")
            finally:
                node.TOOL_DIRS, node.shutil.which = original_dirs, original_which


class Passes(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.node = load_package(self.root)
        self.recipe = json.dumps({"version": 1, "fps": 24, "width": 256, "height": 256, "frames": 9})
        image = Image.new("RGB", (256, 256), "black")
        image.paste((255, 255, 255), (64, 64, 192, 192))
        image.save(self.root / "frame.png")

    def tearDown(self):
        self.temp.cleanup()

    def test_missing_depth_is_black_and_canny_matches(self):
        frames, _, _, _, depth, edges = self.node.DirectorSceneCapture().capture("frame.png", "", self.recipe)
        self.assertEqual(depth.shape, frames.shape)
        self.assertEqual(float(depth.abs().sum()), 0)
        self.assertEqual(edges.shape, frames.shape)
        self.assertGreater(float(edges[0, 64, 100:150, 0].max()), 0.5)
        self.assertEqual(float(edges[0, 10:50, 10:50].sum()), 0)
        self.assertEqual(float(edges[0, 100:150, 100:150].sum()), 0)

    def test_depth_file_is_greyscale_three_channels(self):
        Image.new("RGB", (256, 256), (200, 200, 200)).save(self.root / "depth.png")
        frames, *_, depth, _ = self.node.DirectorSceneCapture().capture("frame.png", "", self.recipe, "depth.png")
        self.assertEqual(depth.shape, frames.shape)
        self.assertAlmostEqual(float(depth[0, 5, 5, 2]), 200 / 255, places=5)
        Image.new("RGB", (128, 128)).save(self.root / "small.png")
        with self.assertRaises(ValueError):
            self.node.DirectorSceneCapture().capture("frame.png", "", self.recipe, "small.png")

    def test_storyboard_grid(self):
        red = torch.zeros((3, 64, 128, 3)); red[..., 0] = 1
        grid, panels = self.node.DirectorStoryboardGrid().tile(128, 128, "2x2", red, None, red)
        self.assertEqual(tuple(grid.shape), (1, 256, 256, 3))
        self.assertEqual(float(grid[0, 64, 64, 0]), 1)
        self.assertEqual(float(grid[0, 64, 192].sum()), 0)
        self.assertIn("2: empty", panels)
        wide, _ = self.node.DirectorStoryboardGrid().tile(64, 128, "1x4")
        self.assertEqual(tuple(wide.shape), (1, 128, 256, 3))
        with self.assertRaises(ValueError):
            self.node.DirectorStoryboardGrid().tile(100, 128, "2x2")

    def test_storyboard_grid_2x4(self):
        node = self.node.DirectorStoryboardGrid()
        self.assertIn("image_8", node.INPUT_TYPES()["optional"])
        self.assertIn("2x4", node.INPUT_TYPES()["required"]["layout"][0])
        blue = torch.zeros((17, 64, 128, 3)); blue[..., 2] = 1
        grid, panels = node.tile(128, 64, "2x4", image_1=blue, image_8=blue)
        self.assertEqual(tuple(grid.shape), (1, 128, 512, 3))
        self.assertEqual(float(grid[0, 32, 64, 2]), 1)  # row 1, column 1
        self.assertEqual(float(grid[0, 96, 448, 2]), 1)  # row 2, column 4
        self.assertEqual(float(grid[0, 32, 448].sum()), 0)  # panel 4 empty
        self.assertIn("8: image_8 first frame (row 2, column 4)", panels)
        self.assertIn("5: empty (row 2, column 1)", panels)
        with self.assertRaises(ValueError):
            node.tile(128, 64, "2x2", image_5=blue)


class TakeAudio(unittest.TestCase):
    """A connected AUDIO is the take's sound, trimmed or padded to frames / 24 fps."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.node = load_package(self.root)
        recipe = {"version": 1, "fps": 24, "width": 256, "height": 256, "frames": 9}
        self.recipe = json.dumps(recipe)
        Image.new("RGB", (256, 256), "black").save(self.root / "frame.png")
        self.capture = self.node.DirectorSceneCapture()

    def tearDown(self):
        self.temp.cleanup()

    def test_audio_is_an_optional_input_beside_the_file(self):
        types_ = self.node.DirectorSceneCapture.INPUT_TYPES()
        self.assertEqual(types_["optional"]["audio"], ("AUDIO",))
        self.assertIn("audio_file", types_["required"])

    def test_long_audio_is_trimmed_at_its_own_rate(self):
        ramp = torch.linspace(-1, 1, 32000).repeat(2, 1)[None]  # 1 s stereo at 32 kHz
        audio = self.capture.capture("frame.png", "", self.recipe, audio={"waveform": ramp, "sample_rate": 32000})[1]
        # The still is one frame: 1 / 24 s at 32 kHz is 1333 samples.
        self.assertEqual(audio["sample_rate"], 32000)
        self.assertEqual(tuple(audio["waveform"].shape), (1, 2, round(32000 / 24)))
        self.assertTrue(torch.equal(audio["waveform"], ramp[:, :, :1333]))

    def test_short_audio_is_padded_with_silence(self):
        fit = sys.modules["director_world_builder.take_audio"].fit_audio
        tone = torch.ones((1, 1, 100))
        out = fit({"waveform": tone, "sample_rate": 48000}, 9 / 24)
        self.assertEqual(tuple(out["waveform"].shape), (1, 1, 18000))
        self.assertEqual(float(out["waveform"][0, 0, :100].sum()), 100)
        self.assertEqual(float(out["waveform"][0, 0, 100:].abs().sum()), 0)
        self.assertIsNot(out["waveform"], tone)

    def test_connected_audio_wins_over_the_wav_file(self):
        self.write_wav("take.wav", 48000, np.full(4000, 16384, dtype="<i2"))
        from_file = self.capture.capture("frame.png", "take.wav", self.recipe)[1]
        self.assertEqual(tuple(from_file["waveform"].shape), (1, 1, 2000))
        self.assertAlmostEqual(float(from_file["waveform"][0, 0, 0]), 0.5, places=4)
        silent = {"waveform": torch.zeros((1, 1, 44100)), "sample_rate": 44100}
        linked = self.capture.capture("frame.png", "take.wav", self.recipe, audio=silent)[1]
        self.assertEqual((linked["sample_rate"], linked["waveform"].shape[2]), (44100, round(44100 / 24)))
        self.assertEqual(float(linked["waveform"].abs().sum()), 0)

    def test_the_wav_path_still_needs_48_khz(self):
        self.write_wav("other.wav", 44100, np.zeros(100, dtype="<i2"))
        with self.assertRaises(ValueError):
            self.capture.capture("frame.png", "other.wav", self.recipe)

    def test_invalid_audio_is_refused(self):
        fit = sys.modules["director_world_builder.take_audio"].fit_audio
        for bad in ({"waveform": torch.zeros((1, 3, 10)), "sample_rate": 48000},
                    {"waveform": torch.zeros((2, 1, 10)), "sample_rate": 48000},
                    {"waveform": torch.zeros((1, 1, 10)), "sample_rate": 48000.0},
                    {"waveform": torch.zeros((1, 1, 10)), "sample_rate": 4000},
                    {"waveform": torch.zeros((1, 10)), "sample_rate": 48000},
                    {"sample_rate": 48000}, "not audio"):
            with self.assertRaises(ValueError):
                fit(bad, 1)

    def test_recipe_loop_is_optional_and_boolean(self):
        base = json.loads(self.recipe)
        self.assertNotIn("loop", self.node.recipe_data(self.recipe))
        self.assertTrue(self.node.recipe_data(json.dumps({**base, "loop": True}))["loop"])
        with self.assertRaises(ValueError):
            self.node.recipe_data(json.dumps({**base, "loop": "yes"}))
        self.assertFalse(self.node.recipe_data(json.dumps({**base, "screen": False}))["screen"])
        with self.assertRaises(ValueError):
            self.node.recipe_data(json.dumps({**base, "screen": 0}))

    def test_run_previews_the_first_frame_and_its_passes(self):
        out = self.node.DirectorSceneCapture().run("frame.png", "", self.recipe)
        self.assertEqual(len(out["result"]), 6)
        shown = out["ui"]["images"]
        self.assertEqual(len(shown), 2)  # RGB and canny; no depth_file, no depth
        for item in shown:
            self.assertEqual(item["type"], "temp")
            self.assertTrue((Path(self.temp.name) / item["filename"]).is_file())

    def test_is_changed_accepts_a_linked_audio(self):
        digest = self.node.DirectorSceneCapture.IS_CHANGED("frame.png", "", self.recipe, "", audio=None)
        self.assertEqual(len(digest), 64)

    def write_wav(self, name, rate, samples):
        with wave.open(str(self.root / name), "wb") as wav:
            wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(samples.tobytes())


if __name__ == "__main__":
    unittest.main()
