#!/usr/bin/env python3
"""Genobi's optional audio analysis worker: librosa's view of a track.

The core analysis needs no Python (shared/audio-analysis.ts). When
GENOBI_AUDIO_PYTHON names a Python with requirements.txt installed, an agent
can also ask for this worker's answer, which the server adds to the same
report under `librosa`.

Protocol, one process per request:
  1. The server starts `python -I audio_worker.py`.
  2. It writes one header line to stdin:
     {"schema": 1, "sampleRate": 22050, "samples": N}
     then N little-endian float32 samples (mono, decoded by ffmpeg).
  3. The worker prints one line, {"event": "result", ...}, and exits.
`--check` only imports the libraries and prints {"event": "ready", ...}.
Failures print {"event": "error", "code": "..."}: a fixed code, never
exception detail or a path. Nothing touches the network or the disk.

The result holds raw beats (librosa.beat.beat_track), the power under 150 Hz
at each beat, onsets per band and section boundaries. The server fits the
straight grid and the downbeat with the same code the core analysis uses.

The audio arrives already decoded, so librosa.load and resampling are never
called. librosa still imports soxr when it loads; a stand-in module takes its
place so the worker does not depend on a native resampler built for another
NumPy (the failure seen with Homebrew's soxr under NumPy 2).
"""
from __future__ import annotations

import json
import sys
import types

SAMPLE_RATE = 22_050
# Twenty minutes, the studio's audio ceiling, plus a second.
MAX_SAMPLES = (20 * 60 + 1) * SAMPLE_RATE
MAX_HEADER_BYTES = 4096
N_FFT = 2048
HOP = 512
BANDS = {"kick": (30, 150), "snare": (200, 5000), "hat": (5000, 11025)}


class WorkerFailure(Exception):
    """A safe, fixed failure code."""


def emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, allow_nan=False) + "\n")
    sys.stdout.flush()


def load_libraries():
    sys.modules.setdefault("soxr", types.ModuleType("soxr"))
    try:
        import numpy
        import librosa
        import librosa.beat
        import librosa.feature
        import librosa.onset
        import librosa.segment
    except ImportError as error:
        raise WorkerFailure("packages_missing") from error
    return numpy, librosa


def read_request(stream, np):
    header = stream.readline(MAX_HEADER_BYTES)
    try:
        request = json.loads(header)
    except ValueError as error:
        raise WorkerFailure("invalid_request") from error
    count = request.get("samples") if isinstance(request, dict) else None
    if (not isinstance(request, dict) or request.get("schema") != 1
            or request.get("sampleRate") != SAMPLE_RATE
            or not isinstance(count, int) or isinstance(count, bool)
            or not SAMPLE_RATE // 2 <= count <= MAX_SAMPLES):
        raise WorkerFailure("invalid_request")
    data = bytearray()
    while len(data) < count * 4:
        part = stream.read(count * 4 - len(data))
        if not part:
            raise WorkerFailure("invalid_audio")
        data.extend(part)
    samples = np.frombuffer(bytes(data), dtype="<f4").astype(np.float32)
    if not np.all(np.isfinite(samples)):
        raise WorkerFailure("invalid_audio")
    return samples


def seconds(values) -> list:
    return [round(float(v), 4) for v in values]


def analyse(y, np, librosa) -> dict:
    sr = SAMPLE_RATE
    spectrum = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=N_FFT)
    envelope = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    tempo, frames = librosa.beat.beat_track(onset_envelope=envelope, sr=sr, hop_length=HOP)
    low = (spectrum[(freqs > 0) & (freqs < 150)] ** 2).sum(axis=0)
    energy = [float(low[max(0, f - 2):f + 3].max()) for f in frames]
    onsets = {}
    for name, (lo, hi) in BANDS.items():
        band = spectrum[(freqs >= lo) & (freqs < hi)]
        if band.size == 0 or band.max() <= 0:
            onsets[name] = []
            continue
        strength = librosa.onset.onset_strength(
            S=librosa.amplitude_to_db(band, ref=np.max), sr=sr, hop_length=HOP)
        onsets[name] = seconds(librosa.onset.onset_detect(
            onset_envelope=strength, sr=sr, hop_length=HOP, units="time"))
    mel = librosa.feature.melspectrogram(S=spectrum ** 2, sr=sr)
    mfcc = librosa.feature.mfcc(S=librosa.power_to_db(mel), n_mfcc=13)
    duration = len(y) / sr
    parts = int(min(12, max(2, round(duration / 30) + 1)))
    sections = []
    if mfcc.shape[1] > parts:
        bounds = librosa.segment.agglomerative(mfcc, parts)
        sections = seconds(t for t in librosa.frames_to_time(bounds, sr=sr, hop_length=HOP) if t > 0)
    return {
        "event": "result",
        "version": librosa.__version__,
        "tempo": round(float(np.atleast_1d(tempo)[0]), 3),
        "beats": seconds(librosa.frames_to_time(frames, sr=sr, hop_length=HOP)),
        "beatLowEnergy": energy,
        "onsets": onsets,
        "sections": sections,
    }


def main() -> int:
    try:
        np, librosa = load_libraries()
        if "--check" in sys.argv[1:]:
            emit({"event": "ready", "version": librosa.__version__})
            return 0
        samples = read_request(sys.stdin.buffer, np)
        emit(analyse(samples, np, librosa))
        return 0
    except WorkerFailure as failure:
        emit({"event": "error", "code": str(failure)})
    except Exception:  # noqa: BLE001 - a fixed code, never the detail
        emit({"event": "error", "code": "analysis_failed"})
    return 2


if __name__ == "__main__":
    sys.exit(main())
