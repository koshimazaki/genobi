"""Preflight by default. Explicit --submit queues once; --resume only reads and downloads."""
import argparse
import copy
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import time
import uuid

from common import digest, read_json, safe_bundle_path, write_json
from comfy_client import ComfyClient, ResponseError, preflight_graph, remote_file
from graph import BINDING_ROLES
from media import number, probe, video_contract

RECEIPT = "run.private.json"
PROMPT_ID = re.compile(r"[A-Za-z0-9_-]{1,200}")


def now():
    return datetime.now(timezone.utc).isoformat()


def bundle_inputs(root):
    manifest, graph, _ = bundle_snapshot(root)
    return manifest, graph


def bundle_snapshot(root):
    manifest_bytes = (root / "experiment.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    if manifest.get("version") != 1 or manifest.get("candidate") is not True or manifest.get("status") != "prepared_not_run":
        raise ValueError("Expected a prepared candidate experiment bundle.")
    for asset in manifest["assets"].values():
        path = safe_bundle_path(root, asset["path"])
        if not path.is_file() or digest(path) != asset["sha256"]:
            raise ValueError("Frozen input/workflow bytes changed; prepare a new reviewed bundle.")
    # Parse the exact graph bytes whose hash was checked; a second file read
    # could otherwise observe a concurrent replacement after verification.
    graph_bytes = safe_bundle_path(root, manifest["workflow"]["path"]).read_bytes()
    if hashlib.sha256(graph_bytes).hexdigest() != manifest["workflow"]["sha256"]:
        raise ValueError("Frozen input/workflow bytes changed; prepare a new reviewed bundle.")
    return manifest, json.loads(graph_bytes), hashlib.sha256(manifest_bytes).hexdigest()


def save_receipt(root, receipt):
    receipt["updated_at"] = now()
    write_json(root / RECEIPT, receipt)


def output_timing_record(manifest):
    """Use the rendered dimensions recorded at preparation, never a guessed factor."""
    recorded = (manifest.get("timing") or {}).get("output")
    if not isinstance(recorded, dict) or not isinstance(recorded.get("width"), int) or not isinstance(recorded.get("height"), int):
        raise ValueError("Bundle records no output dimensions; prepare a new bundle.")
    return {**manifest["timing"], "width": recorded["width"], "height": recorded["height"]}


def check_bindings(graph, bindings):
    """Refuse a moved or retyped node before any upload or reservation is written."""
    if not isinstance(bindings, dict) or set(bindings) != set(BINDING_ROLES):
        raise ValueError("Bundle records no complete node binding map; prepare a new bundle.")
    for role in BINDING_ROLES:
        spec = bindings[role]
        node = graph.get(spec.get("node"), {})
        if node.get("class_type") != spec.get("class_type"):
            raise ValueError(f"Frozen {role} binding no longer matches the graph; prepare a new bundle.")
    return bindings


def apply_bindings(graph, bindings, uploads, request_id):
    """Rewrite only the roles the bundle recorded, checking each class still matches."""
    check_bindings(graph, bindings)
    for role in ("rgb", "look", "audio"):
        spec = bindings[role]
        graph[spec["node"]]["inputs"][spec["field"]] = uploads[role]["filename"]
    save = bindings["save"]
    graph[save["node"]]["inputs"][save["field"]] = f"genobi-experiments/{request_id}/candidate"


def submit_once(root, client, budget_usd):
    if root.joinpath(RECEIPT).exists():
        raise ValueError("This bundle already has a run reservation. Use --resume; submission will not be repeated.")
    if not isinstance(budget_usd, (float, int)) or not math.isfinite(budget_usd) or budget_usd <= 0:
        raise ValueError("--submit requires a positive --budget-usd planning limit.")
    manifest, graph, experiment_hash = bundle_snapshot(root)
    info = client.info()
    readiness = preflight_graph(graph, info)
    check_bindings(graph, manifest.get("bindings"))
    stats = client.stats()
    receipt = {"version": 1, "candidate": True, "request_id": str(uuid.uuid4()), "prompt_id": None,
               "status": "reserved", "created_at": now(), "endpoint": client.base,
               "experiment_sha256": experiment_hash, "budget_usd": budget_usd,
               "budget_scope": "operator planning limit; this script cannot cap or stop GPU rental billing",
               "readiness": readiness, "uploads": {}, "outputs": [], "quality_review": "pending"}
    # Exclusive durable reservation precedes all uploads and the only POST /prompt.
    write_json(root / RECEIPT, receipt, exclusive=True)
    write_json(root / "object-info.private.json", {key: info[key] for key in readiness["classes"]}, exclusive=True)
    write_json(root / "system-stats.private.json", stats, exclusive=True)
    try:
        receipt["status"] = "uploading"
        save_receipt(root, receipt)
        for role in ("rgb", "look", "audio"):
            asset = manifest["assets"][role]
            remote = client.upload(safe_bundle_path(root, asset["path"]), receipt["request_id"], role, asset["sha256"])
            receipt["uploads"][role] = {"filename": remote, "sha256": asset["sha256"]}
            save_receipt(root, receipt)
        graph = copy.deepcopy(graph)
        apply_bindings(graph, manifest.get("bindings"), receipt["uploads"], receipt["request_id"])
        write_json(root / "executed-workflow.private.json", graph, exclusive=True)
        receipt["executed_workflow_sha256"] = digest(root / "executed-workflow.private.json")
    except Exception:
        receipt["status"] = "upload_failed_not_submitted"
        save_receipt(root, receipt)
        raise
    receipt["status"] = "submitting"
    save_receipt(root, receipt)
    try:
        response = client.submit(graph, receipt["request_id"])
        prompt_id = response.get("prompt_id")
        if not isinstance(prompt_id, str) or not PROMPT_ID.fullmatch(prompt_id):
            raise RuntimeError("Submission response has no usable prompt id.")
    except Exception as error:
        rejected = isinstance(error, ResponseError) and error.status in (400, 401, 403, 404, 405, 413, 415, 422, 429)
        receipt["status"] = "rejected" if rejected else "submission_unknown"
        save_receipt(root, receipt)
        raise RuntimeError(f"Run state: {receipt['status']}. It has not been retried. Use --resume or inspect the private receipt.") from None
    receipt.update(status="queued", prompt_id=prompt_id)
    save_receipt(root, receipt)
    return receipt


def resolve_unknown(client, receipt, queue):
    """Only recover an already accepted request; never POST to recover."""
    request_id = receipt["request_id"]
    for row in [*queue.get("queue_running", []), *queue.get("queue_pending", [])]:
        if not isinstance(row, list) or len(row) < 4 or not isinstance(row[3], dict):
            continue
        extra = row[3]
        if extra.get("genobi_candidate_request") == request_id or extra.get("client_id") == request_id:
            if isinstance(row[1], str) and PROMPT_ID.fullmatch(row[1]):
                return row[1]
    # Newer ComfyUI accepts our requested UUID. Older versions may not; a
    # missing record never proves that an uncertain POST was rejected.
    if request_id in client.history(request_id):
        return request_id
    return None


def output_descriptors(history):
    files = []
    node = history.get("outputs", {}).get("61", {})
    if not isinstance(node, dict):
        return files
    for values in node.values():
        if not isinstance(values, list):
            continue
        for value in values:
            if isinstance(value, dict) and isinstance(value.get("filename"), str) and Path(value["filename"]).suffix.lower() in (".mp4", ".webm", ".mov", ".mkv"):
                descriptor = remote_file(value, "output")
                if descriptor not in files:
                    files.append(descriptor)
    return files


def fetch_output(root, client, receipt, entry, manifest):
    files = output_descriptors(entry)
    if len(files) != 1:
        receipt["status"] = "completed_output_needs_inspection"
        save_receipt(root, receipt)
        return receipt
    expected_folder = f"genobi-experiments/{receipt['request_id']}"
    if files[0]["subfolder"] != expected_folder or not files[0]["filename"].startswith("candidate_"):
        raise ValueError("Saved output does not belong to this experiment's isolated output prefix.")
    folder = root / "outputs"
    folder.mkdir(exist_ok=True, mode=0o700)
    target = folder / ("generated" + Path(files[0]["filename"]).suffix.lower())
    # After a crash, an unreceipted file is unverified evidence. Keep it, then
    # download the same remote output again; this never queues a replacement.
    recorded = next((item for item in receipt["outputs"] if item.get("path") == str(target.relative_to(root))), None)
    if target.exists():
        if recorded is None:
            target.rename(folder / ("unverified-" + uuid.uuid4().hex + target.suffix))
        elif recorded.get("remote") != files[0] or digest(target) != recorded.get("sha256"):
            raise ValueError("Saved output changed or belongs to another remote file; inspect the retained evidence.")
    if not target.exists():
        client.download(files[0], target)
    receipt["outputs"] = [{"path": str(target.relative_to(root)), "sha256": digest(target), "bytes": target.stat().st_size, "remote": files[0]}]
    save_receipt(root, receipt)
    timing = output_timing_record(manifest)
    try:
        measured = video_contract(probe(target, "v:0"), timing, "Generated video")
        audio = probe(target, "a:0")
        if len(audio.get("streams", [])) != 1:
            raise ValueError("Generated file has no single original-audio soundtrack.")
        stream = audio["streams"][0]
        duration = number(stream.get("duration", audio.get("format", {}).get("duration")), "soundtrack duration")
        start = number(stream.get("start_time", "0"), "soundtrack start time")
        if abs(start) > 1 / 24 or abs(duration - timing["frames"] / 24) > 1 / 24:
            raise ValueError("Generated soundtrack timing differs by more than one frame; inspect the saved output.")
        measured["soundtrack"] = {"probe": audio, "content_and_offset_review": "pending"}
        write_json(root / "output-probe.private.json", measured)
        receipt["status"] = "output_downloaded_unreviewed"
    except ValueError as error:
        receipt["status"] = "output_validation_failed"
        receipt["validation_error"] = str(error)
    save_receipt(root, receipt)
    return receipt


def poll_once(root, client):
    manifest, _, experiment_hash = bundle_snapshot(root)
    receipt = read_json(root / RECEIPT)
    if receipt.get("version") != 1 or receipt.get("candidate") is not True or not isinstance(receipt.get("request_id"), str) or not PROMPT_ID.fullmatch(receipt["request_id"]):
        raise ValueError("Invalid private run receipt; inspect it before recovery.")
    if receipt.get("endpoint") != client.base or receipt.get("experiment_sha256") != experiment_hash:
        raise ValueError("Resume must use the original endpoint and frozen experiment.")
    executed = root / "executed-workflow.private.json"
    if receipt.get("executed_workflow_sha256") and (not executed.is_file() or digest(executed) != receipt["executed_workflow_sha256"]):
        raise ValueError("Executed workflow changed since reservation; inspect the frozen receipt.")
    if receipt["status"] in ("output_downloaded_unreviewed", "output_validation_failed", "execution_error", "rejected", "completed_output_needs_inspection"):
        for output in receipt.get("outputs", []):
            path = safe_bundle_path(root, output["path"])
            if not path.is_file() or digest(path) != output.get("sha256"):
                raise ValueError("Saved output changed since its receipt; inspect the retained evidence.")
        return receipt
    if receipt["status"] in ("reserved", "uploading", "upload_failed_not_submitted"):
        raise ValueError("This reservation never reached submission. Inspect it; resume will not upload or queue.")
    queue = client.queue()
    prompt_id = receipt.get("prompt_id")
    if prompt_id is None:
        prompt_id = resolve_unknown(client, receipt, queue)
        if prompt_id is None:
            receipt["status"] = "submission_unknown"
            save_receipt(root, receipt)
            return receipt
        receipt["prompt_id"] = prompt_id
        save_receipt(root, receipt)
    if not isinstance(prompt_id, str) or not PROMPT_ID.fullmatch(prompt_id):
        raise ValueError("Private receipt has an invalid prompt id.")
    for key, status in (("queue_running", "running"), ("queue_pending", "queued")):
        if any(isinstance(row, list) and len(row) > 1 and row[1] == prompt_id for row in queue.get(key, [])):
            receipt["status"] = status
            save_receipt(root, receipt)
            return receipt
    entry = client.history(prompt_id).get(prompt_id)
    if not isinstance(entry, dict):
        receipt["status"] = "accepted_status_unknown"
        save_receipt(root, receipt)
        return receipt
    write_json(root / "history.private.json", entry)
    if entry.get("status", {}).get("status_str") == "error":
        receipt["status"] = "execution_error"
        save_receipt(root, receipt)
        return receipt
    if not entry.get("status", {}).get("completed"):
        receipt["status"] = "accepted_status_unknown"
        save_receipt(root, receipt)
        return receipt
    return fetch_output(root, client, receipt, entry, manifest)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--url", default="http://127.0.0.1:8188")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--submit", action="store_true")
    action.add_argument("--resume", action="store_true")
    parser.add_argument("--budget-usd", type=float)
    parser.add_argument("--wait-seconds", type=int, default=0)
    parser.add_argument("--poll-interval", type=int, default=5)
    args = parser.parse_args()
    try:
        root = args.bundle.resolve()
        if not 0 <= args.wait_seconds <= 3600 or not 1 <= args.poll_interval <= 30:
            raise ValueError("Wait must be 0–3600 seconds and polling interval 1–30 seconds.")
        client = ComfyClient(args.url)
        if not args.submit and not args.resume:
            manifest, graph = bundle_inputs(root)
            print(json.dumps({"status": "preflight_passed", "candidate": True, "mode": manifest["mode"],
                              **preflight_graph(graph, client.info()), "submitted": False}))
            return
        fd = os.open(root / ".run.lock", os.O_CREAT | os.O_RDWR, 0o600)
        with os.fdopen(fd, "wb") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            receipt = submit_once(root, client, args.budget_usd) if args.submit else poll_once(root, client)
            deadline = time.monotonic() + args.wait_seconds
            while receipt["status"] in ("queued", "running", "accepted_status_unknown") and time.monotonic() < deadline:
                time.sleep(min(args.poll_interval, max(0, deadline - time.monotonic())))
                receipt = poll_once(root, client)
            print(json.dumps({"status": receipt["status"], "candidate": True, "quality_review": receipt["quality_review"],
                              "receipt": str(root / RECEIPT), "rental_budget_enforced": False}))
    except (OSError, ValueError, RuntimeError, KeyError, TypeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
