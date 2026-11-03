"""Read-only readiness check for a local/SSH-tunnelled ComfyUI worker.

No prompt is queued. A passing report checks dependencies and declared inputs,
not model fit in VRAM, generation quality or audio/visual timing.
"""

import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request

import assets


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def command(args):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=30, check=False)
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def loopback_url(value):
    parsed = urllib.parse.urlsplit(value)
    if (parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost", "::1")
            or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise ValueError("Comfy URL must be a loopback HTTP origin; use an SSH tunnel")
    try:
        parsed.port
    except ValueError as error:
        raise ValueError("Invalid Comfy port") from error
    return value.rstrip("/")


def read_json(url):
    # Do not allow an HTTP proxy environment variable to route loopback data.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(url, timeout=20) as response:
        data = response.read(24 * 1024 * 1024 + 1)
    if len(data) > 24 * 1024 * 1024:
        raise ValueError("Comfy metadata exceeds the 24 MiB limit")
    return json.loads(data)


def workflow_requirements(path, object_info):
    graph = json.loads(path.read_text())
    graph = graph.get("prompt", graph)
    if not isinstance(graph, dict) or not graph:
        raise ValueError("Expected a materialized API-format prompt")
    issues = []
    for node_id, node in graph.items():
        if not isinstance(node, dict) or "class_type" not in node:
            raise ValueError("Expected API-format nodes with class_type")
        class_type = node["class_type"]
        schema = object_info.get(class_type)
        if not isinstance(schema, dict):
            issues.append(f"{node_id}: node class unavailable: {class_type}")
            continue
        inputs = node.get("inputs", {})
        if not isinstance(inputs, dict):
            raise ValueError(f"{node_id}: API node inputs must be an object")
        declared = schema.get("input", {})
        choices = {**declared.get("required", {}), **declared.get("optional", {})}
        for name in declared.get("required", {}):
            if name not in inputs:
                issues.append(f"{node_id}.{name}: required input is missing")
        for name, value in inputs.items():
            if isinstance(value, str) and re.search(r"__[A-Z0-9_]+__", value):
                issues.append(f"{node_id}.{name}: unresolved workflow placeholder")
            if isinstance(value, list):
                if (len(value) != 2 or not isinstance(value[0], str)
                        or type(value[1]) is not int or value[1] < 0):
                    issues.append(f"{node_id}.{name}: invalid API node link")
                    continue
                source = graph.get(value[0])
                if not isinstance(source, dict) or "class_type" not in source:
                    issues.append(f"{node_id}.{name}: linked node is missing")
                    continue
                output = object_info.get(source["class_type"], {}).get("output")
                if isinstance(output, list) and value[1] >= len(output):
                    issues.append(f"{node_id}.{name}: linked output is unavailable")
            slot = choices.get(name)
            options = None
            if isinstance(slot, list) and slot:
                if isinstance(slot[0], list):
                    options = slot[0]
                elif slot[0] == "COMBO" and len(slot) > 1 and isinstance(slot[1], dict):
                    options = slot[1].get("options")
            if isinstance(options, list):
                if not isinstance(value, list) and value not in options:
                    issues.append(f"{node_id}.{name}: selected value unavailable")
    return issues


def host_report(comfy, hash_models):
    checks = []
    gpu_text = command(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader,nounits"])
    gpus = []
    for line in (gpu_text or "").splitlines():
        fields = [item.strip() for item in line.split(",")]
        if len(fields) == 3:
            try:
                gpus.append({"name": fields[0], "vram_mib": float(fields[1]), "driver": fields[2]})
            except ValueError:
                continue
    checks.append({"check": "nvidia_gpu", "ok": bool(gpus), "gpus": gpus})
    torch_text = command([sys.executable, "-c", "import torch,json; print(json.dumps({'version':torch.__version__, 'cuda':torch.version.cuda, 'available':torch.cuda.is_available()}))"])
    torch = json.loads(torch_text) if torch_text else {"available": False}
    checks.append({"check": "cuda_pytorch", "ok": bool(torch.get("available")), "details": torch})
    checks.append({"check": "python", "ok": sys.version_info >= (3, 12), "version": sys.version.split()[0]})
    for name in ("ffmpeg", "ffprobe"):
        checks.append({"check": name, "ok": shutil.which(name) is not None})
    checks.append({"check": "comfy_sources", "ok": (comfy / "main.py").is_file()})
    ram_kib = None
    try:
        line = next(line for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemTotal:"))
        ram_kib = int(line.split()[1])
    except (OSError, StopIteration, ValueError):
        pass
    # A container may expose the host's MemTotal while enforcing a smaller
    # memory limit. Compare against the tighter declared cgroup limit.
    for limit_path in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        try:
            limit = int(Path(limit_path).read_text().strip()) // 1024
            if limit > 0:
                ram_kib = min(ram_kib, limit) if ram_kib else limit
        except (OSError, ValueError):
            continue
    checks.append({"check": "host_ram", "ok": ram_kib is not None and ram_kib >= 32 * 1024**2, "ram_gib": ram_kib / 1024**2 if ram_kib else None})
    existing = comfy
    while not existing.exists() and existing != existing.parent:
        existing = existing.parent
    free = shutil.disk_usage(existing).free
    plan = assets.model_plan(assets.selected_models(), comfy / "models", hash_bytes=hash_models)
    wanted_status = "verified" if hash_models else "size_only"
    checks.append({"check": "models", "ok": all(row["status"] == wanted_status for row in plan["files"]), "hashes_checked": hash_models, "files": plan["files"]})
    checks.append({"check": "working_disk", "ok": free >= assets.RESERVE_BYTES, "free_gb": round(free / 1e9, 2)})
    warnings = []
    if gpus and max(gpu["vram_mib"] for gpu in gpus) < 80 * 1024:
        warnings.append("BF16 layout has not been qualified here on this VRAM. Use a short pilot; fitting/offload time remains unmeasured.")
    if ram_kib and ram_kib < 64 * 1024**2:
        warnings.append("64 GiB or more host RAM is recommended for this model stack.")
    if not hash_models:
        warnings.append("Models were checked by size only; use --hash-models before the first GPU run.")
    return checks, warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--comfy-dir", type=Path, required=True)
    parser.add_argument("--url", help="loopback origin, e.g. http://127.0.0.1:8188")
    parser.add_argument("--workflow", action="append", type=Path, default=[])
    parser.add_argument("--hash-models", action="store_true")
    args = parser.parse_args()
    if args.workflow and not args.url:
        parser.error("--workflow requires --url for the running worker's object_info")
    try:
        checks, warnings = host_report(args.comfy_dir, args.hash_models)
        if args.url:
            origin = loopback_url(args.url)
            try:
                info = read_json(origin + "/object_info")
                stats = read_json(origin + "/system_stats")
                checks.append({"check": "comfy_api", "ok": isinstance(info, dict) and isinstance(stats, dict), "node_count": len(info)})
                for path in args.workflow:
                    issues = workflow_requirements(path, info)
                    checks.append({"check": "workflow", "file": path.name, "ok": not issues, "issues": issues})
            except (OSError, ValueError, KeyError, TypeError) as error:
                checks.append({"check": "comfy_api", "ok": False, "error_type": type(error).__name__})
        result = {"schema": "genobi-vast-preflight/1", "ok": all(row["ok"] for row in checks), "checks": checks, "warnings": warnings}
        print(json.dumps(result, indent=2))
        return 0 if result["ok"] else 1
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
