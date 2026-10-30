"""Browser-prepared guidance and a return path for Comfy images/audio.
No model calls, arbitrary URLs, scripts or headless browser execution.
"""
import hashlib
from fractions import Fraction
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import uuid
import wave

import numpy as np
import torch
from PIL import Image
import folder_paths

from .acoustics import DirectorSceneAcoustics
from .edges import canny, depth_batch
from .reverb import DirectorSceneReverb
from .storyboard import DirectorStoryboardGrid
from .take_audio import fit_audio

WEB_DIRECTORY = "./web"


def recipe_data(text):
    if not isinstance(text, str) or len(text.encode()) > 64000:
        raise ValueError("Recipe must be JSON under 64 KB")
    data = json.loads(text)
    if not isinstance(data, dict) or data.get("version") != 1 or data.get("fps") != 24:
        raise ValueError("Expected World Builder recipe v1 at 24 fps")
    for key in ("width", "height"):
        n = data.get(key)
        if type(n) is not int or n < 256 or n > 1920 or n % 64:
            raise ValueError("Invalid capture dimensions")
    n = data.get("frames")
    if type(n) is not int or n < 9 or n > 241 or (n - 1) % 8:
        raise ValueError("Invalid capture frame count")
    for key in ("loop", "screen"):
        if key in data and type(data[key]) is not bool:
            raise ValueError(f"Recipe {key} must be true or false")
    if data["width"] * data["height"] * n * 12 > 2 * 1024 * 1024 * 1024:
        raise ValueError("Decoded take exceeds 2 GiB; reduce size or frames")
    return data


def input_path(name, extensions):
    if not isinstance(name, str) or len(name) > 240:
        raise ValueError("Invalid capture filename")
    root = Path(folder_paths.get_input_directory()).resolve()
    path = (root / name).resolve()
    if not path.is_relative_to(root) or not path.is_file() or path.suffix.lower() not in extensions:
        raise ValueError("Choose an uploaded World Builder capture")
    if path.stat().st_size > 128 * 1024 * 1024:
        raise ValueError("Capture exceeds 128 MB")
    return path


# ComfyUI Desktop launches the server with a minimal PATH on macOS, so a
# Homebrew or MacPorts FFmpeg is looked up in its usual directories as well.
TOOL_DIRS = ("/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin")


def find_tool(name):
    """Absolute path of `name` on PATH or in the usual package-manager directories."""
    found = shutil.which(name)
    if found:
        return found
    for directory in TOOL_DIRS:
        candidate = Path(directory) / name
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return None


