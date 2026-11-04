#!/usr/bin/env python3
"""Audio Reactive Acoustic Spaces v2, step 6: the cut as data (a MixSpec), written to
shared/templates/audio-reactive-drop.cut.json.

The track is 136.8 BPM. The cut runs on a DOUBLE-TIME grid (273.6 BPM, eighth notes at 24 fps) so
the five room shots can start on whole beats and still land on the phrases within a frame: shots
at grid beats 0 / 33 / 65 / 97 / 129 = frames 0 / 174 / 342 / 511 / 679. The overlays are laid out
in track beats (as the interface pass, variant b, was) and doubled on output; the `bpm` parameter
of the hud / scan / build-panel layers stays 136.8, since it is only their visual pulse.

Each room is its own shot over its own file (sourceSeconds 0), so a person can swap one room in
the Editor; every overlay is its own layer. Variant b of the interface pass (owner notes, 3 Nov
2026): a gentle CRT visor, a REC HUD per room, a wireframe sweep and a slice glitch into every
room, one RT60 scan readout and the nave measure in the cathedral, a gen-status pill and the
dancer focus box inside the pyramid, a wireframe reveal and a gen-title outside it, the build
panel in the studio, then the singer's ending with the credit traced in beside her.

Usage: drop-make-cut.py [--out shared/templates/audio-reactive-drop.cut.json]
Then: npx prettier --write <out>
"""
import argparse, json

