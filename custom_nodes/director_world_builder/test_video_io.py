"""WebM takes read and written with PyAV, no FFmpeg binary. No Comfy server needed:
python3 -m unittest custom_nodes/director_world_builder/test_video_io.py
"""
from fractions import Fraction
import json
from pathlib import Path
import tempfile
import unittest

import av
import numpy as np
import torch

from test_nodes import load_package


def write_webm(path, frames, fps=24, size=(256, 256)):
    """A flat-colour VP8 take: frame i is grey level 40 + 20·i, wrapping at 200."""
    with av.open(str(path), mode="w", format="webm") as container:
        stream = container.add_stream("libvpx", rate=Fraction(fps))
        stream.width, stream.height = size
        stream.pix_fmt = "yuv420p"
        stream.bit_rate = 4_000_000
        for i in range(frames):
            rgb = np.full((size[1], size[0], 3), 40 + 20 * (i % 9), dtype=np.uint8)
            frame = av.VideoFrame.from_ndarray(rgb, format="rgb24")
            frame.pts = i
            for packet in stream.encode(frame):
                container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)


class ReadWebm(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.node = load_package(self.root)
        self.recipe = {"version": 1, "fps": 24, "width": 256, "height": 256, "frames": 9}

    def tearDown(self):
        self.temp.cleanup()

    def read(self, name, **changes):
        return self.node.read_frames(self.node.input_path(name, {".webm"}), {**self.recipe, **changes})

    def test_a_matching_take_decodes_every_frame(self):
        write_webm(self.root / "take.webm", 9)
        frames = self.read("take.webm")
        self.assertEqual(tuple(frames.shape), (9, 256, 256, 3))
        self.assertEqual(frames.dtype, torch.float32)
        self.assertGreaterEqual(float(frames.min()), 0)
        self.assertLessEqual(float(frames.max()), 1)
        for i in (0, 4, 8):
            self.assertAlmostEqual(float(frames[i].mean()), (40 + 20 * i) / 255, delta=4 / 255)

    def test_the_capture_node_returns_the_take(self):
        write_webm(self.root / "take.webm", 9)
        frames, _, fps, *_ = self.node.DirectorSceneCapture().capture("take.webm", "", json.dumps(self.recipe))
        self.assertEqual((len(frames), fps), (9, 24.0))

    def test_a_wrong_frame_count_is_refused(self):
        write_webm(self.root / "long.webm", 17)
        write_webm(self.root / "short.webm", 5)
        for name in ("long.webm", "short.webm"):
            with self.assertRaisesRegex(ValueError, "frame count do not match"):
                self.read(name)

    def test_a_wrong_size_is_refused(self):
        write_webm(self.root / "wide.webm", 9, size=(320, 256))
        with self.assertRaisesRegex(ValueError, "do not match the recipe"):
            self.read("wide.webm")

    def test_a_wrong_fps_is_refused(self):
        write_webm(self.root / "thirty.webm", 9, fps=30)
        with self.assertRaisesRegex(ValueError, "do not match the recipe"):
            self.read("thirty.webm")

    def test_a_file_that_is_not_video_is_refused(self):
        (self.root / "junk.webm").write_bytes(b"not a webm at all" * 64)
        with self.assertRaises(ValueError):
            self.read("junk.webm")


class PrepareWebm(unittest.TestCase):
    def test_three_frames_become_a_decodable_webm(self):
        with tempfile.TemporaryDirectory() as temp:
            node = load_package(temp)
            images = torch.zeros((3, 64, 96, 3))
            images[1] = 0.5
            images[2] = 1
            out = node.DirectorSceneInputs().prepare(24, images=images)
            screen = out["ui"]["world_inputs"][0]["screen"][0]
            self.assertTrue(screen["filename"].endswith(".webm"))
            path = Path(temp) / screen["filename"]
            with av.open(str(path)) as container:
                self.assertEqual(len(container.streams.audio), 0)
                stream = container.streams.video[0]
                self.assertEqual(stream.codec_context.name, "vp8")
                self.assertEqual(Fraction(stream.guessed_rate), 24)
                decoded = [frame.to_ndarray(format="rgb24") for frame in container.decode(stream)]
            self.assertEqual(len(decoded), 3)
            self.assertEqual(decoded[0].shape, (64, 96, 3))
            self.assertLess(decoded[0].mean(), 10)
            self.assertGreater(decoded[2].mean(), 245)


if __name__ == "__main__":
    unittest.main()