def ffmpeg(args):
    binary = find_tool("ffmpeg")
    if not binary:
        raise RuntimeError("Install FFmpeg for World Builder video inputs")
    subprocess.run([binary, "-v", "error", "-nostdin", "-y", *args], check=True,
                   timeout=60, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def read_frames(path, recipe):
    w, h, count = recipe["width"], recipe["height"], recipe["frames"]
    if path.suffix.lower() == ".png":
        with Image.open(path) as image:
            if image.size != (w, h):
                raise ValueError("PNG dimensions do not match the recipe")
            data = np.array(image.convert("RGB"), dtype=np.float32)[None] / 255
        return torch.from_numpy(data)
    probe = find_tool("ffprobe")
    if not probe:
        raise RuntimeError("Install FFprobe with FFmpeg for World Builder video inputs")
    metadata = subprocess.run([probe, "-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", "v:0",
        "-count_frames", "-show_entries", "stream=width,height,r_frame_rate,nb_read_frames", "-of", "json", str(path)],
        check=True, timeout=60, capture_output=True)
    streams = json.loads(metadata.stdout).get("streams", [])
    if len(streams) != 1:
        raise ValueError("Expected one video stream")
    stream = streams[0]
    if stream.get("width") != w or stream.get("height") != h or Fraction(stream.get("r_frame_rate", "0")) != 24 or int(stream.get("nb_read_frames", 0)) != count:
        raise ValueError("Video dimensions, fps or frame count do not match the recipe")
    with tempfile.TemporaryDirectory(prefix="director-frames-") as temp:
        out = Path(temp) / "frames.rgb"
        ffmpeg(["-protocol_whitelist", "file,pipe", "-i", str(path), "-an", "-frames:v", str(count), "-pix_fmt", "rgb24", "-f", "rawvideo", str(out)])
        raw = np.fromfile(out, dtype=np.uint8)
        if raw.size != w * h * count * 3:
            raise ValueError("Video frame count does not match the recipe")
        return torch.from_numpy(raw.reshape(count, h, w, 3).astype(np.float32) / 255)


def read_audio(name, seconds):
    samples = round(seconds * 48000)
    if not name:
        return {"waveform": torch.zeros((1, 1, samples)), "sample_rate": 48000}
    path = input_path(name, {".wav"})
    with wave.open(str(path), "rb") as wav:
        if wav.getsampwidth() != 2 or wav.getnchannels() not in (1, 2) or wav.getframerate() != 48000:
            raise ValueError("Use the matching 48 kHz PCM WAV exported by World Builder")
        channels = wav.getnchannels()
        raw = np.frombuffer(wav.readframes(samples), dtype="<i2").astype(np.float32) / 32768
        raw = raw.reshape(-1, channels).T
        output = np.zeros((1, channels, samples), dtype=np.float32)
        output[0, :, :raw.shape[1]] = raw
        return {"waveform": torch.from_numpy(output), "sample_rate": 48000}


def preview_images(*batches):
    """The take's first frame (then depth and canny) as the node's own preview."""
    root = Path(folder_paths.get_temp_directory())
    root.mkdir(parents=True, exist_ok=True)
    uid = "director-preview-" + uuid.uuid4().hex
    shown = []
    for i, batch in enumerate(batches):
        image = Image.fromarray((batch[0].detach().cpu().clamp(0, 1).numpy() * 255).astype(np.uint8))
        image.thumbnail((512, 512))
        name = f"{uid}-{i}.png"
        image.save(root / name)
        shown.append({"filename": name, "subfolder": "", "type": "temp"})
    return shown


class DirectorSceneCapture:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"capture_file": ("STRING", {"default": ""}),
                "audio_file": ("STRING", {"default": ""}),
                "recipe_json": ("STRING", {"default": "{}", "multiline": True})},
                # A connected AUDIO (LoadAudio, a generator) is the take's sound
                # and wins over audio_file; both follow the same length rule.
                "optional": {"depth_file": ("STRING", {"default": ""}), "audio": ("AUDIO",)}}

    RETURN_TYPES = ("IMAGE", "AUDIO", "FLOAT", "STRING", "IMAGE", "IMAGE")
    RETURN_NAMES = ("frames", "audio", "fps", "recipe", "depth", "canny")
    FUNCTION = "run"
    CATEGORY = "Director/World Builder"

    @classmethod
    def IS_CHANGED(cls, capture_file, audio_file, recipe_json, depth_file="", **_linked):
        digest = hashlib.sha256(recipe_json.encode())
        for name, extensions in ((capture_file, {".png", ".webm"}), (audio_file, {".wav"}), (depth_file, {".png", ".webm"})):
            if name:
                with input_path(name, extensions).open("rb") as source:
                    for block in iter(lambda: source.read(1024 * 1024), b""):
                        digest.update(block)
        return digest.hexdigest()

    def capture(self, capture_file, audio_file, recipe_json, depth_file="", audio=None):
        recipe = recipe_data(recipe_json)
        frames = read_frames(input_path(capture_file, {".png", ".webm"}), recipe)
        seconds = len(frames) / 24
        audio = fit_audio(audio, seconds) if audio is not None else read_audio(audio_file, seconds)
        depth = read_frames(input_path(depth_file, {".png", ".webm"}), recipe) if depth_file else None
        return (frames, audio, 24.0, recipe_json, depth_batch(frames, depth), canny(frames))

    def run(self, capture_file, audio_file, recipe_json, depth_file="", audio=None):
        result = self.capture(capture_file, audio_file, recipe_json, depth_file, audio)
        # Depth is a black batch without depth_file, so it is shown only when captured.
        shown = (result[0], result[4], result[5]) if depth_file else (result[0], result[5])
        return {"ui": {"images": preview_images(*shown)}, "result": result}


