"""Reverb checks. No Comfy server needed:
python3 custom_nodes/director_world_builder/test_reverb.py
"""
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_nodes import HERE, load_package  # noqa: E402

RATE = 48000


def room(name):
    return (HERE / "examples/rooms" / f"{name}.json").read_text()


def t60(ir, rate):
    """Schroeder T20 extrapolated to 60 dB."""
    energy = np.cumsum(ir[::-1].astype(np.float64) ** 2)[::-1]
    curve = 10 * np.log10(energy / energy[0] + 1e-30)
    a, b = np.argmax(curve <= -5), np.argmax(curve <= -25)
    slope = np.polyfit(np.arange(a, b) / rate, curve[a:b], 1)[0]
    return -60 / slope


class Reverb(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        package = load_package(cls.temp.name)
        cls.node = package.NODE_CLASS_MAPPINGS["DirectorSceneReverb"]()
        cls.reverb = sys.modules["director_world_builder.reverb"]
        cls.ir = sys.modules["director_world_builder.ir"]
        rng = np.random.default_rng(1)
        cls.mono = {"waveform": torch.from_numpy(rng.standard_normal((1, 1, RATE)).astype(np.float32) * 0.1),
                    "sample_rate": RATE}
        cls.stereo = {"waveform": torch.from_numpy(rng.standard_normal((1, 2, RATE)).astype(np.float32) * 0.1),
                      "sample_rate": RATE}

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def run_node(self, audio, recipe, **kwargs):
        return self.node.apply(audio, recipe, **kwargs)

    def test_tail_reaches_minus_60_db_at_rt60(self):
        for name in ("medium_room", "cathedral"):
            model = self.ir.room_model(json.loads(room(name)))
            source, listener = self.ir.positions(model)
            ir, info = self.ir.impulse_response(model, source, listener, RATE, damping_high=0.0,
                                                early_late_balance=1.0, max_ir_seconds=12)
            self.assertAlmostEqual(t60(ir, RATE) / info["rt60"], 1.0, delta=0.15, msg=name)
            self.assertAlmostEqual(info["seconds"], info["early_end_s"] + 1.1 * info["rt60"], delta=0.01)

    def test_ir_length_follows_the_room_and_the_cap(self):
        _, small, small_text = self.run_node(self.mono, room("small_room"))
        _, big, big_text = self.run_node(self.mono, room("cathedral"))
        self.assertGreater(big["waveform"].shape[-1], 3 * small["waveform"].shape[-1])
        self.assertEqual(small["sample_rate"], RATE)
        self.assertEqual(tuple(small["waveform"].shape[:2]), (1, 1))
        self.assertTrue(big_text.startswith("cathedral · 12×30×18 m · RT60 5.2 s · IR 6.0 s"), big_text)
        self.assertTrue(small_text.startswith("small_room · 2.4×3.2×2.5 m"), small_text)
        _, capped, _ = self.run_node(self.mono, room("cathedral"), max_ir_seconds=2.0)
        self.assertEqual(capped["waveform"].shape[-1], 2 * RATE)

    def test_dry_only_returns_input_unchanged(self):
        out, _, _ = self.run_node(self.stereo, room("cathedral"), wet=0.0, dry=1.0)
        self.assertTrue(torch.equal(out["waveform"], self.stereo["waveform"]))

    def test_shape_and_rate_are_kept(self):
        for audio in (self.mono, self.stereo):
            out, _, _ = self.run_node(audio, room("empty_club"), wet=1.0, dry=0.0)
            self.assertEqual(out["waveform"].shape, audio["waveform"].shape)
            self.assertEqual(out["sample_rate"], RATE)
        out, _, _ = self.run_node(self.stereo, room("empty_club"), wet=1.0, dry=0.0)
        self.assertGreater(float(out["waveform"][0, 1].abs().max()), 0)

    def test_seed_is_deterministic(self):
        a = self.run_node(self.mono, room("medium_room"), seed=7)[1]["waveform"]
        b = self.run_node(self.mono, room("medium_room"), seed=7)[1]["waveform"]
        c = self.run_node(self.mono, room("medium_room"), seed=8)[1]["waveform"]
        self.assertTrue(torch.equal(a, b))
        self.assertFalse(torch.equal(a, c))

    def test_open_sky_is_short(self):
        outdoor = json.dumps({"version": 1, "light": 2, "objects": []})
        _, ir, text = self.run_node(self.mono, outdoor)
        self.assertLess(ir["waveform"].shape[-1], 0.6 * RATE)
        self.assertTrue(text.startswith("outdoor_day · open sky"), text)

    def test_numpy_and_torch_convolution_agree(self):
        rng = np.random.default_rng(3)
        signal, kernel = rng.standard_normal((2, 700000)), rng.standard_normal(5000)
        ref = np.stack([np.convolve(c, kernel)[:700000] for c in signal])
        via_numpy = self.reverb.convolve(signal, kernel)
        via_torch = self.reverb.convolve(torch.from_numpy(signal), kernel).numpy()
        self.assertLess(np.abs(via_numpy - ref).max(), 1e-8)
        self.assertLess(np.abs(via_torch - ref).max(), 1e-8)

    def test_scales_override_positions_and_limiter(self):
        base = self.ir.room_model(json.loads(room("medium_room")))
        bigger = self.ir.room_model(json.loads(room("medium_room")), size_scale=2.0, decay_scale=1.5)
        self.assertAlmostEqual(bigger["rt60"], base["rt60"] * 3, places=6)
        foam = self.ir.room_model(json.loads(room("medium_room")), material="foam")
        self.assertLess(foam["rt60"], base["rt60"] / 3)
        source, listener = self.ir.positions(base, "100,100,100", "0,1.6,0")
        self.assertTrue(np.all(source <= base["dims"]) and np.all(source >= 0))
        with self.assertRaises(ValueError):
            self.ir.positions(base, "1,2")
        out, _, text = self.run_node(self.mono, room("cathedral"), wet=1.0, dry=1.0, output_gain_db=12.0)
        self.assertLessEqual(float(out["waveform"].abs().max()), 0.99 + 1e-6)
        self.assertIn("peak-normalised", text)


if __name__ == "__main__":
    unittest.main()
