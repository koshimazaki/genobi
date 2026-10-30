"""Load the Genobi plugin the way Hermes does and call the read-only tools.

Start the studio first (`npm run dev`), then run this with Hermes' own Python
(in a default install, `~/.hermes/hermes-agent/venv/bin/python`):

    python -I scripts/check-hermes-plugin.py plugins/genobi http://127.0.0.1:4317

It uses Hermes' Agent Plugins v1 loader (skills, manifest and `mcp.json`) and
its MCP client to start the bundled server, then sends `genobi_status`,
`genobi_models` and `genobi_jobs` directly. No model is called and nothing is
paid: the calls are sent by this script, not chosen in a chat. The loader and
client are Hermes internals, checked against Hermes Agent v0.21.4.
"""

import asyncio
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path.home() / ".hermes/hermes-agent"))
from hermes_cli.agent_plugins import load_agent_plugin  # noqa: E402
from tools.mcp_tool_discovery import _connect_server  # noqa: E402

plugin_root = Path(sys.argv[1])
studio = sys.argv[2] if len(sys.argv) > 2 else "http://127.0.0.1:4317"
package = load_agent_plugin(plugin_root, Path(tempfile.mkdtemp()))
print("plugin:", package.name, package.version)
print("skills:", [s.name for s in package.skills])
print(
    "diagnostics:",
    [(d.scope, d.message) for d in package.diagnostics] if package.diagnostics else "none",
)
config = dict(package.mcp_servers["genobi"])
config["env"] = {**config["env"], "GENOBI_URL": studio}
print("mcp server:", config["command"], Path(config["args"][0]).name, "GENOBI_URL=" + studio)

CALLS = [
    ("genobi_status", {}),
    ("genobi_models", {"status": "ready"}),
    ("genobi_jobs", {"limit": 5}),
]


async def main():
    server = await _connect_server("genobi", config)
    try:
        print("tools:", [t.name for t in server._tools])
        for name, args in CALLS:
            result = await server.session.call_tool(name, args)
            value = json.loads(result.content[0].text)
            if name == "genobi_models":
                value = [
                    f"{m['id']} ({m['route']}, {'open' if m['open'] else 'closed'})"
                    for m in value
                ]
            error = getattr(result, "is_error", None)
            print(f"{name}({json.dumps(args)}) isError={error}:", json.dumps(value))
            if error:
                sys.exit(1)
    finally:
        await server.shutdown()


asyncio.run(main())
