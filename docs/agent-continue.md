---
tags: [agents, studio, backend]
summary: Voice's Continue this conversation and Start new conversation, how a finished Hermes run is resumed by its own session id, and why a finished Claude Code run cannot be.
---

# Continue or start a new conversation

Issue #58. Voice is the main way to talk to the agent, so a second note must be
able to go on with the same conversation even after the agent's run has
finished. Before this change a note sent after a one-shot Hermes run ended
quietly started a new session.

## What the person sees

Voice's **To** picker offers two agent choices, named for what they do:

| Choice                                     | What the next note does                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Continue · Hermes · _first words_**      | Goes on with that conversation: its next message while it runs, or a resumed run once it has finished. |
| **Start new conversation**                 | Always starts a clean context through the usual setup/start flow.                                      |
| **Can't continue · Claude Code run ended** | Shown for a selected run that finished and cannot resume. Sending holds the words and says why.        |
| **Agent · new conversation**               | Nothing can be continued here, so the note starts one.                                                 |

Continue is the default when there is something to continue: the selected
conversation, the running session shown in the deck, or a finished one this
project can resume. The label names the runner and the conversation's first
words. After a note lands, the conversation it reached becomes the selection, so
the next note continues it. The deck's **Speak to agent** selects its
conversation and sets Continue.

The choice lives in page memory only. Neither the conversation nor the
runner's session id is written to browser storage.

## What happens on the server

A Continue start is `POST /api/agent/sessions` with `continues: <earlier Genobi
session id>` (`shared/agent-session.ts`). The server (`server/agent-continue.ts`)
starts a **new** Genobi session and a new runner process, linked by
`continues`, carrying the earlier visible exchange. It is refused with
`409 agent_continue_unavailable` unless the earlier session:

- belongs to the same studio session, and has finished;
- ran on the runner that is set up now;
- named the same project copy (`copyId`) as this start;
- recorded a runner conversation id (below); and
- has not already been continued by a newer run, which would fork it.

A start with `continues` is headless and local: `mode: "terminal"`, `setup`
and the hosted relay refuse it. Capacity, ownership, the project link, the
tool limits and the spending guard are the ordinary start's. Paid steps still
need a quote and the person's approval.

### Hermes

`hermes chat --format stream-json` reports `session_id` in its `system/init`
event and again in `result`, where it is the newer id after mid-run
compression (`hermes_cli/stream_json.py`, v0.21.4).
`server/agent-hermes-stream.ts` keeps it once the run has answered something,
so a start that failed before any turn has nothing to resume. Ids that could
name another conversation are never kept: `latest`, anything starting with a
dash, and anything outside letters, digits and `_.:-`.

A Continue run adds `--resume <id> --no-restore-cwd` to the usual command
(`server/agent-hermes.ts`). It resumes that exact conversation from the
`genobi` profile's own session store, in the new session's scratch folder. It
never uses `--continue` or `--resume latest`. The id stays in the server's
memory for the session, never in the view, a log line or project memory. A
server restart forgets it, so Continue then refuses and the words are held.

Checked against Hermes Agent v0.21.4 on 5 November 2026 (`hermes chat --help`
and its source): `--resume` and `--no-restore-cwd` are accepted together with
`--query-file - --oneshot --format stream-json --source tool --ignore-rules`,
and `init` then reports the resumed id. In a scratch `HERMES_HOME` with no
credentials, so no model call was made, `init` carried the resumed id and the
run ended at `credentials or agent init failed`. A real resumed conversation
with a signed-in model has not been run.

### Claude Code

Genobi runs Claude Code with `--no-session-persistence`, so a finished run
leaves no conversation to resume. While its run is live (until 5 minutes
after its last reply) a note goes to it as its next turn. Once it has ended,
Continue is refused: the picker says **Can't continue**, the words are held, and
the person chooses **Start new conversation**. Genobi does not pretend the
earlier process is still there.

## Guarantees kept from #28 and #29

- **One delivery.** A running conversation gets the note once through
  `POST /api/agent/sessions/:id/messages`. If that is refused because the run
  just ended (`agent_session_ended`, a definite refusal), the session is read
  again and resumed when it can be; otherwise the words are held.
- **No silent redirect.** Continue never becomes a clean start, another
  session, a prompt field or another project. A project change during lookup
  holds the note.
- **No automatic retry.** A failed or uncertain start or message keeps the
  transcript in the panel. **Send to selected destination** sends it again only
  when the person presses it.
- **Start new stays explicit.** It never reuses a running session. If another
  run is still going, the start is refused (`agent_busy`), the deck shows that
  run and the panel says to stop it first. Nothing is stopped for the person.

## Tests

- `tests/agent-continue.test.ts`: reading the id (kept after a turn, newest
  after compression, never for a failed start or an unsafe id), every refusal,
  and a fake Hermes resumed with the same id from a new scratch folder; a
  finished Claude Code run refused with nothing started.
- `tests/voice-continue.test.ts`: Continue resumes the same conversation after
  its run ended (selected, shown, or ended mid-send), Start new always spawns,
  and failures hold the transcript without a retry.
- `tests/voice-conversation-picker.test.tsx`: the picker's labels and choices.
