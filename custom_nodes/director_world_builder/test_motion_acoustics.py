"""Motion recipes must never silently become the static node's open-sky estimate.

Run with Python's standard library alone:
python3 custom_nodes/director_world_builder/test_motion_acoustics.py
"""
import importlib.util
import json
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("motion_acoustics_guard", HERE / "acoustics.py")
acoustics = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(acoustics)


class MotionAcousticsGuard(unittest.TestCase):
    def test_legacy_open_sky_and_room_recipes_keep_their_results(self):
        self.assertEqual(acoustics.estimate({"version": 1, "objects": []})["preset"], "outdoor_day")
        room = json.loads((HERE / "examples/rooms/medium_room.json").read_text())
        self.assertEqual(acoustics.estimate(room)["preset"], "medium_room")

    def test_animated_proxy_is_not_silently_classified_as_open_sky(self):
        recipe = {"version": 1, "objects": [], "motion": {
            "version": 1, "room": {"dimensions": [4, 3, 4]}, "stateKeys": [
                {"frame": 0, "room": {"dimensions": [4, 3, 4]}},
                {"frame": 96, "room": {"dimensions": [8, 5, 8]}},
            ],
        }}
        with self.assertRaisesRegex(ValueError, "evaluated acoustic schedule"):
            acoustics.estimate(recipe)
        with self.assertRaisesRegex(ValueError, "static Acoustics and Reverb"):
            acoustics.DirectorSceneAcoustics().measure(json.dumps(recipe))

    def test_motion_cannot_hide_behind_legacy_room_objects(self):
        recipe = json.loads((HERE / "examples/rooms/medium_room.json").read_text())
        recipe["motion"] = {"version": 1, "stateKeys": []}
        with self.assertRaisesRegex(ValueError, "animated rooms"):
            acoustics.estimate(recipe)

    def test_malformed_motion_is_not_treated_as_a_static_recipe(self):
        for motion in (None, {}, [], ""):
            with self.assertRaises(ValueError):
                acoustics.estimate({"version": 1, "objects": [], "motion": motion})


if __name__ == "__main__":
    unittest.main()
