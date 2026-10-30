"""Ask Hermes where the genobi profile's routes go, the way a chat would.

Run with Hermes' own Python, HERMES_HOME set to the profile:

    python -I server/agent-hermes-probe.py <hermes install dir> <provider> <model> <task>...

With the network switched off in this process, it first loads the profile's
environment with Hermes' own startup helper, as `hermes chat` does at start
(cli.py: `load_hermes_dotenv(hermes_home=get_hermes_home(),
project_env=<install>/.env)`, hermes_cli/env_loader.py: the profile's .env with
python-dotenv's `${VAR}` interpolation, .op.env, the managed overlay). Then it
asks Hermes' resolvers (checked against Hermes Agent v0.21.4):

- the main route: `hermes_cli.runtime_provider.resolve_runtime_provider`;
- each auxiliary task: `agent.auxiliary_client._resolve_task_provider_model`,
  and the runtime for its provider when that is not the main one;
- the credential pool for the provider: `hermes_cli.auth.read_credential_pool`,
  each entry's `base_url` and `inference_base_url` (what
  `PooledCredential.runtime_base_url` sends to), read without loading or
  rewriting the pool;
- the stored sign-in for an OAuth provider (`hermes_cli.auth.
  get_provider_auth_state`): its `inference_base_url` and `base_url`;
- every endpoint override set for the provider (ENDPOINT_OVERRIDES below).

It runs on a private copy of the profile (server/agent-hermes-probe-copy.ts):
Hermes' resolvers write cooldowns to auth.json, so never on the real one.

An OAuth provider's resolver refreshes an expired token over the network
(`runtime_provider.py`, `_resolve_oauth_runtime`), which this process cannot
do; then the main route is the endpoint the real chat would use after the
refresh: the first override set, else the stored sign-in, else the provider's
own. When none can be established the route stays unresolved.

It prints one JSON line: whether the profile holds a credential for the
provider, and for each route its provider, scheme, host and wire mode, or the
error's class name. Never a key, a token or a path; nothing is fetched,
refreshed or called.
"""

import json
import os
import socket
import sys
from pathlib import Path
from urllib.parse import urlsplit


def _offline(*_args, **_kwargs):
    raise OSError("the Genobi route probe runs without a network")


socket.socket.connect = _offline
socket.socket.connect_ex = _offline
socket.create_connection = _offline
socket.getaddrinfo = _offline

install, provider, model, tasks = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
sys.path.insert(0, install)
# The provider as Hermes keys its sign-ins, pools and overrides: aliases and
# case resolved once (providers.py, `normalize_provider`), set after loading.
canonical = provider.strip().lower()


def endpoint(url):
    parts = urlsplit(str(url or "").strip())
    return {"scheme": parts.scheme, "host": parts.hostname or ""}


def runtime_route(name):
    from hermes_cli.runtime_provider import resolve_runtime_provider

    runtime = resolve_runtime_provider(requested=name, target_model=model)
    return {
        "provider": str(runtime.get("provider") or ""),
        "api_mode": str(runtime.get("api_mode") or ""),
        **endpoint(runtime.get("base_url")),
    }


def attempt(fn, *args):
    try:
        return {"resolved": True, **fn(*args)}
    except Exception as error:  # noqa: BLE001 - reported, never raised
        return {"resolved": False, "error": type(error).__name__}


def signed_in():
    from hermes_cli.auth import get_auth_status, read_credential_pool
    from hermes_cli.providers import resolve_provider_full

    if read_credential_pool(canonical):
        return True
    status = get_auth_status(canonical) or {}
    if status.get("logged_in") or status.get("configured"):
        return True
    pdef = resolve_provider_full(canonical)
    import os

    return any(os.environ.get(var, "").strip() for var in getattr(pdef, "api_key_env_vars", ()) or ())


def pool_routes():
    from hermes_cli.auth import read_credential_pool

    routes = []
    for entry in read_credential_pool(canonical):
        if not isinstance(entry, dict):
            continue
        for key in ("inference_base_url", "base_url"):
            if entry.get(key):
                routes.append({"resolved": True, "provider": canonical, **endpoint(entry[key])})
    return routes


def stored_urls():
    from hermes_cli.auth import get_provider_auth_state

    state = get_provider_auth_state(canonical) or {}
    return [state[key] for key in ("inference_base_url", "base_url") if state.get(key)]


