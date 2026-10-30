"""Check the role profiles' CLI tool resolution the way Hermes resolves it.

Run with Hermes' own Python (it needs PyYAML and, for the native step,
`hermes_cli.tools_config`):

    ~/.hermes/hermes-agent/venv/bin/python \
        scripts/check-hermes-profile-toolsets.py

Two ways a profile silently over-exposes tools, both fixed here and pinned so
they cannot come back:

1. Resolution key. `cli.py` resolves the CLI platform with
   `_get_platform_tools(CLI_CONFIG, "cli")`, which reads
   `config["platform_toolsets"]["cli"]`. A top-level `toolsets:` list is only a
   legacy `kanban` fallback, so the saved list was ignored and every profile
   started with the broad platform default (computer_use, delegation, cronjob,
   ...). The shape check below rejects a top-level `toolsets:` key.
2. MCP names. `cli_init_mixin.py` validates a `--toolsets` entry against
   `CLI_CONFIG["mcp_servers"]` keys, and `_merge_mcp_servers` matches a list
   entry against the enabled servers, so a server must be named as configured:
   `genobi`, `studio_browser`; `mcp-genobi` is "Unknown toolsets" and the
   server is dropped. The shape check rejects any `mcp-` prefixed entry.

The native step then calls the real resolver with the profile's own list and
asserts the resolved set is exactly the intended narrow set.
"""

import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parent.parent
PROFILES = {
    # role -> expected resolved toolsets (raw names; the two MCP servers are
    # passed through by name when the profile configures them).
    "hermes-developer": ["terminal", "file", "skills", "memory", "todo"],
    "hermes-creative": ["file", "skills", "memory", "todo"],
}
MCP_SERVERS = ["genobi", "studio_browser"]
# The broad defaults a top-level `toolsets:` key used to leave on.
FORBIDDEN = {"computer_use", "delegation", "cronjob"}

failures: list[str] = []


def load(role: str) -> dict:
    return yaml.safe_load((REPO / "profiles" / role / "config.yaml").read_text())


def check_shape(role: str, config: dict) -> list:
    if "toolsets" in config:
        failures.append(f"{role}: has a top-level `toolsets:` key; use `platform_toolsets.cli`")
    platforms = config.get("platform_toolsets") or {}
    if not isinstance(platforms, dict):
        failures.append(f"{role}: `platform_toolsets` must be a mapping of platform -> list")
        return []
    names = platforms.get("cli")
    if not isinstance(names, list) or not names:
        failures.append(f"{role}: `platform_toolsets.cli` must be a non-empty list")
        return []
    prefixed = [n for n in names if isinstance(n, str) and n.startswith("mcp-")]
    if prefixed:
        failures.append(
            f"{role}: MCP servers must be raw configured names, not {prefixed}"
        )
    wanted = set(PROFILES[role]) | set(MCP_SERVERS)
    if set(names) != wanted:
        failures.append(f"{role}: expected exactly {sorted(wanted)}")
    return [str(n) for n in names]


def check_native(role: str, config: dict, expected: list) -> str:
    agent_root = Path.home() / ".hermes/hermes-agent"
    if not (agent_root / "hermes_cli/tools_config.py").exists():
        return "SKIP (no ~/.hermes/hermes-agent checkout)"
    sys.path.insert(0, str(agent_root))
    try:
        from hermes_cli.tools_config import _get_platform_tools
    except Exception as error:  # pragma: no cover - environment-dependent
        return f"SKIP (import failed: {error.__class__.__name__}: {error})"
    # The profile's own config, plus the servers the installer writes, so the
    # passthrough names resolve. include_default_mcp_servers=False mirrors the
    # per-platform summary Hermes shows.
    probe = {
        **config,
        "mcp_servers": {name: {"enabled": True} for name in MCP_SERVERS},
    }
    resolved = _get_platform_tools(probe, "cli", include_default_mcp_servers=False)
    wanted = set(expected) | set(MCP_SERVERS)
    missing = wanted - resolved
    extra = resolved - wanted
    forbidden = resolved & FORBIDDEN
    if missing:
        failures.append(f"{role}: native resolution is missing {sorted(missing)}")
    if forbidden:
        failures.append(f"{role}: native resolution still exposes {sorted(forbidden)}")
    if extra:
        failures.append(f"{role}: native resolution also enabled {sorted(extra)}")
    return f"OK ({len(resolved)} toolsets)"


ok = True
for role, expected in PROFILES.items():
    config = load(role)
    names = check_shape(role, config)
    print(f"{role}: platform_toolsets.cli = {names}")
    native = check_native(role, config, expected)
    print(f"{role}: native resolution -> {native}")

if failures:
    ok = False
    print("\nFAIL:")
    for failure in failures:
        print(f"  - {failure}")
else:
    print("\nPASS: profile shapes match; native resolver results reported above")
sys.exit(0 if ok else 1)
