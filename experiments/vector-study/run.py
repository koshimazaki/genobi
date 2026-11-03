#!/usr/bin/env python3
"""Bounded local tracing experiment. No network, providers, or private inputs."""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import io
import json
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET

import cairosvg
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import vtracer

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = ROOT / "public/media/director-templates/dimensions-mix/mix-02.mp4"
SIZE, FPS, FRAMES = 256, 12, 24
PERIOD = FRAMES / FPS
NS = "{http://www.w3.org/2000/svg}"
OPTIONS = dict(
    colormode="color", hierarchical="stacked", mode="spline",
    filter_speckle=16, color_precision=4, layer_difference=48,
    corner_threshold=60, length_threshold=4, max_iterations=10,
    splice_threshold=45, path_precision=2,
)

DETAIL_OPTIONS = {**OPTIONS, "filter_speckle": 4, "color_precision": 6, "layer_difference": 16}


def command(*args: str) -> None:
    subprocess.run(args, check=True, capture_output=True)


def shell_svg(body: str, label: str) -> str:
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" '
            f'viewBox="0 0 256 256"><title>{label}</title>{body}</svg>')


def kinetic_svg(time: float | None = None) -> str:
    """Authored control: fixed identities, analytic rotation, no video inference."""
    def rotation(rate: float) -> str:
        if time is not None:
            return f'<g transform="rotate({360 * rate * time / PERIOD:.8f} 128 128)">'
        return ('<g><animateTransform attributeName="transform" type="rotate" '
                f'from="0 128 128" to="{360 * rate:g} 128 128" '
                f'dur="{PERIOD:g}s" repeatCount="indefinite"/>')

    body = ['<path id="background" fill="#10191e" d="M0 0H256V256H0Z"/>',
            '<path id="rim" fill="none" stroke="#32464b" stroke-width="1" '
            'd="M238 128A110 110 0 1 0 18 128A110 110 0 1 0 238 128Z"/>',
            rotation(1)]
    for i in range(12):
        body.append(f'<path id="petal-{i}" fill="#ffba69" '
                    f'transform="translate(128 128) rotate({i * 30})" '
                    'd="M-6-99Q-6-105 0-105Q6-105 6-99V-74'
                    'Q6-68 0-68Q-6-68-6-74Z"/>')
    body.extend(['</g>', rotation(-1)])
    for i in range(8):
        body.append(f'<path id="blade-{i}" fill="#69d5c1" '
                    f'transform="translate(128 128) rotate({i * 45})" '
                    'd="M0-59L12-33L0-20L-5-38Z"/>')
    body.extend(['</g>', rotation(1)])
    for i in range(4):
        body.append(f'<path id="orbit-{i}" fill="#ee759a" '
                    f'transform="translate(128 128) rotate({15 + i * 90})" '
                    'd="M4-57A4 4 0 1 0-4-57A4 4 0 1 0 4-57Z"/>')
    body.extend(['</g>', '<path id="hub" fill="#ffba69" '
                 'd="M140 128A12 12 0 1 0 116 128A12 12 0 1 0 140 128Z"/>'])
    return shell_svg("".join(body), "Authored kinetic control - continuous SVG transforms")


def svg_facts(svg: str) -> tuple[dict, tuple]:
    tree = ET.fromstring(svg)
    # Raster embeddings or foreign HTML would invalidate this experiment.
    assert not any(node.tag in {NS + "image", NS + "foreignObject"} for node in tree.iter())
    assert "data:image" not in svg
    paths = list(tree.iter(NS + "path"))
    signatures = tuple(tuple(re.findall(r"[AaCcHhLlMmQqSsTtVvZz]", p.attrib["d"])) for p in paths)
    return {
        "paths": len(paths), "commands": sum(map(len, signatures)),
        "svg_bytes": len(svg.encode()),
    }, signatures


def raster(svg: str) -> Image.Image:
    data = cairosvg.svg2png(bytestring=svg.encode(), output_width=SIZE, output_height=SIZE)
    return Image.open(io.BytesIO(data)).convert("RGB")


def flipbook(svgs: list[str]) -> str:
    """A genuine path-only SVG, but discrete frame replacement, not path morphing."""
    groups = []
    for i, svg in enumerate(svgs):
        tree = ET.fromstring(svg)
        body = "".join(ET.tostring(child, encoding="unicode") for child in tree)
        # Duplicate endpoints are collapsed, retaining the later state.
        states = dict([(0.0, "hidden"), (i / FRAMES, "visible"),
                       ((i + 1) / FRAMES, "hidden"), (1.0, "hidden")])
        keys = sorted(states)
        timing = ";".join(f"{key:.8f}" for key in keys)
        values = ";".join(states[key] for key in keys)
        groups.append(f'<g visibility="{"visible" if i == 0 else "hidden"}">{body}'
                      '<animate attributeName="visibility" calcMode="discrete" '
                      f'keyTimes="{timing}" values="{values}" dur="{PERIOD:g}s" '
                      'repeatCount="indefinite"/></g>')
    return shell_svg("".join(groups), "Existing H3 excerpt - independent vector frames at 12 fps")


