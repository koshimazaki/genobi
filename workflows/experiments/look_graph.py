"""Pure helpers for the look still: prompt, Klein Base edit graph filling, checks.

No network and no imports from the experiment modules other builders change,
so the look tool keeps working while prepare/run/media are rewritten.
"""
import copy
import hashlib
import ipaddress
import json
from pathlib import Path
import re
import struct
import urllib.parse

HERE = Path(__file__).resolve().parent
GRAPH_FILE = HERE.parent / "flux-3-klein-base-edit.json"

# Node ids of the pinned API graph (shared/comfy/klein-base.ts uses the same).
PROMPT_NODE, SWITCH_NODE, LATENTS_NODE, BATCH_NODE = "edit-prompt", "51", "17", "50"
SAMPLER_NODE, UPSAMPLER_NODE, SAVE_NODE = "7", "47", "9"
LATENT_NODE = "look-latent"
EXPECTED = {PROMPT_NODE: "PrimitiveStringMultiline", SWITCH_NODE: "ComfySwitchNode",
            LATENTS_NODE: "ReferenceMultiLatent", BATCH_NODE: "BatchImagesNode",
            SAMPLER_NODE: "KSampler", UPSAMPLER_NODE: "TextGenerate", SAVE_NODE: "SaveImage",
            "reference-0": "LoadImage"}

MODELS = ("flux3-image-klein-base-int8-convrot.safetensors", "qwen3vl_4b_int8_convrot.safetensors",
          "flux2-vae.safetensors", "qwen3.5_9b_flux3_prompt_upsampler_w4a8.safetensors")
MAX_AESTHETIC = 600
MAX_PROMPT = 2000
MAX_REFERENCES = 4
SIZE_STEP = 16  # Flux 2 VAE downscale (8) times the 2x2 latent patch.
MAX_EDGE = 2048
# The look must read as a finished shot, never as the capture it came from.
BANNED = re.compile(r"clay|\b3-?d\b|unreal|render", re.IGNORECASE)
CONTROL = re.compile(r"[\x00-\x1f\x7f]")

INSTRUCTION = (
    "Turn the first image into a finished, art-directed still in this aesthetic: {aesthetic}. "
    "Keep the composition, camera angle, lens, framing, horizon, object placement, scale and "
    "silhouettes of the first image exactly; every shape stays where it is. Change only "
    "surfaces, materials, textures, lighting, sky and atmosphere so it reads as a real "
    "photographed or illustrated shot."
)
EXTRA = {
    "style": ("Match the colour palette, materials, lighting and grade of the {ordinal} image, an "
              "earlier finished frame of the same shot; take no layout or objects from it."),
    "aesthetic": ("Use the {ordinal} image only as a mood reference for palette, materials and "
                  "light; take no objects or layout from it."),
}
CLOSING = "No text, captions, borders or watermark."
ORDINALS = ("first", "second", "third", "fourth", "fifth")


def clean_aesthetic(text):
    if not isinstance(text, str):
        raise ValueError("--aesthetic must be text.")
    text = " ".join(CONTROL.sub(" ", text).split()).rstrip(".")
    if not text or len(text) > MAX_AESTHETIC:
        raise ValueError(f"--aesthetic must be 1-{MAX_AESTHETIC} characters.")
    if BANNED.search(text):
        raise ValueError("--aesthetic must describe the finished look; drop words like clay, 3D, Unreal or render.")
    return text


def build_prompt(aesthetic, extra_roles=()):
    """Fixed instruction plus the aesthetic; extra_roles label references 2..n."""
    if len(extra_roles) + 1 > MAX_REFERENCES:
        raise ValueError(f"At most {MAX_REFERENCES} reference images.")
    parts = [INSTRUCTION.format(aesthetic=clean_aesthetic(aesthetic))]
    for i, role in enumerate(extra_roles, start=1):
        if role not in EXTRA:
            raise ValueError(f"Unknown reference role {role!r}.")
        parts.append(EXTRA[role].format(ordinal=ORDINALS[i]))
    parts.append(CLOSING)
    prompt = " ".join(parts)
    if len(prompt) > MAX_PROMPT or BANNED.search(prompt):
        raise ValueError("Look prompt failed its length or wording bound.")
    return prompt


def load_graph():
    raw = GRAPH_FILE.read_bytes()
    graph = json.loads(raw)
    for node_id, class_type in EXPECTED.items():
        if graph.get(node_id, {}).get("class_type") != class_type:
            raise ValueError(f"Klein Base edit graph node {node_id} is not {class_type}; review the copied graph.")
    return graph, hashlib.sha256(raw).hexdigest()


def check_size(width, height):
    for name, value in (("width", width), ("height", height)):
        if type(value) is not int or not SIZE_STEP <= value <= MAX_EDGE or value % SIZE_STEP:
            raise ValueError(f"--{name} must be a multiple of {SIZE_STEP} between {SIZE_STEP} and {MAX_EDGE}.")


