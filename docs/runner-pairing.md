---
tags: [agents, cloudflare, architecture]
summary: Explicit outbound pairing between a hosted Genobi studio and its owner's local agent runner.
---

# Hosted runner pairing

Cloudflare queues agent prompts; the paired local Genobi server launches its
existing configured Hermes or Claude runner. No inbound port, tunnel, public
local API, arbitrary shell command or cloud copy of the model login is added.
The local server must remain running. This does not install Hermes.

First-run hosted setup offers this same pairing flow for Hermes, Claude Code
and Codex, with local setup instructions in Connect and the summary. The local
studio runs Hermes or Claude Code; Codex remains an external plugin choice.
Choosing an agent does not start a session or install it. If another agent is
paired, setup explains which one and asks you to configure the chosen one
locally before starting.

## Connect and use

1. Run the candidate Genobi local server, authenticate your runner outside
   Genobi, and configure its Genobi profile. Check readiness in Settings.
2. In hosted **Settings → Pair hosted and local Genobi**, create a pairing code.
3. Paste that complete private code into the same section of local Settings.
   Confirm that the named hosted studio may start the configured runner. Agent
   inference may use your subscription or incur model costs.
4. Back in hosted Settings, wait for the runner to appear online. Enter a prompt
   and press **Start paired runner**, or use **Start Genobi** in the bubble.
5. Open the Genobi bubble for session progress and Stop. **Open local session**
   opens that session on the original machine, where assets and paid approvals
   remain available. The same local browser profile must still own its cookie.

The local server pairs only with studios it trusts: the HTTPS origins in
`GENOBI_HOSTED_ORIGINS` (comma-separated), else the project's own
`https://genobi.pages.dev` (and the previous `https://fluxstudio.pages.dev`), plus
those Pages projects' deployment addresses (`<deployment>.genobi.pages.dev`). Any other `pages.dev` or `workers.dev`
site is refused, so a look-alike deployment cannot pair a local runner through
a pasted code. A self-hosted studio, a Worker's `workers.dev` address or a
custom domain must be added to `GENOBI_HOSTED_ORIGINS` on the local machine
first. Redirects are refused. Local handoff links are limited to HTTP loopback
origins; a link opened on another computer points to that computer, not the runner.

Hosted project copies, picked takes and source IDs are rejected rather than
mistaken for local assets. Prompt-only requests and portable settings work;
project/asset synchronization and hosted paid approvals are outside this slice.
Microphone transcription still runs in the local studio.

## Trust and storage

- Pairing codes contain 256 random bits, expire after ten minutes, and are
  consumed atomically by one claim. Treat the code as private until claimed.
- The runner creates a separate 256-bit bearer capability. D1 stores only its
  SHA-256 hash. The local data directory stores its capability and owner cookie
  identifier in `runner-pair.json`, mode `0600`, using atomic file replacement.
  It never stores the one-use code or provider credentials there.
- One hosted anonymous browser session owns one current pairing. Another session
  cannot read its runs, stop them or revoke its pairing. A marked agent cannot
  pair or start another agent. Local pairing mutations require the existing
  same-origin/loopback checks, a custom header, and explicit confirmation.
- Pairings expire after 24 hours. Relay requests and bounded session progress
  are kept for up to 24 hours, then removed in bounded existing sweep passes.
  Prompts and progress are private D1 session records, independent of optional
  operational history. They are never included in count-only observability.
- The existing runner reader supplies tool-use names and bounded progress. It
  does not expose a raw terminal stream. Local operational history, taste memory,
  files and generation credentials are not synchronized by pairing.

## Launch, Stop and failure recovery

The browser supplies a start ID. Repeating that ID with the same validated
request returns the same session; different content conflicts. Only one queued
or executing relay request can occupy a pairing. The local server additionally
enforces its existing process capacity and owner rules.

A conditional D1 update claims a queued request once. A missing delivery reply
never makes that request eligible for delivery again. Before spawning, the
connector also saves a local receipt; duplicate delivery or a process restart
cannot silently execute it again. An uncertain start must be inspected locally.
The hosted Settings prompt retains its start ID after a failed response, so
retrying the unchanged prompt can recover the existing request.

The connector polls every six seconds while idle and every three seconds
when a local session is starting, running or waiting; only changed session
updates are sent. Readiness expires after 20 seconds without a heartbeat.
The hosted relay combines its authenticated per-pair rate-limit counter and
`last_seen` update in one atomic D1 write. It still enforces 120 polls per
60-second window across isolates without another `rate_limits` write.
Unclaimed prompts older than 20 seconds are stopped before launch. A claimed
request without acknowledgement remains uncertain and offers Stop; it is not
automatically requeued. Latest owned session state is restored after page reload.

Stop is delivered on the next successful heartbeat. **Revoke runner access**
invalidates the capability, including against an already authenticated poll's
subsequent writes/claims. **Disconnect local runner** stops paired sessions and
removes the local credential; also revoke in hosted Settings. Replacing a pairing
invalidates the old capability. Connection failure, revocation and server shutdown
ask tracked local sessions to stop through the existing process-group cleanup.
Requests have a ten-second timeout; stop is not instantaneous or a guarantee
that an already dispatched provider operation can be undone.

If cookies are lost, session ownership is lost as with other Genobi records.
An operator can stop the local server and remove its `runner-pair.json` to discard
an inaccessible local pairing, then create a new code. Never copy this file into
a public repository or bundle.

## Code and verification

- `shared/runner-relay.ts`: portable request/update bounds and time constants.
- `worker/runner-store.ts`, `worker/runner-routes.ts`: D1 claims, ownership,
  replay protection, progress, stop/revoke and keyless agent control routes.
- `server/runner-connection.ts`, `server/runner-routes.ts`: outbound transport,
  durable launch receipts and existing local `AgentSessions` delegation.
- `src/components/RunnerPairing.tsx`: explicit pairing and hosted prompt controls.
- `migrations/0008_runner_relay.sql`: additive tables and one-active-run index.

Tests apply all migrations to isolated real SQLite, exercise the actual Worker
entry point without a socket, and connect the relay to an injected local agent
launcher. They cover ownership, cross-origin rejection, code expiry/racing claims,
idempotent starts, duplicate delivery, lost replies, restart, stop, revocation,
unsafe destinations and existing paid-route key requirements. These are fixtures,
not a real Hermes inference or deployed Cloudflare test.

Before release, apply migration `0008` to an isolated D1 database, run the workerd
suite, then manually pair two candidate builds and start one explicitly authorized
agent session. Check progress, local handoff, Stop, Revoke, and offline recovery.
Remote migration and deployment remain separate operator actions.
