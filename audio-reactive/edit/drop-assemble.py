#!/usr/bin/env python3
"""Audio Reactive Drop, step 3: the picture and room-sound assembly (from assemble-v2e.py).

Five LTX-2.5 Layout-to-Render rooms, each rendered on the owner's track "Adaptive Reverb v2", in
order: towers (the drop) | cathedral, its floor colours pulsing to the voice band | inside the
pyramid | outside the pyramid | the tail studio. Every clip was rendered on THIS track, so its
section is cut at (section start - capture start) and stays in sync with the music. Sections sit
on whole frames, 0 / 174 / 342 / 511 / 679 / 776 (beats 0 / 33 / 65 / 97 / 129 at the cut's
double-time 273.6 BPM), each within a frame of the phrase starts 0 / 7.21 / 14.245 / 21.29 /
28.33 s, so each room file cut from the result is pure room and its Director shot has
sourceSeconds 0.

Writes OUT-dry.mp4 (dry track) and OUT.mp4 (each room's captured room-wet.wav, the browser
shoebox engine's dynamic per-frame room sound, under its section at --wet, 0.25 s crossfades).

Inputs, under --runs (or GENOBI_RUNS), the run folder of 3 November 2026:
  run3/<take>-layout-audio.mp4       the LTX renders (cathedral, pyramid in/out, studio)
  guides-phrase/<take>/<capture>/    their World Builder guides (recipe.json, room-wet.wav)
  guides-v2/<take>/<capture>/        the towers and cathedral re-captured on the measured gaps
--track is the owner's track; --towers the towers render (kept outside the run folder).

Usage: drop-assemble.py OUT --runs DIR --track FILE --towers FILE [--outside p4|p4b] [--no-pulse] [--wet 0.45]
"""
import argparse, json, os, subprocess, sys, tempfile
from pathlib import Path

FPS = 24
EDGES = [0, 174, 342, 511, 679, 776]   # section edges, frames; the cut is 776 frames, 32.333 s
XF = 0.25                              # wet crossfade, seconds


def dur(p):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(p)])
    return float(json.loads(out)["format"]["duration"])


