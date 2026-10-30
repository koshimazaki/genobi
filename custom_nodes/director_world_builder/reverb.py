"""World Builder · Reverb: convolve audio with an impulse response computed from the recipe's room.
CPU only. torch.fft when the waveform is a tensor (ComfyUI), numpy.fft otherwise.
"""
import math

import numpy as np

from .acoustics import parse
from .ir import MATERIALS, impulse_response, positions, room_model

try:
    import torch
except ImportError:  # the numpy path keeps the maths testable without torch
    torch = None

MAX_SECONDS = 600
BLOCK = 1 << 18


def _fast_length(n):
    return 1 << max(n - 1, 1).bit_length()


def convolve(signal, ir):
    """Linear convolution of [..., N] with a 1-D IR, truncated to N, by block overlap-add.

    Blocks keep memory bounded: each FFT is at most next_pow2(BLOCK + len(ir)).
    """
    count, taps = signal.shape[-1], len(ir)
    size = _fast_length(BLOCK + taps - 1)
    is_torch = torch is not None and isinstance(signal, torch.Tensor)
    if is_torch:
        fft, ifft = torch.fft.rfft, torch.fft.irfft
        kernel = fft(torch.as_tensor(ir, dtype=signal.dtype, device=signal.device), n=size)
        out = torch.zeros_like(signal)
    else:
        fft, ifft = np.fft.rfft, np.fft.irfft
        kernel = fft(np.asarray(ir, dtype=np.float64), n=size)
        out = np.zeros(signal.shape, dtype=np.float64)
    for start in range(0, count, BLOCK):
        block = signal[..., start:start + BLOCK]
        if is_torch:
            piece = ifft(fft(block, n=size) * kernel, n=size)
        else:
            piece = ifft(fft(block, n=size, axis=-1) * kernel, n=size, axis=-1)
        stop = min(count, start + size)
        out[..., start:stop] += piece[..., :stop - start]
    return out


def mix(signal, ir, wet, dry, gain_db):
    """dry·x + wet·(x * ir), with gain; peak-normalised to 0.99 only when it would exceed it."""
    out = convolve(signal, ir) * wet + signal * dry if wet else signal * dry
    out = out * (10 ** (gain_db / 20))
    peak = float(abs(out).max()) if out.shape[-1] else 0.0
    if peak > 0.99:
        out = out * (0.99 / peak)
        return out, 20 * math.log10(0.99 / peak)
    return out, 0.0


def describe(model, info, limited_db):
    if model["outdoor"]:
        room = "open sky"
    else:
        w, h, length = (round(float(v), 2) for v in model["dims"])
        room = f"{w:g}×{length:g}×{h:g} m"
    text = f"{model['preset']} · {room} · RT60 {info['rt60']:.1f} s · IR {info['seconds']:.1f} s"
    if limited_db:
        text += f" · peak-normalised {limited_db:.1f} dB"
    return text


class DirectorSceneReverb:
    """Reverb whose impulse response is computed from the room built in World Builder."""

    @classmethod
    def INPUT_TYPES(cls):
        f = lambda default, lo, hi, step: ("FLOAT", {"default": default, "min": lo, "max": hi, "step": step})
        return {"required": {
            "audio": ("AUDIO",),
            "recipe": ("STRING", {"default": "{}", "multiline": True, "forceInput": True}),
            "size_scale": f(1.0, 0.25, 4.0, 0.05),
            "decay_scale": f(1.0, 0.25, 4.0, 0.05),
            "damping_high": f(0.3, 0.0, 1.0, 0.05),
            "pre_delay_ms": f(0.0, 0.0, 200.0, 1.0),
            "early_late_balance": f(0.5, 0.0, 1.0, 0.05),
            "wet": f(0.35, 0.0, 1.0, 0.01),
            "dry": f(1.0, 0.0, 1.0, 0.01),
            "material_override": (MATERIALS, {"default": "none"}),
            "max_ir_seconds": f(6.0, 0.5, 12.0, 0.5),
            "seed": ("INT", {"default": 0, "min": 0, "max": 2 ** 32 - 1}),
            "output_gain_db": f(0.0, -24.0, 12.0, 0.5),
        }, "optional": {
            "source_position": ("STRING", {"default": ""}),
            "listener_position": ("STRING", {"default": ""}),
        }}

    RETURN_TYPES = ("AUDIO", "AUDIO", "STRING")
    RETURN_NAMES = ("audio", "impulse_response", "summary")
    FUNCTION = "apply"
    CATEGORY = "Director/World Builder"

    def apply(self, audio, recipe, size_scale=1.0, decay_scale=1.0, damping_high=0.3, pre_delay_ms=0.0,
              early_late_balance=0.5, wet=0.35, dry=1.0, material_override="none", max_ir_seconds=6.0,
              seed=0, output_gain_db=0.0, source_position="", listener_position=""):
        waveform, rate = audio["waveform"], audio["sample_rate"]
        if type(rate) is not int or not 8000 <= rate <= 192000:
            raise ValueError("Sample rate must be 8–192 kHz")
        if waveform.ndim != 3 or not 1 <= waveform.shape[1] <= 8 or waveform.shape[2] > rate * MAX_SECONDS:
            raise ValueError("Use AUDIO shaped [batch, channels ≤ 8, samples], up to 10 minutes")
        if material_override not in MATERIALS:
            raise ValueError("Unknown material_override")
        bounded = lambda v, lo, hi: min(max(float(v), lo), hi)
        model = room_model(parse(recipe), bounded(size_scale, 0.25, 4), bounded(decay_scale, 0.25, 4), material_override)
        source, listener = positions(model, source_position, listener_position)
        ir, info = impulse_response(model, source, listener, rate, damping_high=bounded(damping_high, 0, 1),
                                    pre_delay_ms=bounded(pre_delay_ms, 0, 200),
                                    early_late_balance=bounded(early_late_balance, 0, 1),
                                    max_ir_seconds=bounded(max_ir_seconds, 0.5, 12), seed=int(seed) % 2 ** 32)
        signal = waveform.detach().float() if torch is not None and isinstance(waveform, torch.Tensor) else np.asarray(waveform, dtype=np.float32)
        out, limited = mix(signal, ir, bounded(wet, 0, 1), bounded(dry, 0, 1), bounded(output_gain_db, -24, 12))
        to_tensor = (lambda a: torch.from_numpy(np.ascontiguousarray(a, dtype=np.float32))) if torch is not None else np.asarray
        if not (torch is not None and isinstance(out, torch.Tensor)):
            out = to_tensor(out)
        return ({"waveform": out, "sample_rate": rate},
                {"waveform": to_tensor(ir[None, None]), "sample_rate": rate},
                describe(model, info, limited))
