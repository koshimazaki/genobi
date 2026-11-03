"""Extra art-directed image guides at chosen frame indices (prepare-side checks)."""
import re

from common import local_file
from media import guide_frame_difference, image_contract, probe

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
SPEC = re.compile(r"(?P<path>.+)@(?P<index>[0-9]{1,4})(?:@(?P<strength>[0-9]*\.?[0-9]+))?")
# Mean 8-bit difference below this is the guide frame itself, re-encoded.
MINIMUM_DIFFERENCE = 2.0


def parse_keyframe(value):
    """PATH@INDEX[@STRENGTH] -> (path, index, strength); strength defaults to 1.0."""
    match = SPEC.fullmatch(str(value))
    if not match:
        raise ValueError("Use --keyframe PATH@INDEX or PATH@INDEX@STRENGTH, for example look-96.png@96@0.8.")
    strength = float(match["strength"]) if match["strength"] else 1.0
    return match["path"], int(match["index"]), strength


def keyframe_paths(specs, frames):
    """Validate the indices and files before any media work; roles key1, key2..."""
    paths, rows = {}, []
    if len(specs) > 8:
        raise ValueError("At most eight keyframes are supported.")
    for number, spec in enumerate(specs, 1):
        path, index, strength = parse_keyframe(spec) if isinstance(spec, str) else spec
        if not 0 < index < frames:
            raise ValueError(f"Keyframe index {index} must lie strictly between 0 and {frames} (--frames).")
        if not 0.1 <= strength <= 1.0:
            raise ValueError("Keyframe strength must be between 0.1 and 1.0.")
        if any(row["frame_idx"] == index for row in rows):
            raise ValueError(f"Keyframe index {index} is given twice.")
        role = f"key{number}"
        paths[role] = local_file(path, f"keyframe look at frame {index}", IMAGE_SUFFIXES)
        rows.append({"role": role, "frame_idx": index, "strength": strength})
    return paths, rows


def keyframe_probes(paths, rows, guide, timing):
    """Same aspect rule as the look, and the still must not be the clay frame."""
    probes = {}
    for row in rows:
        role = row["role"]
        report = image_contract(probe(paths[role], "v:0"), timing)
        report["resampling"]["nodes"] = [f"{role}s1", f"{role}s2"]
        difference = guide_frame_difference(guide, row["frame_idx"], paths[role], timing["width"], timing["height"])
        if difference < MINIMUM_DIFFERENCE:
            raise ValueError(f"Keyframe {role} is the unmodified guide frame {row['frame_idx']}; supply an art-directed look.")
        report["guide_frame"] = {"index": row["frame_idx"], "mean_abs_difference_8bit": round(difference, 3),
                                 "minimum": MINIMUM_DIFFERENCE}
        probes[role] = report
    return probes