def fill_graph(graph, uploads, prompt, width, height, seed, prefix, upsample=False):
    """uploads[i] is the ComfyUI input name of reference i; reference 0 is the guide frame.

    The pinned graph samples from ReferenceMultiLatent's own latent (first
    reference at ~1 MP). An exact W x H needs an explicit EmptyFlux2LatentImage,
    the class the Klein Base t2i graph already uses; references still resize to
    the same pixel budget.
    """
    check_size(width, height)
    if not 1 <= len(uploads) <= MAX_REFERENCES:
        raise ValueError(f"Supply 1-{MAX_REFERENCES} references.")
    if type(seed) is not int or not 0 <= seed < 2**48:
        raise ValueError("--seed must be an integer from 0 to 2^48-1.")
    graph = copy.deepcopy(graph)
    latents, batch = graph[LATENTS_NODE]["inputs"], graph[BATCH_NODE]["inputs"]
    for key in [k for k in latents if k.startswith("images.")]:
        del latents[key]
    for key in [k for k in batch if k.startswith("images.")]:
        del batch[key]
    for i, name in enumerate(uploads):
        node_id = f"reference-{i}"
        graph[node_id] = {"class_type": "LoadImage", "inputs": {"image": name},
                          "_meta": {"title": f"Reference image {i + 1}"}}
        latents[f"images.image{i}"] = [node_id, 0]
        batch[f"images.image{i}"] = [node_id, 0]
    latents["resolution.megapixels"] = round(width * height / (1024 * 1024), 6)
    graph[PROMPT_NODE]["inputs"]["value"] = prompt
    # Bypassed by default: the exact recorded prompt is what conditions the model.
    graph[SWITCH_NODE]["inputs"]["switch"] = not upsample
    graph[UPSAMPLER_NODE]["inputs"]["sampling_mode.seed"] = seed
    graph[SAMPLER_NODE]["inputs"]["seed"] = seed
    graph[LATENT_NODE] = {"class_type": "EmptyFlux2LatentImage",
                          "inputs": {"width": width, "height": height, "batch_size": 1},
                          "_meta": {"title": "Look size"}}
    graph[SAMPLER_NODE]["inputs"]["latent_image"] = [LATENT_NODE, 0]
    graph[SAVE_NODE]["inputs"]["filename_prefix"] = prefix
    return graph


def aspect_error(width, height, guide_width, guide_height):
    """Copied from media.image_contract (prepare.py --look): the look is judged
    against the 2x output stage and may differ by at most one output pixel of
    integer rounding. Kept local so this tool does not import a module in flux."""
    target_width, target_height = guide_width * 2, guide_height * 2
    width_error = abs(width * target_height / height - target_width)
    height_error = abs(height * target_width / width - target_height)
    return max(width_error, height_error)


def check_aspect(width, height, guide_width, guide_height, what="--width/--height"):
    error = aspect_error(width, height, guide_width, guide_height)
    if error > 1.0:
        raise ValueError(f"{what} {width}x{height} does not match the guide aspect {guide_width}x{guide_height} "
                         f"(off by {error:.2f} output pixels; at most 1).")
    return error


def png_size(path):
    with Path(path).open("rb") as handle:
        head = handle.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n" or head[12:16] != b"IHDR":
        raise ValueError(f"{Path(path).name} is not a PNG.")
    width, height = struct.unpack(">II", head[16:24])
    if not width or not height:
        raise ValueError(f"{Path(path).name} has no size.")
    return width, height


def checked_url(value):
    """run.py's rule: plaintext http only on loopback (an SSH tunnel), https elsewhere.

    No credential is ever sent.
    """
    parsed = urllib.parse.urlsplit(value)
    if (CONTROL.search(value) or parsed.scheme not in ("http", "https") or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ("", "/")):
        raise ValueError("Use a bare http(s) ComfyUI origin without credentials, path, query or fragment.")
    if parsed.scheme == "http" and not is_loopback(parsed.hostname):
        raise ValueError("Use a loopback ComfyUI origin through an SSH tunnel, or https; plaintext remote origins are refused.")
    return value.rstrip("/")


def is_loopback(host):
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def combo_options(spec):
    """Copied from comfy_client: core/V3 and legacy packs shape dropdowns differently."""
    if not isinstance(spec, list) or not spec:
        return None
    if isinstance(spec[0], list):
        return spec[0]
    if spec[0] == "COMBO" and len(spec) > 1 and isinstance(spec[1], dict):
        options = spec[1].get("options")
        return options if isinstance(options, list) else None
    return None


def preflight_graph(graph, info):
    """A small copy of comfy_client.preflight_graph: every class present, every
    model filename listed by its loader, and the four Klein files among them."""
    errors, models = [], set()
    for node_id, node in graph.items():
        schema = info.get(node["class_type"])
        if not isinstance(schema, dict):
            errors.append(f"Missing node {node['class_type']} ({node_id}).")
            continue
        declared = {**schema.get("input", {}).get("required", {}), **schema.get("input", {}).get("optional", {})}
        for name, value in node["inputs"].items():
            if isinstance(value, str) and value.endswith((".safetensors", ".ckpt", ".pth")):
                choices = combo_options(declared.get(name))
                if choices is None or value not in choices:
                    errors.append(f"{node_id}.{name}: model is not listed by ComfyUI: {value}")
                models.add(value)
    for name in MODELS:
        if name not in models:
            errors.append(f"Graph no longer loads {name}.")
    if errors:
        raise ValueError("Preflight failed before upload/queue:\n" + "\n".join(errors))
    return {"classes": sorted({node["class_type"] for node in graph.values()}), "model_filenames": sorted(models)}
