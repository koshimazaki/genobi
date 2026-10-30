---
tags: [agents, studio, architecture]
summary: Optional operational tool history, its evidence boundaries, and independent bubble controls.
---

# Settings and activity

The header's **Settings** button opens the former key dialogue. Comfy/BFL
connections and workflow location remain there, alongside agent guidance and
**Activity & display**. No new provider credential is stored by this change.

Both optional checkboxes default to off:

- **Save tool activity history** retains at most 200 operational events. Turning
  it off clears this optional history and drops late tool completions while off.
- **Open the Genobi bubble for session updates** controls automatic opening.
  The Genobi mark can still open it manually. Closing it does not stop work or
  disable logging. An approval waiting for the person remains indicated on the
  launcher, even when automatic opening is disabled.

Generation jobs, quote receipts, costs, replay protection, and explicitly saved
project memory remain independent. This switch does not erase those records or
turn off the existing aggregate count-only generation statistics. Nothing here
adds prompts or visitor tracking to `observability/`.

## What is recorded

Events contain a local event ID, time, fixed tool name, phase, source, and an
actual backend when available. They never copy tool arguments, prompt text,
credentials, provider job IDs, local file paths or raw harness transcripts.
A tool request succeeding does not mean its generated video is finished:
`generation-submit` is separate from the browser-observed `generation` status.

| Path                                                                     | Evidence                                                                                                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registered MCP tools, from Hermes, Claude Code, Codex or another harness | The MCP wrapper records start and return/error, including pure JSON tools. A linked project associates subsequent events with its owner. Explicit `copyId` overrides that association. |
| Direct local API / voice-routed tools                                    | Server boundaries record generation submission, quoting, chains, project commands/take handoffs, media/audio operations, transcription/setup and agent-session start.                  |
| Browser-local production                                                 | Director commands/revisions, world-builder take export, 3D playblast saving, Scrolls-to-Director, Dual Swords frame/video export and voice transcription report their outcomes.        |
| Local or hosted generation                                               | The UI follows actual job statuses. Completed takes supply the backend; no backend is guessed from the selected model family.                                                          |
| Tools outside Genobi                                                     | No claim of visibility. Shell commands, arbitrary external Comfy actions and another application's tools are not captured unless they pass through Genobi.                             |

The UI distinguishes **server observed**, **MCP reported** and **browser reported**.
Client reports are not proof that a provider ran. A server backend label comes
from an owned/scoped job's stored take. Jobs and takes remain the authoritative
source for models, workflows and generation receipts.

Local history is private to the owning studio session and stored separately
under the local data directory. A linked external harness can append to its
project owner's opted-in history; it cannot use the activity read route to read
that owner's other work. Marked agent requests cannot change the preference.
Hosted studios have no activity API: opted-in browser-local events stay in that
browser. Server-side job and take records remain intact on both adapters.

A logging failure never retries a generation or turns a successful tool result
into a failed generation. The UI or MCP response reports missing history.
An interrupted request stays unknown; it must not be treated as safe to repeat.

## Agent setup and authentication

Setup covers model preference, agent, execution location, intended use and
optional voice independently. It warns when no ready model matches the chosen
combination, such as commercial-only plus local-only. It never substitutes
cloud for local without the person's choice.

Setup ends by starting one agent: the summary's **Save & set up** (or **Save &
start Genobi** without voice) starts the chosen, configured local Hermes or
Claude runner as a Genobi session, which uses that agent model and may incur
its inference cost. Its brief does not authorize downloads, installation,
credential changes or paid generation. When the harness cannot start (not
found, not signed in, or Codex, which the studio cannot run yet) the summary
shows why, with **Sign in** in the same place, and nothing starts. See
[agent sessions](agent-setup.md).

Hermes authenticates in its own environment using `hermes model`
([official authentication guide](https://hermes-agent.nousresearch.com/docs/integrations/nous-portal)); its Genobi
profile must then be configured. The Settings connection check reports runner
configuration, not verified authentication. A real session is needed to prove
the provider connection. [Runner pairing](runner-pairing.md) lets an explicitly
connected local studio receive hosted prompts and spawn its configured runner.
The hosted bubble receives bounded session progress, including tool-use lines
the existing runner reader supplies. Optional tool history remains separate;
pairing does not synchronize all local history or project memory to the cloud.

## Verification

Fixture tests cover all 72 combinations of model preference, agent, execution
route and voice intent through save/reopen and static rendering. Other tests
cover owner isolation, opt-out and late events, restart persistence, bounded
history, redaction, route attribution, MCP failure without replay, incompatible
setup choices and matching-runner handoff. These do not prove live provider
authentication, actual voice installation or microphone transcription.

Before release, run the interactive setup and key-dialog checks, exercise voice
install/cancel/retry on a supported machine, test real transcription, and verify
one local and one cloud generation through the studio and a linked external
harness. Inspect a real event history and then opt out; no later tool event
should appear. Verify this on the candidate build, not an older running checkout.
