"""Room acoustics from a World Builder recipe: Sabine RT60 snapped to an AKUSPACE preset.
Pure Python; the room sizes, absorption table and bands live in acoustics.json.
"""
import json
import math
import re
from pathlib import Path

TABLE = json.loads((Path(__file__).resolve().parent / "acoustics.json").read_text(encoding="utf-8"))
WIDGETS = TABLE["akuspace_widgets"]
# Half extents of each shape's unit geometry (src/world-builder/geometry.ts).
HALF = {"box": (0.5, 0.5, 0.5), "plane": (1, 1, 0), "sphere": (0.65, 0.65, 0.65),
        "cylinder": (0.75, 0.175, 0.75), "cone": (0.7, 0.7, 0.7), "torus": (0.85, 0.85, 0.2),
        "tetrahedron": (0.8, 0.8, 0.8), "dodecahedron": (0.8, 0.8, 0.8)}


def _rotation(p):
    """Three.js Euler order XYZ: R = Rx · Ry · Rz."""
    a, b, c = p.get("rotationX", 0), p.get("rotation", 0), p.get("rotationZ", 0)
    ca, sa, cb, sb, cc, sc = math.cos(a), math.sin(a), math.cos(b), math.sin(b), math.cos(c), math.sin(c)
    rx = ((1, 0, 0), (0, ca, -sa), (0, sa, ca))
    ry = ((cb, 0, sb), (0, 1, 0), (-sb, 0, cb))
    rz = ((cc, -sc, 0), (sc, cc, 0), (0, 0, 1))
    mul = lambda m, n: tuple(tuple(sum(m[i][k] * n[k][j] for k in range(3)) for j in range(3)) for i in range(3))
    return mul(mul(rx, ry), rz)


def _bounds(p):
    """World-space axis-aligned bounds of a primitive, and its normal for planes."""
    scale = p.get("scale", 1)
    half = [h * scale * p.get(k, 1) for h, k in zip(HALF.get(p.get("shape"), (0.5, 0.5, 0.5)), ("scaleX", "scaleY", "scaleZ"))]
    r = _rotation(p)
    extent = [sum(abs(r[i][j]) * half[j] for j in range(3)) for i in range(3)]
    centre = (p.get("x", 0), p.get("y", 0), p.get("z", 0))
    return ([centre[i] - extent[i] for i in range(3)], [centre[i] + extent[i] for i in range(3)],
            (r[0][2], r[1][2], r[2][2]), 4 * half[0] * half[1])


