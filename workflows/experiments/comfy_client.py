"""Bounded ComfyUI HTTP transport. No retries, redirects or stored credentials."""
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid

from graph import linked, validate_links


class ResponseError(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__(f"ComfyUI returned HTTP {status}.")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def checked_url(value):
    parsed = urllib.parse.urlsplit(value)
    if any(ord(c) < 32 or ord(c) == 127 for c in value) or parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Use an explicit http(s) ComfyUI base URL without credentials, query or fragment.")
    return value.rstrip("/")


def remote_file(value, expected_type):
    if not isinstance(value, dict) or value.get("type", expected_type) != expected_type:
        raise ValueError("ComfyUI returned an unexpected file type.")
    name, subfolder = value.get("filename", value.get("name")), value.get("subfolder", "")
    if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_. -]{0,239}", name):
        raise ValueError("ComfyUI returned an unsafe filename.")
    if not isinstance(subfolder, str) or len(subfolder) > 200 or "\\" in subfolder or subfolder.startswith("/"):
        raise ValueError("ComfyUI returned an unsafe subfolder.")
    if subfolder and any(not re.fullmatch(r"[A-Za-z0-9_-]+", part) for part in subfolder.split("/")):
        raise ValueError("ComfyUI returned an unsafe subfolder.")
    return {"filename": name, "subfolder": subfolder, "type": expected_type}


def combo_options(spec):
    """Comfy core/V3 and legacy packs expose dropdowns in different shapes."""
    if not isinstance(spec, list) or not spec:
        return None
    if isinstance(spec[0], list):
        return spec[0]
    if spec[0] == "COMBO" and len(spec) > 1 and isinstance(spec[1], dict):
        options = spec[1].get("options")
        return options if isinstance(options, list) else None
    return None


def preflight_graph(graph, info):
    validate_links(graph)
    errors, models = [], []
    for node_id, node in graph.items():
        schema = info.get(node["class_type"])
        if not isinstance(schema, dict):
            errors.append(f"Missing node {node['class_type']} ({node_id}).")
            continue
        required = schema.get("input", {}).get("required", {})
        declared = {**required, **schema.get("input", {}).get("optional", {})}
        for name in required:
            if name not in node["inputs"]:
                errors.append(f"{node_id}.{name}: required input missing.")
        for name, value in node["inputs"].items():
            if linked(value):
                upstream = info.get(graph[value[0]]["class_type"], {})
                outputs = upstream.get("output", [])
                if value[1] >= len(outputs):
                    errors.append(f"{node_id}.{name}: unavailable upstream output.")
                continue
            if isinstance(value, str) and value.endswith((".safetensors", ".ckpt", ".pth")):
                spec = declared.get(name)
                choices = combo_options(spec)
                if choices is None or value not in choices:
                    errors.append(f"{node_id}.{name}: required model is not listed by ComfyUI: {value}")
                models.append(value)
    if errors:
        raise ValueError("Preflight failed before upload/queue:\n" + "\n".join(errors))
    return {"classes": sorted({node["class_type"] for node in graph.values()}), "model_filenames": sorted(set(models)),
            "scope": "node/input/model availability only; no model loaded and no inference qualified"}


class ComfyClient:
    def __init__(self, base, timeout=30):
        self.base = checked_url(base)
        self.timeout = timeout
        parsed = urllib.parse.urlsplit(self.base)
        handlers = [NoRedirect()]
        if parsed.hostname in ("localhost", "127.0.0.1", "::1"):
            handlers.append(urllib.request.ProxyHandler({}))
        self.opener = urllib.request.build_opener(*handlers)
        token = os.environ.get("GENOBI_COMFY_BEARER")
        self.headers = {"Authorization": f"Bearer {token}"} if token else {}

    def request(self, route, data=None, content_type=None):
        headers = dict(self.headers)
        if content_type:
            headers["Content-Type"] = content_type
        req = urllib.request.Request(self.base + route, data=data, headers=headers)
        try:
            with self.opener.open(req, timeout=self.timeout) as response:
                raw = response.read(32 * 1024 * 1024 + 1)
        except urllib.error.HTTPError as error:
            raise ResponseError(error.code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise RuntimeError("No confirmed ComfyUI response; do not repeat an uncertain submission.") from None
        if len(raw) > 32 * 1024 * 1024:
            raise RuntimeError("ComfyUI response exceeded the bounded JSON limit.")
        try:
            result = json.loads(raw)
        except (ValueError, UnicodeError):
            raise RuntimeError("ComfyUI returned unreadable JSON.") from None
        if not isinstance(result, dict):
            raise RuntimeError("ComfyUI returned an unexpected JSON shape.")
        return result

    def info(self):
        return self.request("/object_info")

    def stats(self):
        return self.request("/system_stats")

    def upload(self, path, request_id, role, expected_sha256):
        path = Path(path)
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != expected_sha256:
            raise ValueError("Frozen upload bytes changed after preflight; nothing was queued.")
        filename = f"{role}{path.suffix.lower()}"
        boundary = "genobi" + uuid.uuid4().hex
        parts = []
        for key, value in (("type", "input"), ("subfolder", f"genobi-experiments/{request_id}"), ("overwrite", "false")):
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode())
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{filename}\"\r\nContent-Type: {content_type}\r\n\r\n".encode())
        parts.extend((raw, f"\r\n--{boundary}--\r\n".encode()))
        result = remote_file(self.request("/upload/image", b"".join(parts), f"multipart/form-data; boundary={boundary}"), "input")
        # Never accept a response naming another experiment's upload.
        if result["subfolder"] != f"genobi-experiments/{request_id}":
            raise ValueError("ComfyUI did not preserve the isolated upload directory.")
        return result["subfolder"] + "/" + result["filename"]

    def submit(self, graph, request_id):
        payload = {"prompt": graph, "client_id": request_id, "prompt_id": request_id,
                   "extra_data": {"genobi_candidate_request": request_id}}
        return self.request("/prompt", json.dumps(payload, allow_nan=False).encode(), "application/json")

    def queue(self):
        return self.request("/queue")

    def history(self, prompt_id):
        return self.request("/history/" + urllib.parse.quote(prompt_id, safe=""))

    def download(self, descriptor, output):
        descriptor = remote_file(descriptor, "output")
        request = urllib.request.Request(self.base + "/view?" + urllib.parse.urlencode(descriptor), headers=self.headers)
        output = Path(output)
        if output.exists():
            raise ValueError("Output already exists; refusing to overwrite evidence.")
        temporary = output.parent / (".download-" + uuid.uuid4().hex)
        try:
            with self.opener.open(request, timeout=self.timeout) as response, temporary.open("xb") as handle:
                os.chmod(temporary, 0o600)
                size = 0
                while chunk := response.read(1024 * 1024):
                    size += len(chunk)
                    if size > 1024 * 1024 * 1024:
                        raise RuntimeError("Output exceeds the 1 GiB download limit.")
                    handle.write(chunk)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, output)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        return size
