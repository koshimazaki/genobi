#!/usr/bin/env python3
"""Audio Reactive Drop, step 4: the pyramid hologram pass (from holo.py).

The World Builder guide's depth edges, tinted cyan, screen-blended over the LTX render inside and
outside the pyramid, the opacity following each capture's own low-band envelope. The guide and
the render share one camera (layout-to-render), so the lines sit on the geometry. Section edges
are drop-assemble.py's whole frames: inside 342-511, outside 511-679.

Usage: drop-holo.py IN.mp4 OUT.mp4 --runs DIR [--gain 1.3] [--floor 0.25] [--band low] [--blur 1.2]
"""
import argparse, json, os, subprocess, sys, tempfile
from pathlib import Path

TINT = (0.30, 1.00, 0.92)   # cyan, the template's #62f2e4


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--runs", type=Path, default=os.environ.get("GENOBI_RUNS"))
    ap.add_argument("--gain", type=float, default=1.3)
    ap.add_argument("--floor", type=float, default=0.25)
    ap.add_argument("--band", default="low")
    ap.add_argument("--blur", type=float, default=1.2)
    a = ap.parse_args()
    if not a.runs:
        sys.exit("give --runs or set GENOBI_RUNS")
    G = Path(a.runs) / "guides-phrase"
    # (guide dir, capture start on the track, section start, section end)
    sections = [(G / "pyrparty-p3/pyramid-inside-party", 13.75, 342 / 24, 511 / 24),
                (G / "pyrout-p4b/pulse", 20.8, 511 / 24, 679 / 24)]
    tmp = Path(tempfile.mkdtemp())
    inputs, chains = ["-i", a.inp], []
    for i, (guide, cap0, s0, s1) in enumerate(sections):
        env = json.loads((guide / "recipe.json").read_text())["bandEnvelopes"][a.band]
        off = s0 - cap0
        lines = []
        for f, v in enumerate(env):
            t = f / 24 - off
            if -0.05 <= t <= s1 - s0 + 0.05:
                k = a.floor + a.gain * v
                lines.append(f"{max(0.0, t):.4f} ccm rr {TINT[0]*k:.4f}, ccm gg {TINT[1]*k:.4f}, ccm bb {TINT[2]*k:.4f};")
        cmd = tmp / f"holo{i}.cmd"
        cmd.write_text("\n".join(lines) + "\n")
        inputs += ["-ss", f"{off:.3f}", "-t", f"{s1 - s0:.3f}", "-i", str(guide / "depth.webm")]
        chains.append(
            f"[{i+1}:v]fps=24,format=gray,edgedetect=low=0.04:high=0.12,format=rgb24,"
            f"scale=2048:1152:flags=neighbor,gblur=sigma={a.blur},"
            f"sendcmd=f={cmd},colorchannelmixer@ccm=rr={TINT[0]*a.floor}:gg={TINT[1]*a.floor}:bb={TINT[2]*a.floor},"
            f"format=gbrp,setpts=PTS-STARTPTS+{s0:.4f}/TB[h{i}]")
    # blend needs one explicit planar format on BOTH inputs, or it washes the frame magenta
    g, prev = ["[0:v]format=gbrp[b0]"] + chains, "b0"
    for i, (_, _, s0, s1) in enumerate(sections):
        g.append(f"[{prev}][h{i}]blend=all_mode=screen:eof_action=pass:enable='between(t,{s0:.4f},{s1:.4f})'[b{i+1}]")
        prev = f"b{i+1}"
    g.append(f"[{prev}]format=yuv420p[v]")
    subprocess.check_call(["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(g),
                           "-map", "[v]", "-map", "0:a?", "-r", "24", "-c:v", "libx264", "-crf", "16", "-preset", "medium",
                           "-c:a", "copy", "-movflags", "+faststart", a.out])
    print("wrote", a.out)


if __name__ == "__main__":
    main()
