#!/usr/bin/env python3
"""Genobi voice mode's local speech-to-text worker: Qwen3-ASR through qwen-asr.

Adapted from X Console's voice worker (Support/voice_worker.py): the same model
loading (fp16 on Metal, fp32 on the CPU, Hugging Face libraries offline), the
same one-second warm-up and the same 28-second ceiling per model call. What
changed for Genobi: the local server decodes the audio, cuts the chunks and
gates silence (server/voice-audio.ts), so this worker only transcribes the
chunks it is given; and it talks over pipes instead of request files.

Protocol, one JSON object per line:
  1. The server starts `python -I voice_worker.py --model DIR`.
  2. The worker loads the model, warms it and prints {"event": "ready", ...}.
     Started when a recording starts, this is the prewarm.
  3. The server writes one request line to stdin:
     {"schema": 1, "pcmPath": "/abs/audio.f32", "chunks": [[start, end], ...],
      "context": "Genobi, Ninja, ..."}
     Offsets are 16 kHz samples into a little-endian float32 file.
  4. The worker prints {"event": "result", "segments": [...]} and exits.
Failures print {"event": "error", "code": "..."}: a fixed code, never model
text, exception detail or a path. Nothing touches the network.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import signal
import sys
import time

# Set BEFORE importing Transformers or Hugging Face libraries.
os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1",
                  TRANSFORMERS_VERBOSITY="error", TOKENIZERS_PARALLELISM="false",
                  PYTORCH_ENABLE_MPS_FALLBACK="1")

SAMPLE_RATE = 16_000
MAX_CHUNK_SAMPLES = 28 * SAMPLE_RATE
MAX_CHUNKS = 64
# Ten minutes of float32 at 16 kHz; the server's own ceiling is lower.
MAX_PCM_BYTES = 600 * SAMPLE_RATE * 4
MAX_NEW_TOKENS = 512
MAX_REQUEST_BYTES = 16_384
DEVICES = ("mps", "cpu")


class WorkerFailure(Exception):
    """A safe, fixed failure code."""


def emit(channel, payload: dict) -> None:
    channel.write(json.dumps(payload, ensure_ascii=False, allow_nan=False) + "\n")
    channel.flush()


def validate_request(raw: object) -> dict:
    if not isinstance(raw, dict) or raw.get("schema") != 1:
        raise WorkerFailure("invalid_request")
    pcm = Path(raw.get("pcmPath", ""))
    if not pcm.is_absolute() or pcm.is_symlink() or not pcm.is_file() or pcm.suffix != ".f32":
        raise WorkerFailure("invalid_audio_path")
    size = pcm.stat().st_size
    if size % 4 or size > MAX_PCM_BYTES:
        raise WorkerFailure("invalid_audio_size")
    samples = size // 4
    chunks = raw.get("chunks")
    if not isinstance(chunks, list) or not 0 < len(chunks) <= MAX_CHUNKS:
        raise WorkerFailure("invalid_chunks")
    for chunk in chunks:
        if (not isinstance(chunk, list) or len(chunk) != 2
                or not all(isinstance(v, int) and not isinstance(v, bool) for v in chunk)
                or not 0 <= chunk[0] < chunk[1] <= samples
                or chunk[1] - chunk[0] > MAX_CHUNK_SAMPLES):
            raise WorkerFailure("invalid_chunks")
    context = raw.get("context")
    if context is not None and (not isinstance(context, str) or len(context) > 2000 or "\0" in context):
        raise WorkerFailure("invalid_context")
    # The server sends a name from Qwen3-ASR's own list, or null to detect.
    language = raw.get("language")
    if language is not None and (not isinstance(language, str) or not 0 < len(language) <= 20
                                 or not language.isalpha()):
        raise WorkerFailure("invalid_language")
    return raw


def model_label(model_path: str, device: str) -> str:
    name = re.sub(r"[^A-Za-z0-9._-]", "", Path(model_path).name)[:48] or "Qwen3-ASR"
    return f"{name} · {'Metal' if device == 'mps' else 'CPU'}"


def load_model(model_path: str, requested: str | None):
    """Qwen3-ASR in fp16 on Metal, or fp32 on the CPU; one chunk per call."""
    import torch
    from qwen_asr import Qwen3ASRModel
    device = requested or "mps"
    if device == "mps" and not torch.backends.mps.is_available():
        device = "cpu"
    dtype = torch.float16 if device == "mps" else torch.float32
    model = Qwen3ASRModel.from_pretrained(model_path, dtype=dtype, device_map=device,
                                          max_inference_batch_size=1, max_new_tokens=MAX_NEW_TOKENS)

    def infer(audio, language=None, context=None):
        result = model.transcribe(audio=(audio, SAMPLE_RATE), language=language, context=context or "")[0]
        if device == "mps":
            torch.mps.empty_cache()
        return getattr(result, "text", ""), (getattr(result, "language", "") or None)

    return infer, device


def transcribe(request: dict, infer, language: str | None) -> dict:
    import numpy as np
    segments, languages = [], []
    started = time.monotonic()
    for start, end in request["chunks"]:
        audio = np.fromfile(request["pcmPath"], dtype="<f4", count=end - start, offset=start * 4)
        if len(audio) != end - start or not np.isfinite(audio).all():
            raise WorkerFailure("invalid_audio")
        # The server gates silence; this only skips numerical silence again.
        if float(np.sqrt(np.mean(audio.astype(np.float64) ** 2))) < 0.00003:
            text, found = "", None
        else:
            text, found = infer(audio, language, request.get("context"))
        if not isinstance(text, str):
            raise WorkerFailure("invalid_model_output")
        if found and found not in languages:
            languages.append(str(found))
        segments.append({"start": start / SAMPLE_RATE, "end": end / SAMPLE_RATE, "text": text.strip()})
    return {"event": "result", "segments": segments,
            "language": languages[0] if len(languages) == 1 else ("mixed" if languages else None),
            "inferSeconds": round(time.monotonic() - started, 3)}


def check(model_path: str) -> int:
    """Setup check: are the packages, Metal and the model folder in place?"""
    report: dict[str, object] = {"python": sys.version.split()[0]}
    try:
        import torch
        import qwen_asr  # noqa: F401
        from importlib.metadata import version
        report.update(torch=torch.__version__, qwen_asr=version("qwen-asr"),
                      metal=bool(torch.backends.mps.is_available()))
    except Exception as error:  # noqa: BLE001 - reported, not raised
        report["error"] = type(error).__name__
    model = Path(model_path)
    report["model"] = model.name
    report["model_ok"] = model.is_absolute() and (model / "config.json").is_file()
    print(json.dumps(report))
    return 0 if "error" not in report and report["model_ok"] else 1


def serve(model: str, device: str | None, language: str | None) -> int:
    # Protocol lines go to the original stdout; anything a library prints
    # goes to stderr, which the server discards.
    out = os.fdopen(os.dup(1), "w", encoding="utf-8")
    os.dup2(2, 1)
    try:
        path = Path(model)
        if not path.is_absolute() or not (path / "config.json").is_file():
            raise WorkerFailure("local_model_missing")
        started = time.monotonic()
        try:
            infer, used = load_model(model, device)
        except ImportError:
            raise WorkerFailure("packages_missing") from None
        load_seconds = round(time.monotonic() - started, 3)
        # One second of silence compiles the Metal kernels, so real audio runs
        # at full speed. A failure here costs only the warm-up.
        import numpy as np
        try:
            infer(np.zeros(SAMPLE_RATE, dtype=np.float32))
        except Exception:  # noqa: BLE001
            pass
        emit(out, {"event": "ready", "model": model_label(model, used), "loadSeconds": load_seconds,
                   "warmSeconds": round(time.monotonic() - started - load_seconds, 3)})
        line = sys.stdin.readline(MAX_REQUEST_BYTES + 1)
        if not line:
            return 0  # The server let a prewarmed worker go unused.
        if len(line) > MAX_REQUEST_BYTES:
            raise WorkerFailure("invalid_request")
        try:
            request = validate_request(json.loads(line))
        except json.JSONDecodeError:
            raise WorkerFailure("invalid_request") from None
        # The request's language wins over --language; null detects it.
        emit(out, transcribe(request, infer, request.get("language", language)))
        return 0
    except WorkerFailure as failure:
        emit(out, {"event": "error", "code": str(failure)})
        return 2
    except Exception as error:  # noqa: BLE001 - a type name only, never its text
        emit(out, {"event": "error", "code": type(error).__name__})
        return 2


def main() -> int:
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", help="the local Qwen3-ASR model folder")
    parser.add_argument("--device", choices=DEVICES, help="mps (default) or cpu")
    parser.add_argument("--language", help="a language hint such as English; detected when omitted")
    parser.add_argument("--check", metavar="MODEL_DIR", help="verify the environment and a model folder")
    args = parser.parse_args()
    if args.check:
        return check(args.check)
    if not args.model:
        parser.error("--model or --check is required")
    if args.language is not None and (len(args.language) > 80 or not args.language.replace(" ", "").isalpha()):
        parser.error("--language takes a language name")

    def stop(_signum, _frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    return serve(args.model, args.device, args.language)


if __name__ == "__main__":
    raise SystemExit(main())