# The environment overrides Hermes honours for an OAuth provider's endpoint,
# ahead of the stored sign-in: NOUS_INFERENCE_BASE_URL (auth_nous.py,
# `_nous_inference_env_override`, layered over the stored URL after every
# refresh); HERMES_XAI_BASE_URL, then XAI_BASE_URL (auth_xai.py);
# HERMES_QWEN_BASE_URL (auth_qwen.py); HERMES_CODEX_BASE_URL
# (credential_pool.py, `runtime_base_url`); and the provider's own
# `base_url_env_var` (providers.py, HERMES_OVERLAYS).
ENDPOINT_OVERRIDES = {
    "nous": ("NOUS_INFERENCE_BASE_URL",),
    "xai-oauth": ("HERMES_XAI_BASE_URL", "XAI_BASE_URL"),
    "qwen-oauth": ("HERMES_QWEN_BASE_URL",),
    "openai-codex": ("HERMES_CODEX_BASE_URL",),
}


def override_names():
    names = list(ENDPOINT_OVERRIDES.get(canonical, ()))
    try:
        from hermes_cli.providers import HERMES_OVERLAYS

        overlay = HERMES_OVERLAYS.get(canonical)
        extra = getattr(overlay, "base_url_env_var", "") if overlay else ""
        if extra and extra not in names:
            names.append(extra)
    except Exception:  # noqa: BLE001
        pass
    return names


def override_urls():
    """Every endpoint override set in the loaded environment, in Hermes' order."""
    urls = []
    if canonical == "nous":
        from hermes_cli.auth_nous import _nous_inference_env_override

        nous = _nous_inference_env_override()
        if nous:
            urls.append(nous)
    for name in override_names():
        value = os.environ.get(name, "").strip()
        if value and value not in urls:
            urls.append(value)
    return urls


def stored_main():
    """The main route the real chat would take after refreshing, offline: the
    first endpoint override set, else the stored sign-in, else the provider's
    own endpoint. Raises when none can be established."""
    from hermes_cli.providers import resolve_provider_full
    from hermes_cli.runtime_provider import _OAUTH_RUNTIME_PROVIDERS

    if canonical not in _OAUTH_RUNTIME_PROVIDERS:
        raise LookupError("not an OAuth provider")
    urls = override_urls() or stored_urls() or [getattr(resolve_provider_full(canonical), "base_url", "")]
    if not urls[0] or not endpoint(urls[0])["host"]:
        raise LookupError("no endpoint can be established")
    return {"provider": canonical, "api_mode": "", "stored": True, **endpoint(urls[0])}


def task_route(task):
    from agent.auxiliary_client import _resolve_task_provider_model

    name, task_model, base_url, _key, api_mode = _resolve_task_provider_model(task)
    if base_url:
        return {"provider": str(name or ""), "api_mode": str(api_mode or ""), **endpoint(base_url)}
    if name and str(name).lower() not in ("auto", "main", canonical.lower()):
        return runtime_route(name)
    return {"provider": canonical, "api_mode": "", "scheme": "", "host": "", "inherits": True}


def write_expanded_config():
    """The profile's config.yaml as Hermes reads it, every `${VAR}` expanded
    against the loaded environment (config.py, `read_raw_config_readonly` and
    `_expand_env_vars`), written into this private copy for Genobi's
    config.yaml check to read before the copy is deleted. Never printed."""
    import yaml
    from hermes_cli.config import _expand_env_vars, read_raw_config_readonly

    expanded = _expand_env_vars(read_raw_config_readonly() or {})
    target = Path(os.environ["HERMES_HOME"]) / "genobi-expanded.yaml"
    target.write_text(yaml.safe_dump(expanded, sort_keys=False), encoding="utf-8")
    os.chmod(target, 0o600)


