---
tags: [workflows, comfy, studio, backend]
summary: The GPU box run location, a ComfyUI on a Vast box or the lab machine reached through an SSH tunnel to loopback, with its readiness, uptime and idle reminder.
---

# GPU box run location

A **GPU box** is ComfyUI on a rented Vast instance or the owner's lab GPU
machine (the 5090), used from the local studio as one more run location beside
Local ComfyUI, Comfy Cloud, Both and Comfy Deploy (issue #103). It is a
**named local destination with a port**, not a new transport: the studio talks
plain http to `http://127.0.0.1:<port>` only, and the person's own SSH tunnel
carries the bytes to the box. That keeps the rule PR #56 set for every ComfyUI
that is not on Comfy's own https hosts. A plaintext remote address
(`http://203.0.113.9:8188`, `http://my-box.example:8188`) is still refused by
`parseWorkflowDestination`, and no ComfyUI port is ever exposed publicly.

The hosted studio has no GPU box: its choices stay Comfy Cloud and deployment.

## Set it up

1. Start ComfyUI on the box on loopback. A clean install from
   [the Vast runner](vast-runner.md) listens on 8188; the October 2026 Vast
   image runs ComfyUI on **18188** behind Caddy on 8188.
2. Open **Studio settings → Generation setup**. In the GPU box panel give the
   box a name (`vast-5090`, `lab`) and the tunnel's local port (default 8188).
   The box's ComfyUI port, `user@host` and the Vast SSH port fill in the
   tunnel command shown below them:

   ```sh
   ssh -N -p <ssh-port> -L <port>:127.0.0.1:<remote-port> <user@host>
   ```

   Blank or malformed fields stay `<placeholders>`, so the copied command never
   carries a fragment a shell would read as more. Copy it, run it in a terminal
   and leave it open.

3. Press **Use this GPU box**. The run location becomes `box`.

Only the name and local port are saved (`StoredSettings.box`). The SSH host,
user, remote port and key are never sent to the server, stored or logged: they
live in the panel's memory to build the command and are gone when it closes.

## Readiness

While the box is the run location the panel reads, for free:

- `GET /system_stats`: whether it answers, ComfyUI's version, and the first
  GPU's name and `vram_total` (`boxDevice` in `shared/comfy/gpu-box.ts`). ComfyUI's
  argv and paths are never kept.
- `GET /object_info`, through `GET /api/settings/workflows?check=local`, which
  checks the box rather than the local ComfyUI when the session runs on one.
  It reports **box ready**, or how many workflows **lack nodes** or **lack
  models**, naming node classes and slot names, never file names. Templates
  pinned to a deployment are left out.

The box's status is live telemetry, not a setting: it changes when the tunnel
comes up or the box goes idle while the settings revision stays the same, so it
has its own read, `GET /api/settings/run-location/box`, every 30 seconds while
the box is the run location (`src/box-status.ts`), laid over the settings
answer rather than sent through the revision-ordered settings lane.

The composer's run-mode line tags **GPU BOX** and warns the same way as for
Local when the box does not answer or lacks what the held template needs.

## Uptime and the idle reminder

Uptime counts from the first time this studio process saw the box answer and
starts again once it stops answering. The server reads each box a session runs
on every 30 seconds (`/system_stats` and `/queue`, `server/index.ts`), so the
count holds while the settings panel is closed; a queued or running prompt
counts as work. After `GENOBI_BOX_IDLE_MINUTES` (default 20) with no job, the
panel and the run-mode line say: _Vast bills by the hour; stop the box when
done._

It is only ever a reminder. Genobi never stops, pauses or starts a box and
never calls Vast; the person stops the instance in Vast's console.

## How a run goes

`location: "box"` resolves workflow runs to `local` with the box attached
(`WorkflowSettings.plan`), so a quote and take record
`recipe.box: { name, url }` beside `location: "local"`. The run goes to that
port alone (`GpuBoxes` in `server/gpu-boxes.ts`), never to the default local
ComfyUI, and a quote taken for one box is `409 quote_mismatch` on another port
or on Local. Every rule of the local client holds: no provider key is sent,
the graph is checked before anything is uploaded, `/prompt` is called once, and
a lost answer is `submission_unknown`, never resent. A box run is free to
Genobi; the box's provider bills its uptime. Polls return to the box through
the address in the stored handle, also after a restart.

Agents set it with `genobi_run_location` (`location: "box"`, `box: { name,
port }`); they never receive or pass an SSH host.

## The pre-submit check on every route

Before any upload or submission, Comfy Cloud, Local and the GPU box check the
fully filled graph against the target's own `/object_info`
(`preflightGraph` in `shared/comfy/preflight.ts`, issue #47): every node class,
every declared model slot, and every model file pinned in the graph without a
slot (named `NodeClass.input`). A definitely missing dependency is refused with
`workflow_unsent` and an actionable message, and nothing is sent or charged.
A loader whose choices the target does not enumerate stays unknown and does not
block. On Cloud, an unreadable catalogue leaves availability unknown and the run
goes ahead, except for FLUX 3 Klein, which needs the catalogue to choose its
loader and keeps its own refusal. Comfy deployments keep their own validator.

## Not verified here

Every behaviour above is tested against a fake ComfyUI on loopback
(`tests/gpu-box*.test.ts`, `tests/preflight-templates.test.ts`). No real Vast
instance or lab machine has been driven through the tunnel from this change.