def _luminance(colour):
    try:
        rgb = [int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    except (TypeError, ValueError):
        return 0.5
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def absorption(p):
    """α from the first material word in the prompt, else from the colour class."""
    for word in re.findall(r"[a-z]+", str(p.get("prompt", "")).lower()):
        for name, alpha in TABLE["absorption"].items():
            if word in (name, name + "s") or word.rstrip("s") == name:
                return alpha
    classes = TABLE["colour_classes"]
    lum = _luminance(p.get("color", ""))
    return classes["light"] if lum >= 0.5 else classes["dark"] if lum < 0.15 else classes["mid"]


def snap(rt60):
    """(preset, level) for an enclosed room's RT60."""
    order, edges = TABLE["bands"]["order"], TABLE["bands"]["edges"]
    lo = 0.0
    for name, hi in zip(order, edges):
        if rt60 < hi or name == order[-1]:
            position = (min(rt60, hi) - lo) / (hi - lo)
            return name, "low" if position < 1 / 3 else "mid" if position < 2 / 3 else "high"
        lo = hi
    raise AssertionError("unreachable")


def widgets(preset, level):
    """Values for Koshi_AKUSPACEPrompt's space_mode, application and room_preset combos."""
    if preset == "dry":
        return "Off", "Off", "medium_room"
    if preset.startswith("outdoor_"):
        return "Space", "Night" if preset == "outdoor_night" else "Day", "medium_room"
    return "Room", {"low": "Low", "mid": "Moderate", "high": "Heavy"}[level], preset


def estimate(recipe):
    """Return a dict with preset, level, rt60, size, volume, area and summary."""
    objects = [p for p in recipe.get("objects", []) if isinstance(p, dict)]
    room = [p for p in objects if str(p.get("id", "")).startswith("room-")]
    if not room:
        light = float(recipe.get("light", 2))
        preset = "outdoor_night" if light < TABLE["outdoor"]["night_below_light"] else "outdoor_day"
        return {"preset": preset, "level": "low", "rt60": 0.0, "size": None, "volume": 0.0, "area": 0.0,
                "summary": f"{preset} · open sky · light {light:g}"}
    boxes = [(p, *_bounds(p)) for p in room]
    lo = [min(b[1][i] for b in boxes) for i in range(3)]
    hi = [max(b[2][i] for b in boxes) for i in range(3)]
    w, h, length = (max(hi[i] - lo[i], 0.1) for i in range(3))
    volume = w * h * length
    floor_area, wall_area = w * length, 2 * (w + length) * h
    walls, floor, ceiling = [], None, None
    for p, bmin, bmax, normal, area in boxes:
        if abs(normal[1]) > 0.7:
            if (bmin[1] + bmax[1]) / 2 < lo[1] + h / 2:
                floor = absorption(p)
            else:
                ceiling = absorption(p)
        else:
            walls.append((absorption(p), area))
    # Open-front, open-top sets are camera cutaways: a missing face takes the walls' mean α.
    wall_alpha = sum(a * s for a, s in walls) / sum(s for _, s in walls) if walls else (floor or 0.1)
    floor = wall_alpha if floor is None else floor
    ceiling = wall_alpha if ceiling is None else ceiling
    sabins = floor * floor_area + ceiling * floor_area + wall_alpha * wall_area
    for p in objects:
        if p in room:
            continue
        bmin, bmax = _bounds(p)[:2]
        if all(lo[i] <= (bmin[i] + bmax[i]) / 2 <= hi[i] for i in range(3)):
            dx, dy, dz = (bmax[i] - bmin[i] for i in range(3))
            sabins += absorption(p) * 2 * (dx * dy + dy * dz + dx * dz)
    rt60 = 0.161 * volume / sabins
    preset, level = snap(rt60)
    size = (round(w, 2), round(length, 2), round(h, 2))
    return {"preset": preset, "level": level, "rt60": round(rt60, 3), "size": size,
            "volume": round(volume, 2), "area": round(2 * floor_area + wall_area, 2),
            "bounds": (lo, hi), "alpha": {"floor": floor, "ceiling": ceiling, "walls": wall_alpha},
            "sabins": sabins,
            "summary": f"{preset} · {size[0]:g}×{size[1]:g}×{size[2]:g} m · RT60 {rt60:.1f} s"}


def parse(recipe):
    """A recipe string as a dict, bounded and version-checked."""
    if not isinstance(recipe, str) or len(recipe.encode()) > 64000:
        raise ValueError("Recipe must be JSON under 64 KB")
    data = json.loads(recipe)
    if not isinstance(data, dict) or data.get("version") != 1:
        raise ValueError("Expected a World Builder recipe v1")
    return data


class DirectorSceneAcoustics:
    """Estimate a recipe room's reverb and name the AKUSPACE treatment that fits it."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"recipe": ("STRING", {"default": "{}", "multiline": True, "forceInput": True})}}

    RETURN_TYPES = ("STRING", "STRING", "FLOAT", "STRING",
                    list(WIDGETS["space_mode"]), list(WIDGETS["application"]), list(WIDGETS["room_preset"]))
    RETURN_NAMES = ("space_preset", "level", "rt60", "room_summary", "space_mode", "application", "room_preset")
    FUNCTION = "measure"
    CATEGORY = "Director/World Builder"

    def measure(self, recipe):
        result = estimate(parse(recipe))
        return (result["preset"], result["level"], float(result["rt60"]), result["summary"],
                *widgets(result["preset"], result["level"]))
