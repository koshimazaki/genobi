"""Generate art-directed look stills from guide frames with FLUX 3 Klein Base (image edit).

  look.py one   --frame PNG --aesthetic TEXT [--reference PNG ...] --width W --height H --out PATH
  look.py batch --capture DIR --aesthetic TEXT [--aesthetic-image PNG] --width W --height H --out DIR
  look.py fetch --receipt PATH     (read-only: polls and downloads an already queued look)

Each look POSTs /prompt exactly once. An uncertain submission is never retried;
its receipt says so, and `fetch` only reads /history.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.request
import uuid

from comfy_client import ComfyClient, NoRedirect, ResponseError, remote_file
from look_graph import (SAVE_NODE, build_prompt, check_aspect, check_size, checked_url, fill_graph,
                        load_graph, png_size, preflight_graph)

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
MAX_IMAGE = 64 * 1024 * 1024
PROMPT_ID = re.compile(r"[A-Za-z0-9_-]{1,200}")
FRAME_FILE = re.compile(r"frame-(?:(?:closed|open)-)?\d{4}\.png")
ROLES = ("first", "closed", "open")
DONE = "downloaded"


def now():
    return datetime.now(timezone.utc).isoformat()


def sha256(path):
    result = hashlib.sha256()
    with Path(path).open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def write_json(path, value, exclusive=False):
    raw = (json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n").encode()
    path = Path(path)
    if exclusive:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        return
    fd, temporary = tempfile.mkstemp(prefix=".look-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(raw)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def image_file(value, role, suffixes=IMAGE_SUFFIXES):
    path = Path(value).expanduser().resolve()
    if not path.is_file() or path.suffix.lower() not in suffixes or not 0 < path.stat().st_size <= MAX_IMAGE:
        raise ValueError(f"{role} must be an existing {'/'.join(sorted(suffixes))} file under {MAX_IMAGE >> 20} MiB.")
    return path


def receipt_path(out):
    return out.parent / (out.stem + ".receipt.json")


class LookClient(ComfyClient):
    """ComfyClient's bounded transport with this tool's URL rule and no credentials."""

    def __init__(self, base, timeout=30):
        self.base = checked_url(base)
        self.timeout = timeout
        self.opener = urllib.request.build_opener(NoRedirect(), urllib.request.ProxyHandler({}))
        self.headers = {}


def output_descriptor(entry, request_id):
    images = entry.get("outputs", {}).get(SAVE_NODE, {}).get("images", [])
    files = [remote_file(item, "output") for item in images if isinstance(item, dict)]
    if len(files) != 1:
        raise ValueError(f"Expected one saved image, ComfyUI reported {len(files)}.")
    if files[0]["subfolder"] != f"genobi-experiments/{request_id}" or not files[0]["filename"].startswith("look"):
        raise ValueError("Saved image does not belong to this look's isolated output prefix.")
    return files[0]


def preflight(client, references, width, height):
    """GET /object_info once and check the graph as it will be filled; no upload, no POST."""
    graph, _ = load_graph()
    placeholder = fill_graph(graph, [f"preflight/reference-{i}.png" for i in range(references)],
                             "preflight", width, height, 0, "preflight/look")
    return preflight_graph(placeholder, client.info())


def poll(client, receipt, out, wait_seconds, poll_interval=3, sleep=time.sleep, clock=time.monotonic):
    """Read /history until the look is saved or the wait ends; never POSTs."""
    path = receipt_path(out)
    deadline = clock() + wait_seconds
    while True:
        entry = client.history(receipt["prompt_id"]).get(receipt["prompt_id"])
        status = entry.get("status", {}) if isinstance(entry, dict) else {}
        if status.get("status_str") == "error":
            receipt.update(status="execution_error", updated_at=now())
            write_json(path, receipt)
            return receipt
        if status.get("completed"):
            descriptor = output_descriptor(entry, receipt["request_id"])
            client.download(descriptor, out)
            size = png_size(out) if out.suffix.lower() == ".png" else None
            expected = (receipt["width"], receipt["height"])
            receipt.update(status=DONE if size in (None, expected) else "output_size_mismatch",
                           output={"file": out.name, "sha256": sha256(out), "remote": descriptor,
                                   "size": list(size) if size else None}, updated_at=now())
            write_json(path, receipt)
            return receipt
        if clock() >= deadline:
            receipt.update(status="accepted_not_finished", updated_at=now())
            write_json(path, receipt)
            return receipt
        sleep(min(poll_interval, max(0.0, deadline - clock())))


def generate(client, frame, aesthetic, out, width, height, seed=42, references=(), wait_seconds=600,
             upsample=False, guide=None, check=False, **poll_options):
    """One look. references: [(path, role)] with role 'style' or 'aesthetic'."""
    frame = image_file(frame, "--frame", {".png"})
    references = [(image_file(p, "--reference"), role) for p, role in references]
    out = Path(out).expanduser().resolve()
    if out.suffix.lower() != ".png" or not out.parent.is_dir():
        raise ValueError("--out must be a .png path in an existing directory.")
    if out.exists() or receipt_path(out).exists():
        raise ValueError(f"{out.name} or its receipt already exists; refusing to submit again.")
    check_size(width, height)
    frame_size = png_size(frame)
    check_aspect(width, height, *(guide or frame_size))
    check_aspect(*frame_size, *(guide or frame_size), what="Guide frame")
    prompt = build_prompt(aesthetic, [role for _, role in references])
    if check:
        preflight(client, 1 + len(references), width, height)
    graph, graph_sha = load_graph()
    inputs = [(frame, "guide")] + references
    request_id = str(uuid.uuid4())
    receipt = {"version": 1, "candidate": True, "tool": "look.py", "request_id": request_id, "prompt_id": None,
               "status": "reserved", "created_at": now(), "endpoint": client.base, "graph_sha256": graph_sha,
               "prompt": prompt, "aesthetic": aesthetic, "seed": seed, "width": width, "height": height,
               "upsample": upsample, "guide_size": list(guide or frame_size),
               "inputs": [{"slot": f"reference-{i}", "role": role, "file": path.name, "sha256": sha256(path)}
                          for i, (path, role) in enumerate(inputs)]}
    path = receipt_path(out)
    # Durable reservation before any upload and before the only POST /prompt.
    write_json(path, receipt, exclusive=True)
    try:
        uploads = [client.upload(p, request_id, f"reference-{i}", receipt["inputs"][i]["sha256"])
                   for i, (p, _) in enumerate(inputs)]
        executed = fill_graph(graph, uploads, prompt, width, height, seed,
                              f"genobi-experiments/{request_id}/look", upsample)
    except Exception:
        receipt.update(status="upload_failed_not_submitted", updated_at=now())
        write_json(path, receipt)
        raise
    receipt.update(status="submitting", uploads=uploads, updated_at=now())
    write_json(path, receipt)
    try:
        prompt_id = client.submit(executed, request_id).get("prompt_id")
        if not isinstance(prompt_id, str) or not PROMPT_ID.fullmatch(prompt_id):
            raise RuntimeError("Submission response has no usable prompt id.")
    except Exception as error:
        rejected = isinstance(error, ResponseError) and error.status in (400, 401, 403, 404, 405, 413, 415, 422, 429)
        receipt.update(status="rejected" if rejected else "submission_unknown", updated_at=now())
        write_json(path, receipt)
        raise RuntimeError(f"Look state: {receipt['status']}. It was not retried; inspect {path.name}.") from None
    receipt.update(status="queued", prompt_id=prompt_id, updated_at=now())
    write_json(path, receipt)
    return poll(client, receipt, out, wait_seconds, **poll_options)


def fetch(receipt_file, wait_seconds=600, client=None, **poll_options):
    receipt_file = Path(receipt_file).expanduser().resolve()
    receipt = json.loads(receipt_file.read_text(encoding="utf-8"))
    if receipt.get("tool") != "look.py" or not isinstance(receipt.get("prompt_id"), str) \
            or not PROMPT_ID.fullmatch(receipt["prompt_id"]):
        raise ValueError("Receipt has no accepted prompt id; nothing to fetch (never resubmitted).")
    out = receipt_file.parent / receipt_file.name.replace(".receipt.json", ".png")
    if receipt.get("status") == DONE:
        return receipt
    if out.exists():
        raise ValueError(f"{out.name} exists without a finished receipt; inspect it.")
    client = client or LookClient(receipt["endpoint"])
    if client.base != receipt.get("endpoint"):
        raise ValueError("Fetch must use the endpoint the look was queued on.")
    return poll(client, receipt, out, wait_seconds, **poll_options)


def read_keyframes(capture):
    data = json.loads((capture / "keyframes.json").read_text(encoding="utf-8"))
    frames = data.get("frames") if isinstance(data, dict) else None
    if not isinstance(frames, list):
        raise ValueError("keyframes.json must hold a frames list.")
    by_role = {}
    for row in frames:
        role, index, file = (row.get(k) for k in ("role", "index", "file")) if isinstance(row, dict) else (None,) * 3
        if role not in ROLES or role in by_role or type(index) is not int or index < 0 \
                or not isinstance(file, str) or not FRAME_FILE.fullmatch(file):
            raise ValueError(f"Unexpected keyframes.json row: {row!r}")
        by_role[role] = {"role": role, "index": index, "file": file, "path": image_file(capture / file, file, {".png"})}
    if "first" not in by_role or by_role["first"]["index"] != 0:
        raise ValueError("keyframes.json needs a first frame at index 0.")
    return [by_role[role] for role in ROLES if role in by_role], data.get("band")


def guide_size(capture):
    for name, pick in (("recipe.json", lambda d: d), ("capture.json", lambda d: d.get("recipe", {}))):
        if (capture / name).is_file():
            recipe = pick(json.loads((capture / name).read_text(encoding="utf-8")))
            if type(recipe.get("width")) is int and type(recipe.get("height")) is int:
                return recipe["width"], recipe["height"]
    raise ValueError("Capture has no recipe.json or capture.json with width and height.")


def look_name(key):
    return "look-first.png" if key["role"] == "first" else f"look-{key['role']}-{key['index']:04d}.png"


def batch(client, capture, aesthetic, out_dir, width, height, seed=42, aesthetic_image=None, wait_seconds=600,
          upsample=False, check=False, **poll_options):
    """First look from frame 0, then closed/open with the first look as a style reference."""
    capture = Path(capture).expanduser().resolve()
    keys, band = read_keyframes(capture)
    guide = guide_size(capture)
    check_size(width, height)
    check_aspect(width, height, *guide)
    out_dir = Path(out_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    extra = [(image_file(aesthetic_image, "--aesthetic-image"), "aesthetic")] if aesthetic_image else []
    if check:
        # The largest graph the batch fills: guide, first look and the mood image.
        preflight(client, min(len(keys), 2) + len(extra), width, height)
    looks, first_look = [], None
    for key in keys:
        out = out_dir / look_name(key)
        existing = receipt_path(out)
        if existing.exists():
            receipt = json.loads(existing.read_text(encoding="utf-8"))
            if receipt.get("status") != DONE or not out.is_file():
                raise RuntimeError(f"{existing.name} is {receipt.get('status')}; run `look.py fetch --receipt` first.")
        else:
            references = ([(first_look, "style")] if first_look else []) + extra
            receipt = generate(client, key["path"], aesthetic, out, width, height, seed, references,
                               wait_seconds, upsample, guide, **poll_options)
            if receipt["status"] != DONE:
                raise RuntimeError(f"{out.name}: {receipt['status']}; later looks need it. See {existing.name}.")
        if key["role"] == "first":
            first_look = out
        looks.append({"role": key["role"], "index": key["index"], "frame": key["file"], "look": out.name,
                      "receipt": existing.name})
    manifest = {"version": 1, "aesthetic": aesthetic, "aesthetic_image": extra[0][0].name if extra else None,
                "band": band, "seed": seed, "width": width, "height": height, "guide": list(guide), "looks": looks}
    write_json(out_dir / "looks.json", manifest)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("one", "batch"):
        p = sub.add_parser(name)
        p.add_argument("--aesthetic", required=True)
        p.add_argument("--width", type=int, required=True)
        p.add_argument("--height", type=int, required=True)
        p.add_argument("--seed", type=int, default=42)
        p.add_argument("--upsample", action="store_true", help="Let the graph's vision upsampler rewrite the prompt")
        p.add_argument("--aesthetic-image", type=Path, help="Owner mood image: palette and light only")
        p.add_argument("--preflight", action="store_true",
                       help="GET /object_info once; refuse to submit if a node class or Klein model is missing")
    sub.choices["one"].add_argument("--frame", type=Path, required=True)
    sub.choices["one"].add_argument("--reference", type=Path, action="append", default=[],
                                    help="Extra style reference, e.g. the first look (repeatable)")
    sub.choices["one"].add_argument("--out", type=Path, required=True)
    sub.choices["batch"].add_argument("--capture", type=Path, required=True)
    sub.choices["batch"].add_argument("--out", type=Path, required=True)
    sub.add_parser("fetch").add_argument("--receipt", type=Path, required=True)
    for p in sub.choices.values():
        p.add_argument("--url", default="http://127.0.0.1:8189")
        p.add_argument("--wait-seconds", type=int, default=600)
    args = parser.parse_args()
    try:
        if not 0 <= args.wait_seconds <= 3600:
            raise ValueError("--wait-seconds must be 0-3600.")
        if args.command == "fetch":
            result = fetch(args.receipt, args.wait_seconds, LookClient(args.url))
            print(json.dumps({"status": result["status"], "output": result.get("output")}))
            return
        client = LookClient(args.url)
        if args.command == "one":
            result = generate(client, args.frame, args.aesthetic, args.out, args.width, args.height, args.seed,
                              [(p, "style") for p in args.reference]
                              + ([(args.aesthetic_image, "aesthetic")] if args.aesthetic_image else []),
                              args.wait_seconds, args.upsample, check=args.preflight)
            print(json.dumps({"status": result["status"], "receipt": str(receipt_path(args.out.resolve()))}))
        else:
            result = batch(client, args.capture, args.aesthetic, args.out, args.width, args.height, args.seed,
                           args.aesthetic_image, args.wait_seconds, args.upsample, check=args.preflight)
            print(json.dumps({"status": DONE, "looks": [row["look"] for row in result["looks"]]}))
    except (OSError, ValueError, RuntimeError, KeyError, TypeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
