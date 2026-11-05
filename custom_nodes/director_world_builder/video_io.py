"""World Builder takes in and out of VP8 WebM with PyAV.

ComfyUI core requires PyAV (`av`), so this needs no FFmpeg or FFprobe binary
on PATH; a serverless deployment image ships none.
"""
from fractions import Fraction

import av
import numpy as np

from .capture_contract import MAX_FRAMES


def decode_webm(path, width, height, count):
    """Every frame of a 24 fps, width×height WebM as RGB uint8 (count, h, w, 3).

    The count is checked by decoding, never from container metadata, and
    decoding stops as soon as the stream runs past it.
    """
    if not 1 <= count <= MAX_FRAMES:
        raise ValueError("Invalid capture frame count")
    try:
        with av.open(str(path), mode="r", format="matroska") as container:
            if len(container.streams.video) != 1:
                raise ValueError("Expected one video stream")
            stream = container.streams.video[0]
            rate = stream.guessed_rate or stream.average_rate
            if (stream.codec_context.width, stream.codec_context.height) != (width, height) or rate is None or Fraction(rate) != 24:
                raise ValueError("Video dimensions, fps or frame count do not match the recipe")
            frames = np.empty((count, height, width, 3), dtype=np.uint8)
            decoded = 0
            for frame in container.decode(stream):
                if decoded >= count or (frame.width, frame.height) != (width, height):
                    raise ValueError("Video dimensions, fps or frame count do not match the recipe")
                frames[decoded] = frame.to_ndarray(format="rgb24")
                decoded += 1
    except av.FFmpegError as error:
        raise ValueError("Could not decode the World Builder video") from error
    if decoded != count:
        raise ValueError("Video dimensions, fps or frame count do not match the recipe")
    return frames


def encode_webm(path, images, fps):
    """Write RGB PIL images (even, equal sizes) as a VP8 WebM: ~4 Mbit/s, yuv420p, no audio."""
    rate = Fraction(fps).limit_denominator(1001)
    with av.open(str(path), mode="w", format="webm") as container:
        stream = container.add_stream("libvpx", rate=rate)
        stream.pix_fmt = "yuv420p"
        stream.bit_rate = 4_000_000
        for i, image in enumerate(images):
            if i == 0:
                stream.width, stream.height = image.size
            frame = av.VideoFrame.from_ndarray(np.asarray(image.convert("RGB")), format="rgb24")
            frame.pts = i
            frame.time_base = 1 / rate
            for packet in stream.encode(frame):
                container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)
