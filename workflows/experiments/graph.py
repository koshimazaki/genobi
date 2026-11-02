"""Explicit unqualified derivatives of the existing studio Layout-to-Render graph."""
import copy
import json

STATIC_NODES = {"2", "3", "4", "7", "10", "11", "12", "13"}
MODES = ("layout", "layout-audio")

# The roles a run rewrites after preparation. They are recorded in the bundle
# so a renumbered studio graph cannot silently mis-wire an expensive submission:
# preflight validates each node against its own schema, so a swapped class that
# still satisfies its inputs would otherwise reach sampling.
BINDINGS = (
    ("rgb", "1", "DirectorSceneCapture", "capture_file"),
    ("look", "8", "LoadImage", "image"),
    ("audio", "40", "LoadAudio", "audio"),
    ("save", "61", "SaveVideo", "filename_prefix"),
)
BINDING_ROLES = tuple(role for role, *_ in BINDINGS)

# The only upscale the candidate is qualified on. The factor lives in the model
# filename, so it is derived here once instead of assumed at submit time.
QUALIFIED_UPSCALE = {"ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors": 2}


def bindings(graph):
    """Record every rewrite target with the class it must still be."""
    rows = {}
    for role, node_id, class_type, field in BINDINGS:
        actual = graph.get(node_id, {}).get("class_type")
        if actual != class_type:
            raise ValueError(
                f"{role}: studio node {node_id} is {actual!r}, expected {class_type!r}; review the derivative."
            )
        rows[role] = {"node": node_id, "class_type": class_type, "field": field}
    return rows


def output_timing(graph, width, height):
    """Derive the rendered dimensions from the upscaler the graph actually loads."""
    names = {
        node.get("inputs", {}).get("model_name")
        for node in graph.values()
        if node.get("class_type") == "LatentUpscaleModelLoader"
    }
    if len(names) != 1:
        raise ValueError("Expected exactly one latent upscale model in the candidate graph.")
    name = names.pop()
    factor = QUALIFIED_UPSCALE.get(name)
    if not factor:
        raise ValueError(f"Upscale model {name!r} has no recorded factor; qualify it before rendering.")
    return {"width": width * factor, "height": height * factor, "factor": factor, "upscale_model": name}


def linked(value):
    return isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) and type(value[1]) is int


def validate_links(graph):
    for key, node in graph.items():
        if not isinstance(node, dict) or not isinstance(node.get("class_type"), str) or not isinstance(node.get("inputs"), dict):
            raise ValueError(f"Malformed API node {key}.")
        for value in node["inputs"].values():
            if linked(value) and (value[0] not in graph or value[1] < 0):
                raise ValueError(f"Node {key} links to a missing node/output.")
    if "__" in json.dumps(graph):
        raise ValueError("Candidate graph contains unresolved placeholders.")


def candidate(source, recipe, assets, mode="layout", seed=42, prompt="", negative="", audio_start=0.0):
    if mode not in MODES:
        raise ValueError("Choose layout or layout-audio.")
    if type(seed) is not int or not 0 <= seed < 2**64:
        raise ValueError("Seed must be an unsigned 64-bit integer.")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 12000 or len(negative) > 12000:
        raise ValueError("Supply a bounded visual prompt describing the finished shot.")
    expected = {"1": "DirectorSceneCapture", "2": "DirectorSceneAcoustics", "10": "DirectorSceneReverb",
                "av2": "LTXVAudioVAEEncode", "60": "CreateVideo"}
    if any(source.get(node, {}).get("class_type") != kind for node, kind in expected.items()):
        raise ValueError("Studio source changed; review the derivative before building it.")
    for node_id in ("71", "73"):
        node = source.get(node_id, {})
        inputs = node.get("inputs", {})
        if (node.get("class_type") != "LTXAddVideoICLoRAGuide" or inputs.get("crop") != "center"
                or inputs.get("image") != ["8", 0] or inputs.get("frame_idx") != -1):
            raise ValueError("Studio source changed its look-still resizing/conditioning; review the derivative.")
    graph = copy.deepcopy(source)
    for node in STATIC_NODES:
        del graph[node]
    graph["1"]["inputs"].update(capture_file=assets["rgb"], recipe_json=json.dumps(recipe, separators=(",", ":")),
                                  depth_file="", audio=["av0", 0])
    graph["8"]["inputs"]["image"] = assets["look"]
    graph["40"]["inputs"]["audio"] = assets["audio"]
    graph["30"]["inputs"]["value"] = prompt
    graph["31"]["inputs"]["text"] = ["30", 0]
    graph["32"]["inputs"]["text"] = negative
    graph["5"]["inputs"]["length"] = recipe["frames"]
    for dimension in ("width", "height"):
        graph["9"]["inputs"][f"resize_type.{dimension}"] = recipe[dimension]
        graph["av3"]["inputs"][dimension] = recipe[dimension]
    graph["av0"]["inputs"].update(start_index=audio_start, duration=recipe["frames"] / recipe["fps"])
    graph["60"]["inputs"]["audio"] = ["av0", 0]
    graph["61"]["inputs"]["filename_prefix"] = f"genobi-experiments/{mode}/candidate"
    for node in ("80", "90"):
        graph[node]["inputs"]["noise_seed"] = seed
    # Baseline never encodes the music as conditioning. Keep the joint AV
    # architecture with an empty, frozen audio latent, then mux source audio.
    if mode == "layout":
        graph["av2"] = {"class_type": "LTXVEmptyLatentAudio", "inputs": {
            "frames_number": recipe["frames"], "frame_rate": recipe["fps"],
            "batch_size": 1, "audio_vae": ["av1", 0]}}
    for node in ("x1m", "x2m"):
        if graph[node]["inputs"]["mask"] != ["av3", 0]:
            raise ValueError("Both stages must freeze the audio latent.")
    if graph["av3"]["inputs"]["value"] != 0:
        raise ValueError("Frozen audio mask must be zero.")
    validate_links(graph)
    return graph
