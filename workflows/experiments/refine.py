"""LTX-2.5 Tiled Fusion refine pass (Refine-Details IC-LoRA), run on the GPU box.

  convert  UI graph + the server's /object_info -> API graph. Reads only.
  submit   Upload one clip, set prompt/size/seed/prefix, POST /prompt once.
  status   Read the queue/history of an earlier submit and fetch its video.

Prompts describe look and style only (lighting, palette, film stock, sharpness,
grade), never named objects: a named object can stamp into every spatial tile.
"""
import argparse
import copy
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import time
import uuid

from common import REPO, digest, local_file, read_json, write_json
from comfy_client import ComfyClient, ResponseError, preflight_graph, remote_file
from run import PROMPT_ID
from ui_convert import convert

OUTPUT_SIZES = ("FullHD", "4K", "8K")
TILE_SIZES = ("qHD", "HD", "FullHD")
VIDEO_SUFFIXES = {".mp4", ".mov", ".webm", ".mkv"}
RECEIPT = "refine.private.json"


def now():
    return datetime.now(timezone.utc).isoformat()


def nodes_of(graph, class_type):
    return [key for key, node in graph.items() if node["class_type"] == class_type]


def one(graph, class_type):
    found = nodes_of(graph, class_type)
    if len(found) != 1:
        raise ValueError(f"Expected exactly one {class_type} in the refine graph, found {len(found)}.")
    return found[0]


def prompt_nodes(graph):
    """{'positive': id, 'negative': id}: PrimitiveStringMultiline -> CLIPTextEncode -> LTXVConditioning."""
    roles = {}
    for key in nodes_of(graph, "LTXVConditioning"):
        for role in ("positive", "negative"):
            source = graph[key]["inputs"].get(role)
            encoder = graph.get(source[0]) if isinstance(source, list) else None
            if not encoder or encoder["class_type"] != "CLIPTextEncode":
                continue
            text = encoder["inputs"].get("text")
            if isinstance(text, list) and graph.get(text[0], {}).get("class_type") == "PrimitiveStringMultiline":
                if roles.get(role, text[0]) != text[0]:
                    raise ValueError(f"Two different {role} prompt sources; review the converted graph.")
                roles[role] = text[0]
    if "positive" not in roles:
        raise ValueError("No positive prompt string feeds LTXVConditioning; review the converted graph.")
    return roles


def locate(graph):
    """Every node submit rewrites, found by class rather than by id."""
    seeds = [(key, name) for key in nodes_of(graph, "LTXVTiledFusionSampler") + nodes_of(graph, "RandomNoise")
             for name in ("seed", "noise_seed") if name in graph[key]["inputs"] and not isinstance(graph[key]["inputs"][name], list)]
    if not seeds:
        raise ValueError("No literal sampler seed found in the refine graph.")
    return {"video": one(graph, "LoadVideo"), "save": one(graph, "SaveVideo"), "tiling": one(graph, "LTXVGetTilingSizes"),
            "prompts": prompt_nodes(graph), "seeds": seeds}


def configure(graph, places, video, prompt, negative, output_size, tile_size, seed, prefix):
    if output_size not in OUTPUT_SIZES or tile_size not in TILE_SIZES:
        raise ValueError(f"Output size must be one of {OUTPUT_SIZES}; tile size one of {TILE_SIZES}.")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 4000 or len(negative) > 4000:
        raise ValueError("Supply a bounded look-and-style prompt (lighting, palette, film stock, grade).")
    if type(seed) is not int or not 0 <= seed < 2**53:
        raise ValueError("Seed must be a non-negative integer below 2**53.")
    graph = copy.deepcopy(graph)
    graph[places["video"]]["inputs"]["file"] = video
    graph[places["prompts"]["positive"]]["inputs"]["value"] = prompt
    if "negative" in places["prompts"]:
        graph[places["prompts"]["negative"]]["inputs"]["value"] = negative
    graph[places["tiling"]]["inputs"].update(output_size=output_size, tile_size=tile_size)
    for key, name in places["seeds"]:
        graph[key]["inputs"][name] = seed
    graph[places["save"]]["inputs"]["filename_prefix"] = prefix
    return graph


def private_dir(path):
    path = Path(path).expanduser().resolve()
    if path == REPO.resolve() or REPO.resolve() in path.parents:
        raise ValueError("Choose a private run directory outside the tracked repository.")
    return path


def convert_command(args, client):
    ui = read_json(args.ui)
    out = Path(args.out).expanduser().resolve()
    if out.exists():
        raise ValueError("Output already exists; choose a fresh path.")
    graph, report = convert(ui, client.info())
    if report["notes"] and not args.allow_widget_notes:
        raise ValueError("Widget mapping needs review (--allow-widget-notes to accept):\n" + "\n".join(report["notes"]))
    places = locate(graph)
    write_json(out, graph, exclusive=True)
    return {"status": "converted", "out": str(out), **report, "located": places, "submitted": False}