def summarize(rows: list[dict], signatures: list[tuple], errors: list[np.ndarray]) -> dict:
    counts = np.array([row["paths"] for row in rows])
    deltas = np.abs(np.diff(counts))
    churn = sum(a != b for a, b in zip(signatures, signatures[1:]))
    residual = [float(np.abs(b - a).mean()) for a, b in zip(errors, errors[1:])]
    return {
        "frames": len(rows), "path_min": int(counts.min()), "path_max": int(counts.max()),
        "path_mean": round(float(counts.mean()), 3),
        "path_count_cv": round(float(counts.std() / counts.mean()), 4),
        "mean_absolute_path_count_change": round(float(deltas.mean()), 3),
        "command_layout_changed_transitions": churn, "transitions": len(rows) - 1,
        "total_independent_svg_bytes": sum(row["svg_bytes"] for row in rows),
        "mean_rgb_absolute_error_0_255": round(float(np.mean([np.abs(e).mean() for e in errors])), 3),
        "mean_adjacent_residual_change_0_255": round(float(np.mean(residual)), 3),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "previews")
    args = parser.parse_args()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    source = DEFAULT_SOURCE.resolve()
    if not source.is_file():
        parser.error(f"Missing local source: {source}")
    report = {
        "source": str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else source.name,
        "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "source_note": "Existing owner-supplied MiniMax H3 output; no new generation.",
        "start_seconds": 1, "duration_seconds": PERIOD, "sample_fps": FPS,
        "raster_size": [SIZE, SIZE], "trace_options": {"compact": OPTIONS, "detail": DETAIL_OPTIONS},
        "versions": {name: importlib.metadata.version(name) for name in ["vtracer", "cairosvg", "pillow", "numpy"]},
        "ffmpeg": subprocess.check_output(["ffmpeg", "-version"], text=True).splitlines()[0],
    }
    continuous = kinetic_svg()
    (out / "kinetic-control.svg").write_text(continuous)
    control_paths, _ = svg_facts(continuous)
    report["authored_control"] = {**control_paths, "identity_changes": 0,
                                  "method": "Known geometry animated by rigid transforms; not inferred from footage."}
    with tempfile.TemporaryDirectory(prefix="genobi-vector-") as scratch:
        work = Path(scratch)
        command("ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "1", "-i", str(source),
                "-t", str(PERIOD), "-vf", f"fps={FPS},scale={SIZE}:{SIZE}:flags=lanczos",
                "-frames:v", str(FRAMES), str(work / "source-%03d.png"))
        # This is a deliberately square crop-free source; refuse silent distortion.
        probe = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "stream=width,height", "-of", "json", str(source)]))
        video = next(s for s in probe["streams"] if "width" in s)
        assert video["width"] == video["height"], "This study expects a square source."
        assert len(list(work.glob("source-*.png"))) == FRAMES
        records = {name: {"rows": [], "signatures": [], "errors": [], "svgs": []}
                   for name in ["h3_trace", "h3_detail", "control_trace", "control_detail"]}
        font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        font = ImageFont.truetype(font_path, 13) if Path(font_path).exists() else ImageFont.load_default()
        for frame in range(FRAMES):
            original = Image.open(work / f"source-{frame + 1:03}.png").convert("RGB")
            control = raster(kinetic_svg(frame / FPS))
            cells = [original]
            variants = [("h3_trace", original, OPTIONS), ("h3_detail", original, DETAIL_OPTIONS),
                        ("control_trace", control, OPTIONS), ("control_detail", control, DETAIL_OPTIONS)]
            for name, source_image, options in variants:
                input_path, trace_path = work / "trace-input.png", work / "trace.svg"
                source_image.save(input_path)
                vtracer.convert_image_to_svg_py(str(input_path), str(trace_path), **options)
                svg = trace_path.read_text()
                facts, signature = svg_facts(svg)
                rendered = raster(svg)
                error = np.asarray(rendered, dtype=np.float32) - np.asarray(source_image, dtype=np.float32)
                data = records[name]
                data["rows"].append({"frame": frame, **facts})
                data["signatures"].append(signature)
                data["errors"].append(error)
                data["svgs"].append(svg)
                cells.append(rendered)
                if name == "h3_detail":
                    cells.append(control)
            canvas = Image.new("RGB", (SIZE * 3, (SIZE + 34) * 2), "#10191e")
            draw = ImageDraw.Draw(canvas)
            labels = ["EXISTING H3 / sampled raster", "H3 / compact trace", "H3 / detail trace",
                      "AUTHORED / fixed geometry", "CONTROL / compact trace", "CONTROL / detail trace"]
            for i, (cell, label) in enumerate(zip(cells, labels)):
                x, y = (i % 3) * SIZE, (i // 3) * (SIZE + 34)
                draw.text((x + 7, y + 9), label, fill="#f2ede5", font=font)
                canvas.paste(cell, (x, y + 34))
            canvas.save(work / f"comparison-{frame:03}.png")
            if frame == 0:
                canvas.save(out / "comparison.png")
        for name, data in records.items():
            report[name] = summarize(data["rows"], data["signatures"], data["errors"])
            report[name]["per_frame"] = data["rows"]
            (out / f"{name}-first-frame.svg").write_text(data["svgs"][0])
        frames_svg = flipbook(records["h3_trace"]["svgs"])
        assert len(frames_svg.encode()) < 2_000_000, "Keep the committed preview modest."
        svg_facts(frames_svg)
        (out / "h3-traced-flipbook.svg").write_text(frames_svg)
        report["h3_trace"]["flipbook_svg_bytes"] = len(frames_svg.encode())
        command("ffmpeg", "-hide_banner", "-loglevel", "error", "-framerate", str(FPS),
                "-i", str(work / "comparison-%03d.png"), "-an", "-c:v", "libx264",
                "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                "-map_metadata", "-1", "-y", str(out / "comparison.mp4"))
    report["comparison_mp4_bytes"] = (out / "comparison.mp4").stat().st_size
    (out / "metrics.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k in ["authored_control", "h3_trace", "h3_detail", "control_trace", "control_detail"]}, indent=2))


if __name__ == "__main__":
    main()