def failover_routes():
    """Where each auxiliary task goes when the pinned backend gives no client,
    through Hermes' real client resolution (auxiliary_client.py,
    `_resolve_call_client`). Vision retries with provider `auto` whenever its
    base URL is empty (`resolve_vision_provider_client(provider="auto")`, which
    tries the main provider, then OpenRouter, Nous and DeepInfra), and a text
    task on `auto`, `openrouter` or `custom` walks the auto chain; no setting
    turns either off. So the pinned backend is made to fail here, and any
    other route that still yields a client is reported with its endpoint; one
    that is the main route's own endpoint (the auto chain starts there) is
    no failover, which Genobi's verdict decides."""
    import agent.auxiliary_client as aux

    pinned = {aux._normalize_aux_provider(provider), aux._normalize_aux_provider(canonical), "main"}

    def is_pinned(name):
        try:
            return aux._normalize_aux_provider(name) in pinned or str(name).lower() == "main"
        except Exception:  # noqa: BLE001
            return False

    reached = []

    def watch(original, name_of):
        def wrapper(*args, **kwargs):
            name = name_of(args, kwargs)
            if is_pinned(name):
                return (None, None)  # the pinned backend fails
            out = original(*args, **kwargs)
            client = out[0] if isinstance(out, tuple) and out else None
            if client is not None:
                reached.append((str(name), str(getattr(client, "base_url", "") or "")))
            return out
        return wrapper

    first = lambda args, kwargs: kwargs.get("provider", args[0] if args else "")
    patches = {
        "_get_cached_client": watch(aux._get_cached_client, first),
        "_resolve_strict_vision_backend": watch(aux._resolve_strict_vision_backend, first),
        "_vision_main_provider_client": watch(aux._vision_main_provider_client, first),
    }
    saved = {name: getattr(aux, name) for name in patches}
    routes = []
    try:
        for name, fn in patches.items():
            setattr(aux, name, fn)
        for task in tasks:
            reached.clear()
            try:
                cfg = aux._resolve_task_provider_model(task)
                aux._resolve_call_client(
                    task, provider=None, model=None, base_url=None, api_key=None,
                    resolved_provider=cfg[0] or "auto", resolved_model=cfg[1], resolved_base_url=cfg[2],
                    resolved_api_key=cfg[3], resolved_api_mode=cfg[4], main_runtime=None, async_mode=False)
            except Exception:  # noqa: BLE001 - no client anywhere: no failover
                pass
            for other, url in dict.fromkeys(reached):
                routes.append({"route": f"failover.{task}", "resolved": True, "failover": True,
                               "provider": other, **endpoint(url)})
    finally:
        for name, fn in saved.items():
            setattr(aux, name, fn)
    return routes


result = {"loaded": False, "signed_in": False, "routes": []}
try:
    from hermes_cli.env_loader import load_hermes_dotenv
    from hermes_constants import get_hermes_home

    # The copy's own home and shared sign-in store stay in force whatever the
    # profile's .env says, so nothing outside the copy is written.
    pinned_env = {name: os.environ[name] for name in ("HERMES_HOME", "HERMES_SHARED_AUTH_DIR") if name in os.environ}
    load_hermes_dotenv(hermes_home=get_hermes_home(), project_env=Path(install) / ".env")
    os.environ.update(pinned_env)
    from hermes_cli.providers import normalize_provider

    canonical = normalize_provider(provider)
    result["loaded"] = True
except Exception as error:  # noqa: BLE001
    result["load_error"] = type(error).__name__

try:
    result["signed_in"] = bool(signed_in())
except Exception:  # noqa: BLE001 - unknown counts as signed in: fail closed
    result["signed_in"] = True

main = attempt(runtime_route, provider)
if not main["resolved"] and result["signed_in"]:
    stored = attempt(stored_main)
    if stored["resolved"]:
        main = {**stored, "error": main.get("error")}
result["routes"].append({"route": "main", **main})
for task in tasks:
    result["routes"].append({"route": f"auxiliary.{task}", **attempt(task_route, task)})
try:
    for url in override_urls():
        result["routes"].append({"route": "override", "resolved": True, "provider": canonical, **endpoint(url)})
except Exception as error:  # noqa: BLE001
    result["routes"].append({"route": "override", "resolved": False, "error": type(error).__name__})
try:
    for url in stored_urls():
        result["routes"].append({"route": "sign_in", "resolved": True, "provider": canonical, **endpoint(url)})
except Exception as error:  # noqa: BLE001
    result["routes"].append({"route": "sign_in", "resolved": False, "error": type(error).__name__})
try:
    for route in pool_routes():
        result["routes"].append({"route": "credential_pool", **route})
except Exception as error:  # noqa: BLE001
    result["routes"].append({"route": "credential_pool", "resolved": False, "error": type(error).__name__})

result["routes"].extend(failover_routes())
try:
    write_expanded_config()
    result["expanded"] = True
except Exception as error:  # noqa: BLE001
    result["expanded"] = False
    result["expand_error"] = type(error).__name__

print(json.dumps(result))
