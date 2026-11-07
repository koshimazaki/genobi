---
tags: [agents, mcp, backend]
summary: Live runtime, local service and paired-browser checks before applicable agent operations, separate from the offline catalogue.
---

# Check an agent operation

`genobi_diagnose` (CLI `genobi diagnose`) takes a full `tool` name and intended
`input`, and returns `supported`, `ready`, `reason` and `next`. It reads the
connected server's `/api/capabilities`, not the plugin's offline feature map.
A missing/legacy manifest or unknown feature stays unknown: diagnostics say so,
and the pre-execution check lets the call through to the server's own guards
rather than refuse an operation an older server still runs. Only a known
`supported: false` or a failed readiness check refuses before execution. A hosted paired runner does not supply canonical local
project/media access or browser rendering.

```json
{
  "tool": "genobi_world",
  "input": {
    "action": "command",
    "session": "<paired World session>",
    "command": { "op": "recipe" }
  }
}
```

CLI and MCP automatically apply these checks at their common execution
boundaries before invoking registered runtime-dependent operations. They cover:

- Project reads/commands and World recipe handoffs: runtime support; existing
  server ownership/revision guards still decide the request.
- World commands: local support, pairing and a recently responding tab. Result
  and download reads remain available independently of command readiness.
- Voice transcription: runtime support and local voice setup. The transcript
  is returned for review; checking or transcribing never executes its words.
- Local media writes: runtime support and ffmpeg availability. Probe still
  reports its own source/ffprobe checks; audio analysis retains its own status.
- Project media staging/operations and browser exports, when supplied by the
  corresponding implementation PRs: their advertised runtime features are
  required. Explicit export diagnostics inspect a linked target, exact source/revision
  and listed format. Execution leaves these checks with the export server,
  which first checks replay. An existing export request UUID can recover its original result
  after the tab closes; the server still validates exact replay.

An unmapped tool reports null support/readiness with its existing schema/status
requirements. Offline models, skills and pure JSON scene/Scroll transforms keep
working without a studio; this check does not claim universal execution parity.
No new blanket request deadline, retry, provider fallback or paid call is added.
Status is fresh for each operation, and server mutation guards remain decisive
if the tab, installation, project or source changes after the check.

Local regression checks cover unknown/hosted manifests, absent voice/ffmpeg,
missing/stale/foreign World sessions, export source/format changes and recovery,
plus CLI/MCP refusing an operation before its write. Physical microphone,
GPU/provider qualification, headless exports and the broader #14 hosted planner
remain separate work.
