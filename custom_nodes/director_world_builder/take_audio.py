"""A take's sound from a connected AUDIO: the same length rule as the WAV path.
numpy and torch only, so the directory stays drop-in portable.
"""
import torch


def fit_audio(audio, seconds):
    """Trim or pad a Comfy AUDIO to `seconds` at its own sample rate.

    The take decides the length (frames / 24 fps); the input keeps its rate and
    channels, and anything short is padded with silence, as the WAV path does.
    """
    if not isinstance(audio, dict) or "waveform" not in audio or "sample_rate" not in audio:
        raise ValueError("Connect a Comfy AUDIO (waveform and sample_rate)")
    waveform, rate = audio["waveform"], audio["sample_rate"]
    if not isinstance(waveform, torch.Tensor) or type(rate) is not int or not 8000 <= rate <= 192000:
        raise ValueError("Use AUDIO at 8–192 kHz")
    if waveform.ndim != 3 or waveform.shape[0] != 1 or not 1 <= waveform.shape[1] <= 2:
        raise ValueError("Use mono or stereo AUDIO, one batch")
    if waveform.shape[2] > rate * 600:
        raise ValueError("Use AUDIO shorter than 10 minutes")
    samples = round(seconds * rate)
    source = waveform.detach().to(device="cpu", dtype=torch.float32)
    output = torch.zeros((1, source.shape[1], samples), dtype=torch.float32)
    keep = min(samples, source.shape[2])
    output[:, :, :keep] = source[:, :, :keep]
    return {"waveform": output, "sample_rate": rate}
