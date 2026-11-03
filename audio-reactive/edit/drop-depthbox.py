#!/usr/bin/env python3
"""Acoustic Spaces v2, step 5: the depth heatmap inside the TRACK · DANCER focus box (from
depthbox.py; owner, 3 Nov 2026: "posterise or use it as depth or heatmap").

The World Builder depth guide of the pyramid interior, false-coloured, inside the box's rectangle
for the box's own window (the cut's target-2 layer, 17.97 to 20.17 s), fading with the box's
draw-in. It is baked into the picture, so it travels with drop-pyramid-inside.mp4.

Usage: drop-depthbox.py IN.mp4 OUT.mp4 --runs DIR [--preset inferno] [--t0 17.97 --t1 20.17] [--rect 0.38,0.5,0.22,0.45]
"""
import argparse, os, subprocess, sys
from pathlib import Path

CAP0 = 13.75   # the pyramid-interior capture's start on the track
W, H = 2048, 1152

ap = argparse.ArgumentParser()
ap.add_argument("inp"); ap.add_argument("out")
ap.add_argument("--runs", type=Path, default=os.environ.get("GENOBI_RUNS"))
ap.add_argument("--preset", default="inferno")
ap.add_argument("--t0", type=float, default=17.97); ap.add_argument("--t1", type=float, default=20.17)
ap.add_argument("--rect", default="0.38,0.5,0.22,0.45")
ap.add_argument("--fade", type=float, default=0.3)
a = ap.parse_args()
if not a.runs:
    sys.exit("give --runs or set GENOBI_RUNS")
depth = Path(a.runs) / "guides-phrase/pyrparty-p3/pyramid-inside-party/depth.webm"
x, y, w, h = [float(v) for v in a.rect.split(",")]
X, Y, BW, BH = int(x * W) // 2 * 2, int(y * H) // 2 * 2, int(w * W) // 2 * 2, int(h * H) // 2 * 2
L = a.t1 - a.t0
g = (f"[1:v]fps=24,scale={W}:{H}:flags=bicubic,crop={BW}:{BH}:{X}:{Y},format=gray,normalize=smoothing=5,format=yuv444p,pseudocolor=preset={a.preset},"
     f"format=rgba,fade=t=in:st=0:d={a.fade}:alpha=1,fade=t=out:st={L - 0.2:.3f}:d=0.2:alpha=1,"
     f"setpts=PTS-STARTPTS+{a.t0:.3f}/TB[d];"
     f"[0:v][d]overlay=x={X}:y={Y}:eof_action=pass:enable='between(t,{a.t0:.3f},{a.t1:.3f})',format=yuv420p[v]")
subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", a.inp, "-ss", f"{a.t0 - CAP0:.3f}", "-t", f"{L:.3f}", "-i", str(depth),
                       "-filter_complex", g, "-map", "[v]", "-map", "0:a?", "-r", "24", "-c:v", "libx264", "-crf", "16", "-preset", "medium",
                       "-c:a", "copy", "-movflags", "+faststart", a.out])
print("wrote", a.out, "box", (X, Y, BW, BH), "window", a.t0, a.t1)
