"""Bind supplied capture/probe evidence to graph inputs; not provider attestation or visual scoring."""
import json
import math
from pathlib import Path
import struct
import wave


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def graph_value(graph, path):
    if not isinstance(path, str) or "." not in path:
        raise ValueError("Input binding needs a node.input path.")
    node, key = path.split(".", 1)
    try:
        return node, graph[node]["inputs"][key]
    except (KeyError, TypeError):
        raise ValueError("Input binding names a missing graph input.") from None


def ancestors(graph, node, visited=None):
    visited = set() if visited is None else visited
    if node in visited:
        return visited
    visited.add(node)
    for value in graph[node].get("inputs", {}).values():
        if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) and type(value[1]) is int and value[0] in graph:
            ancestors(graph, value[0], visited)
    return visited


def pcm(path):
    with wave.open(str(path), "rb") as source:
        shape = (source.getnchannels(), source.getsampwidth(), source.getframerate(), source.getnframes())
        if shape != (1, 2, 48000, 386000):
            raise ValueError("Diagnostic capture audio must retain mono 48 kHz 16-bit PCM and 386000 samples.")
        return struct.unpack(f"<{shape[-1]}h", source.readframes(shape[-1]))


def capture_bindings(root, graph, fixture, case, artifacts, files, manifest, reviewer):
    receipt, recipe, curves = (read(files[name]) for name in ("capture_receipt", "source_recipe", "control_curves"))
    if not all(isinstance(x, dict) for x in (receipt, recipe, curves)) or receipt.get("recipe") != recipe:
        raise ValueError("Capture receipt does not contain the archived source recipe.")
    if receipt.get("frameCount") != 193 or not math.isclose(receipt.get("duration", -1), 193 / 24, abs_tol=1e-9):
        raise ValueError("Capture receipt has inconsistent duration/frame count.")
    expected = {"version": 1, "width": 1024, "height": 576, "fps": 24, "frames": 193}
    if any(recipe.get(key) != value for key, value in expected.items()):
        raise ValueError("Source recipe differs from the current capture geometry contract.")
    pairs = [("video", "guide_rgb"), ("first", "first_frame")]
    if "guide_depth" in artifacts:
        pairs.append(("depth", "guide_depth"))
    for key, role in pairs:
        if receipt.get("sha256", {}).get(key) != artifacts[role]["sha256"]:
            raise ValueError(f"Capture receipt does not bind {role}.")
    audio = receipt.get("audioCompanion", {})
    if audio.get("sha256") != artifacts["captured_audio"]["sha256"]:
        raise ValueError("Capture receipt does not bind the matching WAV.")
    original = fixture["audio"][case["control_audio"]]
    # Browser WAV serialization may round by one PCM step; reject a different source.
    if any(abs(a - b) > 1 for a, b in zip(pcm(root / original["path"]), pcm(files["captured_audio"]))):
        raise ValueError("Captured WAV differs from the immutable control track.")
    if any(curves.get(key) != recipe.get(key) for key in ("envelope", "bandEnvelopes", "audioRoutes")):
        raise ValueError("Control curves/routes differ from the captured recipe.")
    bands = curves.get("bandEnvelopes")
    if not isinstance(bands, dict):
        raise ValueError("Capture evidence needs all three band envelopes.")
    for curve in [curves.get("envelope"), *(bands.get(key) for key in ("low", "mid", "high"))]:
        if not isinstance(curve, list) or len(curve) != 193 or any(
            type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1 for v in curve
        ):
            raise ValueError("Control envelopes must contain 193 finite normalized samples.")
    identity = manifest.get("capture")
    expected_identity = {role: artifacts[role]["sha256"] for role in
                         ("capture_receipt", "source_recipe", "control_curves", "first_frame", "look")}
    expected_identity.update(control_audio=original["sha256"], reviewer=reviewer,
                             alignment="look derived from matching first frame")
    if identity != expected_identity:
        raise ValueError("Executed inputs need the matching capture, curves, dry source and look-alignment identity.")
    captures = [node for node in graph.values() if node.get("class_type") == "DirectorSceneCapture"]
    if len(captures) != 1:
        raise ValueError("This layout experiment requires one declared DirectorSceneCapture.")
    try:
        executed_recipe = json.loads(captures[0]["inputs"]["recipe_json"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("Executed capture recipe must be resolved JSON.") from None
    if executed_recipe != recipe:
        raise ValueError("Executed graph recipe differs from the capture receipt.")


def check_inputs(root, graph, fixture, case, artifacts, files, reviewer):
    manifest = read(files["executed_inputs"])
    if not isinstance(manifest, dict) or manifest.get("version") != 1:
        raise ValueError("Missing versioned executed-input manifest.")
    control = fixture["audio"][case["control_audio"]]
    if manifest.get("workflow_sha256") != artifacts["workflow_json"]["sha256"] or manifest.get("source_control_sha256") != control["sha256"]:
        raise ValueError("Executed-input manifest must bind this workflow and immutable control source.")
    bindings = manifest.get("bindings")
    if not isinstance(bindings, dict) or not bindings:
        raise ValueError("Executed-input bindings cannot be empty.")
    roles = ["control_audio"]
    if case["id"] == "hybrid_parallel":
        roles = ["cpu_audio", "akuspace_audio"]
    elif case["id"] == "serial_cpu_akuspace":
        roles = ["cpu_audio", "reference_audio"]
    roles += [role for role in ("guide_rgb", "look") if role in case["artifacts"]]
    capture_nodes = [(key, node) for key, node in graph.items() if node.get("class_type") == "DirectorSceneCapture"]
    if "guide_rgb" in roles:
        if len(capture_nodes) != 1:
            raise ValueError("Guide evidence requires one explicit capture node.")
        capture_id, capture_node = capture_nodes[0]
        if capture_node["inputs"].get("depth_file"):
            roles.append("guide_depth")
    paths = {"control_audio": "40.audio"}
    if case["workflow"].startswith("layout"):
        paths.update(guide_rgb="1.capture_file", guide_depth="1.depth_file", look="8.image")
    elif case["workflow"] == "akuspace":
        paths["look"] = "90.image"
    outputs = [key for key, node in graph.items() if str(node.get("class_type", "")).startswith(("SaveVideo", "SaveAudio"))]
    reachable = set().union(*(ancestors(graph, output) for output in outputs)) if outputs else set()
    for role in roles:
        item = bindings.get(role)
        if not isinstance(item, dict) or set(item) != {"graph_input", "filename", "sha256"}:
            raise ValueError(f"Missing complete executed binding for {role}.")
        node, value = graph_value(graph, item["graph_input"])
        if role != "control_audio" and role not in files:
            raise ValueError(f"Executed {role} needs the actual archived input file.")
        expected_hash = control["sha256"] if role == "control_audio" else artifacts.get(role, {}).get("sha256")
        if value != item["filename"] or not isinstance(value, str) or not value or item["sha256"] != expected_hash:
            raise ValueError(f"Executed {role} filename/hash does not match the graph and archived bytes.")
        if role in paths and case["workflow"] != "candidate" and item["graph_input"] != paths[role]:
            raise ValueError(f"The {role} binding names the wrong reference graph input.")
        if role in ("guide_rgb", "guide_depth") and item["graph_input"] != capture_id + (".capture_file" if role == "guide_rgb" else ".depth_file"):
            raise ValueError("Guide input must bind the same capture node as its archived recipe.")
        if node not in reachable:
            raise ValueError(f"The {role} input is disconnected from saved workflow outputs.")
    if "guide_rgb" in case["artifacts"]:
        capture_bindings(root, graph, fixture, case, artifacts, files, manifest, reviewer)
    if case["id"] == "serial_cpu_akuspace":
        reference = manifest.get("reference_source")
        expected = control["sha256"] if reference == "original_dry" else artifacts["cpu_audio"]["sha256"] if reference == "cpu_treatment" else None
        if artifacts["reference_audio"]["sha256"] != expected:
            raise ValueError("Serial experiment must identify its actual original-dry or CPU-treated reference.")
        aligned = [node for node in graph.values() if node.get("class_type") == "AKUSPACEReferenceAudioAligned"]
        if len(aligned) != 1:
            raise ValueError("Serial AKUSPACE experiment requires one explicit aligned-reference node.")
        link = aligned[0].get("inputs", {}).get("reference_audio")
        reference_node = bindings["reference_audio"]["graph_input"].split(".", 1)[0]
        if not isinstance(link, list) or not link or reference_node not in ancestors(graph, link[0]):
            raise ValueError("Reference file is not connected to AKUSPACE's aligned-reference input.")
        cpu_node = bindings["cpu_audio"]["graph_input"].split(".", 1)[0]
        encoders = [(key, node) for key, node in graph.items() if node.get("class_type") == "LTXVAudioVAEEncode"]
        if not any(key in reachable and cpu_node in ancestors(graph, key) for key, _ in encoders):
            raise ValueError("Serial experiment must initialize audio latents from the CPU-treated input.")
        repair = read(files["repair_manifest"])
        if not isinstance(repair, dict) or repair.get("source_control_sha256") != control["sha256"]:
            raise ValueError("Repair record must preserve the original control identity.")
        for role in ("cpu_audio", "akuspace_audio", "processed_audio"):
            if repair.get(role + "_sha256") != artifacts[role]["sha256"]:
                raise ValueError("Repair record does not bind preserved CPU/generated/final stems.")
        if repair.get("mode") not in ("none", "localized_crossfade") or not isinstance(repair.get("regions"), list):
            raise ValueError("Declare no repair or explicit localized crossfade regions.")
        if repair["mode"] == "localized_crossfade" and (not repair["regions"] or repair.get("alignment_review_pass") is not True):
            raise ValueError("Localized repair needs regions and phase/alignment review.")
        if repair["mode"] == "none" and repair["regions"]:
            raise ValueError("An unmodified result cannot declare crossfade regions.")
        for region in repair["regions"]:
            if not isinstance(region, dict) or region.get("source") not in ("original_dry", "cpu_treatment"):
                raise ValueError("Every repair region must name its preserved dry or CPU source.")
            start, end = region.get("start_seconds"), region.get("end_seconds")
            if any(type(t) not in (int, float) or not math.isfinite(t) for t in (start, end)) or not 0 <= start < end:
                raise ValueError("Every repair region needs finite, increasing time boundaries.")
    return manifest


def check_probe(graph, case, artifacts, files):
    probe = read(files["media_probe"])
    if not isinstance(probe, dict) or not probe.get("method"):
        raise ValueError("Archive the actual decoded media probe and its method.")
    roles = ["generated_video"] + (["guide_rgb"] if "guide_rgb" in case["artifacts"] else [])
    for role in roles:
        info = probe.get(role)
        if not isinstance(info, dict) or info.get("sha256") != artifacts[role]["sha256"]:
            raise ValueError(f"Decoded probe is not bound to {role}.")
        if info.get("frames") != 193 or info.get("fps") != 24:
            raise ValueError("Decoded video must contain 193 frames at 24 fps.")
        duration = info.get("duration_seconds")
        tolerance = 0.001 if role == "guide_rgb" else 1 / 24
        if type(duration) not in (int, float) or not math.isfinite(duration) or abs(duration - 193 / 24) > tolerance:
            raise ValueError("Decoded media duration differs from the capture contract.")
        points = info.get("frame_pts_seconds")
        if not isinstance(points, list) or len(points) != 193 or any(
            type(p) not in (int, float) or not math.isfinite(p) or abs(p - i / 24) > 0.001
            for i, p in enumerate(points)
        ):
            raise ValueError("Decoded frame timestamps do not match the 24 fps cadence.")
        expected_size = (1024, 576) if role == "guide_rgb" else None
        if role == "generated_video" and case["workflow"].startswith("layout"):
            expected_size = tuple(2 * graph["9"]["inputs"][f"resize_type.{key}"] for key in ("width", "height"))
        elif role == "generated_video" and case["workflow"] == "akuspace":
            expected_size = (2 * graph["26"]["inputs"]["value"], 2 * graph["27"]["inputs"]["value"])
        if expected_size and (info.get("width"), info.get("height")) != expected_size:
            raise ValueError("Decoded dimensions differ from the executed workflow.")
        if role == "generated_video":
            soundtrack = info.get("soundtrack")
            if not isinstance(soundtrack, dict) or soundtrack.get("unexplained_offset") is not False or not isinstance(soundtrack.get("offset_review"), str) or not soundtrack["offset_review"].strip():
                raise ValueError("Decoded soundtrack needs an explicit offset review.")
            start, length = soundtrack.get("start_seconds"), soundtrack.get("duration_seconds")
            if any(type(v) not in (int, float) or not math.isfinite(v) for v in (start, length)) or abs(start) > 1 / 24 or abs(length - 193 / 24) > 1 / 24:
                raise ValueError("Decoded soundtrack offset or duration exceeds the one-frame frozen-output bound.")