def submit_command(args, client):
    run_dir = private_dir(args.run_dir)
    if run_dir.exists():
        raise ValueError("Run directory exists; a refine run is submitted once. Use status, or a fresh directory.")
    graph = read_json(args.graph)
    clip = local_file(args.video, "source clip", VIDEO_SUFFIXES, limit=1024 * 1024 * 1024)
    places = locate(graph)
    request_id = str(uuid.uuid4())
    prefix = f"genobi-experiments/refine/{request_id}/refine"
    configure(graph, places, "placeholder.mp4", args.prompt, args.negative, args.output_size, args.tile_size, args.seed, prefix)
    readiness = preflight_graph(graph, client.info())
    run_dir.mkdir(parents=True, mode=0o700)
    receipt = {"version": 1, "kind": "refine", "request_id": request_id, "prompt_id": None, "status": "reserved",
               "created_at": now(), "endpoint": client.base, "graph_sha256": digest(args.graph),
               "video": {"name": clip.name, "sha256": digest(clip), "bytes": clip.stat().st_size},
               "settings": {"output_size": args.output_size, "tile_size": args.tile_size, "seed": args.seed},
               "prompt_rule": "look and style only; no named objects", "readiness": readiness,
               "located": places, "outputs": [], "quality_review": "pending"}
    write_json(run_dir / RECEIPT, receipt, exclusive=True)
    try:
        remote = client.upload(clip, request_id, "source", receipt["video"]["sha256"])
        executed = configure(graph, places, remote, args.prompt, args.negative, args.output_size, args.tile_size, args.seed, prefix)
        write_json(run_dir / "executed-workflow.private.json", executed, exclusive=True)
    except Exception:
        receipt.update(status="upload_failed_not_submitted", updated_at=now())
        write_json(run_dir / RECEIPT, receipt)
        raise
    receipt.update(status="submitting", upload=remote, updated_at=now())
    write_json(run_dir / RECEIPT, receipt)
    try:
        prompt_id = client.submit(executed, request_id).get("prompt_id")
        if not isinstance(prompt_id, str) or not PROMPT_ID.fullmatch(prompt_id):
            raise RuntimeError("Submission response has no usable prompt id.")
    except Exception as error:
        rejected = isinstance(error, ResponseError) and error.status in (400, 401, 403, 404, 405, 413, 415, 422, 429)
        receipt.update(status="rejected" if rejected else "submission_unknown", updated_at=now())
        write_json(run_dir / RECEIPT, receipt)
        raise RuntimeError(f"Run state: {receipt['status']}. It has not been retried; inspect {RECEIPT}.") from None
    receipt.update(status="queued", prompt_id=prompt_id, updated_at=now())
    write_json(run_dir / RECEIPT, receipt)
    return receipt


def poll(run_dir, client):
    """Read-only: queue, then history; download the one saved video. Never POSTs."""
    receipt = read_json(run_dir / RECEIPT)
    if receipt.get("kind") != "refine" or receipt.get("endpoint") != client.base:
        raise ValueError("Status must use the original endpoint and a refine receipt.")
    if receipt["status"] in ("output_downloaded_unreviewed", "rejected", "execution_error") or receipt.get("prompt_id") is None:
        return receipt
    prompt_id = receipt["prompt_id"]
    queue = client.queue()
    for key, status in (("queue_running", "running"), ("queue_pending", "queued")):
        if any(isinstance(row, list) and len(row) > 1 and row[1] == prompt_id for row in queue.get(key, [])):
            receipt.update(status=status, updated_at=now())
            write_json(run_dir / RECEIPT, receipt)
            return receipt
    entry = client.history(prompt_id).get(prompt_id)
    state = (entry or {}).get("status", {})
    if not isinstance(entry, dict) or not state.get("completed"):
        receipt["status"] = "execution_error" if state.get("status_str") == "error" else "accepted_status_unknown"
    else:
        saved = receipt["located"]["save"]
        files = [remote_file(item, "output") for values in entry.get("outputs", {}).get(saved, {}).values()
                 if isinstance(values, list) for item in values if isinstance(item, dict)]
        files = [item for item in files if Path(item["filename"]).suffix.lower() in VIDEO_SUFFIXES]
        if len(files) != 1 or files[0]["subfolder"] != f"genobi-experiments/refine/{receipt['request_id']}":
            receipt["status"] = "completed_output_needs_inspection"
        else:
            target = run_dir / ("refined" + Path(files[0]["filename"]).suffix.lower())
            if not target.exists():
                client.download(files[0], target)
            receipt.update(status="output_downloaded_unreviewed",
                           outputs=[{"path": target.name, "sha256": digest(target), "remote": files[0]}])
    receipt["updated_at"] = now()
    write_json(run_dir / RECEIPT, receipt)
    return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    for name in ("convert", "submit", "status"):
        command = commands.add_parser(name)
        command.add_argument("--url", default="http://127.0.0.1:8188")
        if name == "convert":
            command.add_argument("--ui", type=Path, required=True)
            command.add_argument("--out", type=Path, required=True)
            command.add_argument("--allow-widget-notes", action="store_true")
            continue
        command.add_argument("--run-dir", type=Path, required=True)
        command.add_argument("--wait-seconds", type=int, default=0)
        if name == "submit":
            command.add_argument("--graph", type=Path, required=True)
            command.add_argument("--video", type=Path, required=True)
            command.add_argument("--prompt", required=True, help="Look and style only; no named objects")
            command.add_argument("--negative", default="")
            command.add_argument("--output-size", choices=OUTPUT_SIZES, default="FullHD")
            command.add_argument("--tile-size", choices=TILE_SIZES, default="HD")
            command.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    try:
        client = ComfyClient(args.url)
        if args.command == "convert":
            print(json.dumps(convert_command(args, client)))
            return
        if not 0 <= args.wait_seconds <= 3600:
            raise ValueError("Wait must be 0-3600 seconds.")
        run_dir = private_dir(args.run_dir)
        receipt = submit_command(args, client) if args.command == "submit" else poll(run_dir, client)
        deadline = time.monotonic() + args.wait_seconds
        while receipt["status"] in ("queued", "running", "accepted_status_unknown") and time.monotonic() < deadline:
            time.sleep(min(5, max(0, deadline - time.monotonic())))
            receipt = poll(run_dir, client)
        print(json.dumps({"status": receipt["status"], "receipt": str(run_dir / RECEIPT), "quality_review": "pending"}))
    except (OSError, ValueError, RuntimeError, KeyError, TypeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    os.umask(0o077)
    main()