BPM = 136.8                                  # the track
GRID = 2                                     # grid beats per track beat (double time)
P = [0.0, 7.21, 14.245, 21.29, 28.33]       # phrase starts = the room changes, track seconds
SHOTS = [0, 33, 65, 97, 129]                 # the same, as whole grid beats (frames 0/174/342/511/679)
FRAMES = 776                                 # the cut's length: 32.333 s
B = lambda t: t * BPM / 60                   # track seconds -> track beats
white, muted, cyan, amber, night = "#f6f8f2", "#cfd6d2", "#62f2e4", "#f2b84b", "#0b0d0c"
FONT = "\"Nokia Cellphone FC\", \"Pixelify Sans\", monospace"
ROOMS = [  # (asset, shot label, HUD text, HUD credit)
    ("drop-towers", "Towers · the drop between the skyscrapers", "DRONE 01 // DESCENT", "GENOBI / BETWEEN TOWERS"),
    ("drop-cathedral", "Cathedral · floor colours pulsing to the voice", "CAM 01 // ROOM SCAN", "GENOBI / CATHEDRAL"),
    ("drop-pyramid-inside", "Pyramid inside · hologram and dancer heatmap", "CAM 02 // PYRAMID INTERIOR", "GENOBI / PYRAMID · INSIDE"),
    ("drop-pyramid-outside", "Pyramid outside · desert hologram", "DRONE 02 // PYRAMID EXTERIOR", "GENOBI / DESERT · HOLOGRAM"),
    ("drop-studio", "Studio · the singer turns to the camera", "CAM 03 // STUDIO", "GENOBI / BOOTH"),
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="shared/templates/audio-reactive-drop.cut.json")
    a = ap.parse_args()
    L = []

    def layer(id, name, module, kind, lane, start, beats, params, opacity=1):
        """start and beats in track beats; written in grid beats."""
        L.append({"id": id, "name": name, "module": module, "kind": kind, "lane": lane,
                  "startBeat": round(start * GRID, 3), "beats": round(beats * GRID, 3), "opacity": opacity, "parameters": params})

    cuts = [round(B(p), 3) for p in P]
    end = round(FRAMES / 24 * BPM / 60, 3)   # 73.72 track beats = 147.44 grid beats
    sec = lambda beats: round(beats * 60 / BPM, 2)
    layer("open", "Screen open", "screen-open", "graphics", "open", 0, 2,
          {"color": cyan, "matte": night, "duration": 0.6, "glyphs": 28, "seed": 7})
    # The stock CRT at a third of the strength: little split, gentle curve.
    layer("visor", "Helmet visor · CRT, gentle", "crt", "filter", "crt", 2, end - 2,
          {"amount": 0.3, "curvature": 0.03, "rgb": 0.7, "vignette": 0.4})
    edges = [2] + cuts[1:] + [end]
    for i, (_, _, text, credit) in enumerate(ROOMS):
        s, e = edges[i], edges[i + 1]
        layer(f"hud-{i+1}", f"HUD · {credit}", "hud", "graphics", "hud", s, e - s,
              {"color": white, "accent": amber, "bpm": BPM, "text": "● REC  " + text, "credit": credit, "seconds": sec(e - s)})
    for i in range(1, 5):
        layer(f"wire-{i}", f"Wireframe sweep · into room {i}", "wire-scan", "filter", "wire", cuts[i] - 3, 3,
              {"color": cyan, "amount": 0.8, "sweep": 1.4, "trail": 0.35})
        layer(f"glitch-{i}", f"Slice glitch · the cut into room {i}", "slice-glitch", "filter", "glitch", cuts[i], 0.5,
              {"amount": 0.9, "slices": 18, "seed": [11, 18, 25, 31][i - 1], "duration": 0.25})
    cap = lambda side, title, lines: {"side": side, "title": title, "lines": lines, "color": white, "muted": muted, "accent": amber, "bpm": BPM, "duration": 0.6}
    scan = lambda text, x, y: {"color": white, "accent": cyan, "text": text, "x": x, "y": y, "bpm": BPM}
    focus = lambda x, y, w, h, label: {"x": x, "y": y, "w": w, "h": h, "label": label, "color": cyan, "dim": 0.25, "draw": 0.3, "fadeAt": 2.0, "view": ""}

    def title(text, line, x, y, size, beats, plate):
        return {"text": text, "line": line, "font": FONT, "size": size, "color": white, "muted": muted, "accent": cyan,
                "x": x, "y": y, "duration": 2.4, "mode": "trace-texts", "steps": "Scanning / Tracing / Inking",
                "done": "Locked", "fadeAt": round(sec(beats) - 0.5, 2), "plate": plate}

    status = lambda label, done, variant, x, y, done_at, beats: {"label": label, "done": done, "variant": variant, "color": cyan, "x": x, "y": y,
                                                                 "scale": 1.2, "doneAt": done_at, "fadeAt": round(sec(beats) - 0.4, 2)}
    # Towers: the drop, traced in; longer (owner: it "almost looks like a title drop, maybe it could be longer").
    t0 = title("DROP", "OUTSIDE / BETWEEN TOWERS / ROOM AHEAD", 0.2, 0.32, 64, 14, 0)
    t0["duration"] = 4.0
    layer("title-0", "Reveal · the drop", "gen-title", "graphics", "cards", 2.5, 14, t0)
    # Cathedral: the room scan, once: readout, then the nave measured.
    layer("scan-1", "Scan · cathedral", "scan", "graphics", "scan", cuts[1] + 0.5, 8, scan("RT60 ~3.3 S", 0.36, 0.6), 0.95)
    layer("target-1", "Room measure · nave", "ui-focus", "graphics", "focus", cuts[1] + 8.5, 5, focus(0.3, 0.2, 0.4, 0.7, "MEASURE · NAVE"))
    # Pyramid interior: a status pill, then the dancer tracked (the depth heatmap inside the box is baked by drop-depthbox.py).
    layer("status-2", "Status · tracking the dancer", "gen-status", "graphics", "status", cuts[2] + 2, 6,
          status("Scanning the room · RT60 ~3.1 s", "Dancer found", "scan", 0.5, 0.9, 1.6, 6))
    layer("target-2", "Track · the dancer", "ui-focus", "graphics", "focus", cuts[2] + 8.5, 5, focus(0.38, 0.5, 0.22, 0.45, "TRACK · DANCER"))
    # Pyramid exterior: a wireframe reveal across the pyramid, then its title traced in on the right.
    layer("wire-reveal", "Wireframe reveal · the pyramid", "wire-scan", "filter", "wire", cuts[3] + 1.5, 5,
          {"color": cyan, "amount": 0.9, "sweep": 2.4, "trail": 0.55})
    layer("title-3", "Reveal · pyramid, desert", "gen-title", "graphics", "cards", cuts[3] + 7.5, 8,
          title("PYRAMID · DESERT", "OPEN AIR / LAYOUT HOLOGRAM · LOW BAND", 0.78, 0.3, 52, 8, 0.3))
    # Studio: one readout panel, left.
    # Studio: one readout panel, left, for four beats (owner's approved cut, 3 Nov 2026 ~20:45).
    layer("caption-5", "Readout · studio", "build-panel", "graphics", "captions", cuts[4] + 1, 4, cap("left", "ROOM · STUDIO", "RT60 ~0.33 S / SMALL ROOM / DRY"))
    # Ending (owner, 3 Nov 2026: "use it as official template with all the layers"): the singer of the
    # original Adaptive reverb take turning to the camera and smiling is the ending, and the credit is
    # traced in beside her, no still over the picture. gen-title's x is the text centre: at 0.2 it clipped
    # at the left edge, so 0.31.
    t9 = title("REACTIVE SPACES", "ADAPTIVE REVERB · V2  /  WORLD BUILDER ROOMS · LTX-2.5  /  KOSHIMAZAKI", 0.31, 0.3, 46, 5.2, 0.3)
    t9["duration"] = 1.6
    t9["fadeAt"] = 60
    layer("end-title", "Reveal · Reactive spaces", "gen-title", "graphics", "cards", end - 5.2, 5.2, t9)
    beats = round(end * GRID, 3)
    shots = [{"asset": asset, "label": label, "sourceSeconds": 0, "startBeat": SHOTS[i],
              "beats": (SHOTS[i + 1] if i + 1 < len(SHOTS) else beats) - SHOTS[i], "cropY": None}
             for i, (asset, label, _, _) in enumerate(ROOMS)]
    for s in shots:
        s["beats"] = round(s["beats"], 3)
    spec = {"id": "audio-reactive-drop", "bpm": BPM * GRID, "inPointSeconds": 0, "fps": 24, "width": 1920, "height": 1080,
            "designSize": {"width": 1440, "height": 810}, "beats": beats,
            "track": {"asset": "drop-track", "seconds": 32.341}, "trackName": "Track · Adaptive Reverb v2 with each room's own sound",
            "shots": shots, "layers": L}
    json.dump(spec, open(a.out, "w"), indent=1, ensure_ascii=False)
    print(a.out, len(shots), "shots,", len(L), "layers,", beats, "grid beats")


if __name__ == "__main__":
    main()
