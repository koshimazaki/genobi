"""Browser-prepared guidance and a return path for Comfy images/audio.
No model calls, arbitrary URLs, scripts or headless browser execution.
"""
import hashlib
from pathlib import Path
import uuid
import wave

import numpy as np
import torch
from PIL import Image
import folder_paths

from .acoustics import DirectorSceneAcoustics
from .capture_contract import MAX_FRAMES, recipe_data
from .edges import canny, depth_batch
from .reverb import DirectorSceneReverb
from .storyboard import DirectorStoryboardGrid
from .take_audio import fit_audio
from .video_io import decode_webm, encode_webm

WEB_DIRECTORY = "./web"


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


def read_frames(path, recipe):
    w, h, count = recipe["width"], recipe["height"], recipe["frames"]
    if path.suffix.lower() == ".png":
        with Image.open(path) as image:
            if image.size != (w, h):
                raise ValueError("PNG dimensions do not match the recipe")
            data = np.array(image.convert("RGB"), dtype=np.float32)[None] / 255
        return torch.from_numpy(data)
    return torch.from_numpy(decode_webm(path, w, h, count).astype(np.float32) / 255)


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
            if images.ndim != 4 or images.shape[-1] != 3 or not 1 <= len(images) <= MAX_FRAMES or min(images.shape[1:3]) < 1:
                raise ValueError(f"Use a bounded RGB image batch (at most {MAX_FRAMES} frames)")
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
                encode_webm(root / name, (still(frame) for frame in images), fps)
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