class DirectorSceneInputs:
    """Prepare a Comfy image/video-frame batch or generated song for the browser.
    Queue this output node, then send its preview to an open Capture node.
    """
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"fps": ("FLOAT", {"default": 24, "min": 1, "max": 60})},
                "optional": {"images": ("IMAGE",), "audio": ("AUDIO",)}}

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "prepare"
    CATEGORY = "Director/World Builder"

    def prepare(self, fps, images=None, audio=None):
        root = Path(folder_paths.get_temp_directory())
        root.mkdir(parents=True, exist_ok=True)
        uid = "director-" + uuid.uuid4().hex
        ui = {}
        if images is not None:
            if images.ndim != 4 or images.shape[-1] != 3 or not 1 <= len(images) <= 241 or min(images.shape[1:3]) < 1:
                raise ValueError("Use a bounded RGB image batch (at most 241 frames)")
            if not 1 <= fps <= 60:
                raise ValueError("FPS must be 1–60")
            # The screen is a preview: a full-size render (145 frames at
            # 2048×1152 is ~1G values) is shrunk to the 320M-value budget, not refused.
            scale = min(1.0, (320 * 1024 * 1024 / images.numel()) ** 0.5)
            size = (max(2, int(images.shape[2] * scale) // 2 * 2), max(2, int(images.shape[1] * scale) // 2 * 2))

            def still(frame):
                image = Image.fromarray((frame.detach().cpu().clamp(0, 1).numpy() * 255).astype(np.uint8))
                return image if scale == 1.0 else image.resize(size, Image.LANCZOS)

            if len(images) == 1:
                name = uid + ".png"
                still(images[0]).save(root / name)
            else:
                name = uid + ".webm"
                with tempfile.TemporaryDirectory(prefix="director-input-") as temp:
                    for i, frame in enumerate(images):
                        still(frame).save(Path(temp) / f"{i:04d}.png")
                    ffmpeg(["-framerate", str(fps), "-i", str(Path(temp) / "%04d.png"), "-c:v", "libvpx", "-b:v", "4M", "-an", str(root / name)])
            ui["screen"] = [{"filename": name, "subfolder": "", "type": "temp"}]
        if audio is not None:
            waveform = audio["waveform"].detach().cpu()
            rate = audio["sample_rate"]
            if type(rate) is not int or not 8000 <= rate <= 192000 or waveform.ndim != 3 or waveform.shape[0] != 1 or not 1 <= waveform.shape[1] <= 2 or waveform.shape[2] > rate * 600:
                raise ValueError("Use mono/stereo audio, one batch, up to 10 minutes")
            name = uid + ".wav"
            samples = (waveform[0].T.clamp(-1, 1).numpy() * 32767).astype("<i2")
            with wave.open(str(root / name), "wb") as wav:
                wav.setnchannels(waveform.shape[1]); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(samples.tobytes())
            ui["soundtrack"] = [{"filename": name, "subfolder": "", "type": "temp"}]
        return {"ui": {"world_inputs": [ui]}, "result": ()}


NODE_CLASS_MAPPINGS = {"DirectorSceneCapture": DirectorSceneCapture, "DirectorSceneInputs": DirectorSceneInputs,
                       "DirectorSceneAcoustics": DirectorSceneAcoustics, "DirectorStoryboardGrid": DirectorStoryboardGrid,
                       "DirectorSceneReverb": DirectorSceneReverb}
NODE_DISPLAY_NAME_MAPPINGS = {"DirectorSceneCapture": "World Builder · Capture", "DirectorSceneInputs": "World Builder · Inputs",
                              "DirectorSceneAcoustics": "World Builder · Acoustics",
                              "DirectorStoryboardGrid": "World Builder · Storyboard",
                              "DirectorSceneReverb": "World Builder · Reverb"}
