"""FFmpeg regression: a fractional total must reach atrim with a leading zero."""
from pathlib import Path
import json
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
TOOLS = all(shutil.which(tool) for tool in ("ffmpeg", "ffprobe", "bc", "awk"))


@unittest.skipUnless(TOOLS, "FFmpeg, FFprobe, bc and awk required")
class RoomReverb(unittest.TestCase):
    def test_half_second_dry_and_wet_outputs(self):
        with tempfile.TemporaryDirectory(prefix="key reverb ") as temp:
            folder = Path(temp)
            track, ir = folder / "track.wav", folder / "ir.wav"
            for path, audio in ((track, "sine=frequency=440:duration=7"), (ir, "sine=frequency=800:duration=0.05")):
                subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", audio, "-ar", "48000", str(path)],
                               check=True, capture_output=True, timeout=30)
            for space in ("dry", str(ir)):
                output = folder / ("dry.wav" if space == "dry" else "wet.wav")
                subprocess.run(["sh", str(ROOT / "workflows/room-reverb.sh"), str(track), "0", "0.5", str(output), space],
                               check=True, capture_output=True, timeout=60)
                result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(output)],
                                        check=True, capture_output=True, timeout=30)
                self.assertAlmostEqual(float(json.loads(result.stdout)["format"]["duration"]), 0.5, places=2)


if __name__ == "__main__":
    unittest.main()