def pulse_commands(guide_dir, off, length, sat, light, band="mid"):
    """sendcmd lines: the cathedral's colour and light follow the voice band the capture used."""
    env = json.loads((guide_dir / "recipe.json").read_text())["bandEnvelopes"][band]
    lines = []
    for i, v in enumerate(env):
        t = i / FPS - off
        if 0 <= t <= length:
            lines.append(f"{t:.4f} eq saturation {1 + sat * v:.3f}, eq brightness {light * v:.4f};")
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--runs", type=Path, default=os.environ.get("GENOBI_RUNS"))
    ap.add_argument("--track", type=Path, required=True)
    ap.add_argument("--towers", type=Path, required=True)
    ap.add_argument("--outside", choices=["p4", "p4b"], default="p4b", help="p4 the cube look, p4b the desert look")
    ap.add_argument("--no-pulse", action="store_true")
    ap.add_argument("--pulse-sat", type=float, default=0.6)
    ap.add_argument("--pulse-light", type=float, default=0.06)
    ap.add_argument("--wet", type=float, default=0.45)
    a = ap.parse_args()
    if not a.runs:
        sys.exit("give --runs or set GENOBI_RUNS")
    runs = Path(a.runs)
    R3, G, G2 = runs / "run3", runs / "guides-phrase", runs / "guides-v2"
    # (name, clip, capture start on the track, guide dir with recipe.json and room-wet.wav)
    rooms = [
        ("towers", a.towers, 0.0, G2 / "towers-w0-g2/towers-descent"),
        ("cathedral", R3 / "cathgrow-mid-p2-layout-audio.mp4", 6.9, G2 / "cathgrow-mid-p2/cathedral-gallery-grow"),
        ("pyramid-in", R3 / "pyrparty-p3-layout-audio.mp4", 13.75, G / "pyrparty-p3/pyramid-inside-party"),
        ("pyramid-out", R3 / f"pyrout-{a.outside}-layout-audio.mp4", 20.8, G / f"pyrout-{a.outside}/pulse"),
        ("tail", R3 / "booth-p5-layout-audio.mp4", 28.30, G / "booth-p5/studio-walls"),
    ]
    missing = [r[0] for r in rooms if not r[1].exists()] + ([] if a.track.exists() else ["track"])
    if missing:
        sys.exit("missing: " + ", ".join(missing))
    end = EDGES[-1] / FPS
    tmp = Path(tempfile.mkdtemp())
    inputs, vf, af, wets = [], [], [], []
    for i, (name, clip, cap0, guide) in enumerate(rooms):
        f0, f1 = EDGES[i], EDGES[i + 1]
        s0, frames = f0 / FPS, f1 - f0
        off, length = max(0.0, s0 - cap0), frames / FPS   # the tail take starts 8 ms after its cut
        # A short source is padded by holding its last frame (the tail take is 4.04 s for 4.04 s).
        if off + length > dur(clip) + 1 / FPS:
            sys.exit(f"{name}: clip too short for its section (needs {off + length:.3f}s, has {dur(clip):.3f}s)")
        print(f"{name:12s} frames {f0:3d}-{f1:3d}  track {s0:6.3f}s  clip from {off:5.3f}s  ({frames} frames)")
        inputs += ["-ss", f"{off:.3f}", "-i", str(clip)]
        # Exactly `frames` frames, timed from 0: the sections butt-join with no hole between them.
        chain = (f"[{i}:v]fps={FPS},tpad=stop=1:stop_mode=clone,trim=end_frame={frames},setpts=N/{FPS}/TB,"
                 "scale=2048:1152,setsar=1,format=yuv420p")
        if name == "cathedral" and not a.no_pulse:
            cmds = tmp / "pulse.cmd"
            cmds.write_text(pulse_commands(guide, off, length, a.pulse_sat, a.pulse_light))
            chain += f",sendcmd=f={cmds},eq=saturation=1:brightness=0"
        vf.append(chain + f"[v{i}]")
        if (guide / "room-wet.wav").exists():
            wets.append((guide / "room-wet.wav", off, length, s0))
    n = len(rooms)
    vf.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0,setpts=N/{FPS}/TB[v]")
    inputs += ["-t", f"{end:.3f}", "-i", str(a.track)]
    labels = []
    for j, (wet, off, length, s0) in enumerate(wets):
        inputs += ["-i", str(wet)]
        a0, L = max(0.0, off - XF), length + 2 * XF
        delay = int(max(0.0, s0 - XF) * 1000)
        af.append(f"[{n + 1 + j}:a]atrim=start={a0:.3f}:duration={L:.3f},asetpts=PTS-STARTPTS,afade=t=in:d={XF},"
                  f"afade=t=out:st={L - XF:.3f}:d={XF},aresample=48000,adelay={delay}|{delay}[w{j}]")
        labels.append(f"[w{j}]")
    dry = f"[{n}:a]aresample=48000,afade=t=out:st={end - 1.0:.3f}:d=1.0"
    out = Path(a.out); out.parent.mkdir(parents=True, exist_ok=True)
    enc = ["-r", str(FPS), "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart"]
    base = ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex"]
    subprocess.check_call(base + [";".join(vf + [dry + "[a]"]), "-map", "[v]", "-map", "[a]", *enc, str(out.with_name(out.stem + "-dry.mp4"))])
    if labels:
        g = vf + af + [dry + "[dry]", "".join(labels) + f"amix=inputs={len(labels)}:duration=longest:normalize=0,volume={a.wet}[wet]",
                       "[dry][wet]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]"]
        subprocess.check_call(base + [";".join(g), "-map", "[v]", "-map", "[a]", *enc, str(out.with_suffix(".mp4"))])
    print("wrote", out.with_name(out.stem + "-dry.mp4"), "and", out.with_suffix(".mp4"))


if __name__ == "__main__":
    main()
