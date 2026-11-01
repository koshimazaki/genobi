"""Measured media timing; never round, resize, retime or silently pad inputs."""
from fractions import Fraction
import json
import math
from pathlib import Path
import subprocess


def probe(path, kind):
    entries = "stream=codec_type,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration,start_time,sample_rate,channels:format=duration"
    command = ["ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe", "-select_streams", kind,
               "-count_frames", "-show_streams", "-show_format", "-show_entries", entries, "-of", "json"]
    if kind == "v:0":
        command += ["-show_frames", "-show_entries", entries + ":frame=best_effort_timestamp_time,pkt_duration_time,duration_time"]
    try:
        result = subprocess.run([*command, str(Path(path).resolve())], check=True, capture_output=True, timeout=120)
        return json.loads(result.stdout)
    except FileNotFoundError:
        raise ValueError("Install ffprobe before preparing experiment inputs.") from None
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, ValueError):
        raise ValueError(f"ffprobe could not inspect {Path(path).name}.") from None


def number(value, name):
    try:
        result = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"Media has no measurable {name}.") from None
    if not math.isfinite(result):
        raise ValueError(f"Media has invalid {name}.")
    return result


def video_contract(metadata, timing, role="RGB guide"):
    streams = metadata.get("streams", [])
    if len(streams) != 1:
        raise ValueError(f"{role} needs one video stream.")
    stream, fps, count = streams[0], timing["fps"], timing["frames"]
    if (stream.get("width"), stream.get("height")) != (timing["width"], timing["height"]):
        raise ValueError(f"{role} dimensions do not match the recipe; no implicit resize is allowed.")
    try:
        frame_rate = Fraction(stream.get("r_frame_rate", "0"))
        measured_count = int(stream.get("nb_read_frames", "0"))
    except (ValueError, ZeroDivisionError):
        raise ValueError(f"{role} has no usable frame count/rate.") from None
    if frame_rate != fps or measured_count != count:
        raise ValueError(f"{role} must have exactly {count} frames at {fps} fps.")
    pts = [number(frame.get("best_effort_timestamp_time"), "frame timestamp") for frame in metadata.get("frames", [])]
    if len(pts) != count or any(abs(at - i / fps) > 0.0011 for i, at in enumerate(pts)):
        raise ValueError(f"{role} timestamps must start at zero and follow exact {fps} fps cadence (1.1 ms container tolerance).")
    duration = number(stream.get("duration", metadata.get("format", {}).get("duration")), "video duration")
    if abs(duration - count / fps) > 0.0011:
        raise ValueError(f"{role} duration must be {count}/{fps} seconds; no silent frame trim is allowed.")
    return {"width": stream["width"], "height": stream["height"], "frames": count,
            "fps": fps, "duration_seconds": duration, "frame_pts_seconds": pts}


def image_contract(metadata, timing):
    streams = metadata.get("streams", [])
    if len(streams) != 1 or not all(type(streams[0].get(k)) is int and streams[0][k] > 0 for k in ("width", "height")):
        raise ValueError("Look still must be a readable image.")
    width, height = streams[0]["width"], streams[0]["height"]
    target_width, target_height = timing["width"] * 2, timing["height"] * 2
    # Image generators can round an intended aspect to integer dimensions.
    # Bound the discrepancy at the final, larger stage: at most one output
    # pixel, never a general permission to crop an unrelated composition.
    width_error = abs(width * target_height / height - target_width)
    height_error = abs(height * target_width / width - target_height)
    error_pixels = max(width_error, height_error)
    if error_pixels > 1.0:
        raise ValueError("Look still must have the same aspect ratio as the first guide frame (at most one output pixel of integer rounding); align it before preparation.")
    return {"width": width, "height": height,
            "guide_dimensions": {"width": timing["width"], "height": timing["height"]},
            "expected_output_dimensions": {"width": target_width, "height": target_height},
            "aspect_error_output_pixels": {"width": width_error, "height": height_error, "maximum": error_pixels},
            "aspect_tolerance_output_pixels": 1.0,
            "resampling": {"nodes": ["71", "73"], "class_type": "LTXAddVideoICLoRAGuide",
                           "method": "bilinear", "crop": "center", "source_file_modified": False},
            "alignment": "aspect within recorded rounding tolerance; visual alignment needs review"}


def audio_contract(metadata, timing, start):
    streams = metadata.get("streams", [])
    if len(streams) != 1 or streams[0].get("codec_type") != "audio":
        raise ValueError("Control/original audio needs a readable audio stream.")
    stream = streams[0]
    try:
        rate, channels = int(stream["sample_rate"]), int(stream["channels"])
    except (KeyError, ValueError, TypeError):
        raise ValueError("Audio needs measurable sample rate and channels.") from None
    if not 8000 <= rate <= 192000 or channels not in (1, 2):
        raise ValueError("Audio must be mono or stereo at 8–192 kHz.")
    duration = number(stream.get("duration", metadata.get("format", {}).get("duration")), "audio duration")
    if duration > 600 or start < 0 or not math.isfinite(start):
        raise ValueError("Audio start must be finite/nonnegative; source length must be at most ten minutes.")
    start_sample, samples = start * rate, timing["frames"] * rate / timing["fps"]
    if abs(start_sample - round(start_sample)) > 1e-6 or abs(samples - round(samples)) > 1e-6:
        raise ValueError("Audio start and duration must land on source sample boundaries.")
    if duration + 1 / rate < start + timing["frames"] / timing["fps"]:
        raise ValueError("Control/original audio is too short; silence padding is refused.")
    return {"sample_rate": rate, "channels": channels, "source_duration_seconds": duration,
            "start_seconds": start, "start_sample": round(start_sample), "samples": round(samples),
            "duration_seconds": timing["frames"] / timing["fps"]}
