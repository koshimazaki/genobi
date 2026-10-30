---
tags: [agents, studio, backend]
summary: Confirm before spending - an agent session's quote appears in the person's studio with its plan, price and payer; Approve runs it once through the quoted submission in the person's session, Decline voids it, and an expired or changed quote cannot be approved.
---

# Confirm before spending

Issue #23, "Confirm before spending": the agent shows its plan and the quote
before any paid step, and nothing paid runs without the person's click.

## What already existed

Before this box, an [agent session](agent-sessions.md) could not spend at all:

- `genobi_submit` is not among the session's tools (`GENOBI_TOOLS` in
  `server/agent-runner.ts`) and is passed to `--disallowedTools`; Hermes'
  profile filters it out the same way.
- Every paid route in `PAID_ROUTES` answers an agent's request
  `403 agent_cannot_spend`, whether it comes from the agent's browser (a ticket
  session) or its MCP server (`X-Genobi-Agent-Session: 1`).
- `genobi_quote` priced a step with every check a submission runs, and
  answered a one-use `quoteId`, valid for ten minutes (`shared/quote.ts`). A
  submission with `Quote-Id` must match the quoted settings hash and recipe,
  including a workflow entry's run location and template, and spends the quote
  in the same step that reserves the run.
- The stream reader turned a paid refusal into "A paid step needs your
  approval in the studio." and the session ended as **Waiting for you**.

What was missing: the quote stayed in the agent's words. The person had no
plan, price or button for it, and the agent's quote lived in the agent's own
studio session, where the person could not spend it.

## What this adds

1. **The quote reaches the session.** Each session gets a grant, 24
   hexadecimal characters: Hermes' existing run token
   (`GENOBI_AGENT_RUN`, which its profile already passes to the MCP servers),
   or for Claude Code a fresh token in the Genobi MCP server's environment
   only. The MCP server sends it as `X-Genobi-Agent-Run` beside the agent
   mark (`mcp/api.ts`). When `POST /api/quotes` answers an agent-marked request
   carrying the grant of a running session, the quote becomes a step on that
   session (`noteAgentQuote`, `server/agent-approval-service.ts`). The grant
   grants nothing: the request is still an agent's and cannot spend.
2. **The person sees the plan and the price.** `AgentSession.approvals`
   (`shared/agent-approval.ts`) lists up to six steps, each with the entry and
   its menu line, the generator and model, the agent's prompt (280
   characters), duration, ratio, resolution and Draft, the route and a
   workflow's run location and template, the estimate, the expiry and whose
   key pays (`owner`, the key saved in the Keychain; `server`, the studio's
   demo key; `local`, nobody, on this machine's ComfyUI). An upscale's plan is
   built from what the upscale sends and the server's own record of its
   source (review checklist: trusted metadata only): the source's label and
   measured size and duration, the factor and the size it makes after the
   pixel cap, Precise or Creative, and the prompt the run sends (the trimmed
   `upscalePrompt`), never the request's unused duration, ratio or
   resolution. An upscale whose source the server cannot read is not
   offered. The bubble opens on
   a waiting step (`src/agent/AgentApprovals.tsx`) with **Approve $x.xx** and
   **Decline**, and a countdown to the quote's expiry. Past six steps the
   oldest settled one is dropped, then the oldest still waiting; a step being
   sent or whose outcome is uncertain is never dropped, and when only those
   remain the new quote is not offered and the session says why
   (`approvals_full`). A session that finishes
   with a step waiting ends as **Waiting for you**.
3. **Approve waits for the settings.** While a run location or template is
   being saved, a Recreate is restoring, or a value is being checked, the
   expected-settings headers could still name the last confirmed value, so
   Approve is disabled with the reason, and `approveStep` refuses before
   sending anything: the same hold as Generate and chain approval
   (`settingsHold`, #61).
4. **Approve runs it once.** `POST
/api/agent/sessions/:id/approvals/:quote/approve`, from the session's
   owner, with a new `Idempotency-Key` per click and the run location and
   template the studio shows (`Genobi-Run-Location`, `Genobi-Workflow`):
   - the step leaves `pending` before anything is awaited, so a second click
     finds it closed (`409 approval_closed`);
   - an expired quote is voided, saved, and refused (`409 quote_expired`);
   - the unspent, unexpired quote moves from the agent's session to the
     person's, and the ordinary `JobService.submit` runs with its `Quote-Id`
     and the approval's terms (`ApprovalTerms`). Inside `JobService.reserve`,
     under the same key lock that chooses the credential (`keys.reserving`,
     `runCredential`), the payer that credential means is compared with the
     one the person approved; a key saved or removed meanwhile is refused
     (`409 payer_changed`) before anything is reserved. An upscale reads its
     quoted source, for this one submission only, from the session that held
     it when the agent quoted it, recorded on the step (`sourceSession`): the
     person's for a take they picked ([the read scope](agent-context.md)),
     or the agent's own for a clip it uploaded, which stays the agent's and
     which the person's own session still cannot name. Then the usual checks:
     validation, route, budget, the settings expectation, the quote's
     settings hash and recipe, and the reservation persisted before anything
     is sent. The quote record already names its route (Comfy Router, BFL or
     a workflow), and `requireQuote` now compares it, with the workflow and
     run location, for every quoted submission, not only approvals: a key
     saved since the quote that moves the run to another provider, even with
     the same owner paying, is refused (`409 route_changed`). A run location or template changed since the quote is refused
     there (`409 quote_mismatch` or `settings_changed`), and nothing runs;
   - a definite refusal (4xx) closes the step as **refused**, with the
     studio's words; anything else closes it as **uncertain**. Neither is
     retried, by the server or the studio. The step keeps the run's id from
     the moment it is reserved, before the provider is called
     (`ApprovalTerms.onReserved`), or, failing that, from a read-only lookup
     of the request key, so an uncertain run (for example one the provider
     accepted before the final save failed) still reaches the gallery.

   When the answer is lost or is an error, the studio never sends Approve
   again: it reads the session back (`recoverStep`,
   `src/agent/approval-recovery.ts`) with backoff (1, 2, 4, 8, then every 15
   seconds) until the step has left `submitting`, for as long as the panel is
   open, and a failed read is simply tried again. Each step has its own
   recovery (`Recoveries`): a second lost Approve runs beside the first and
   never aborts it, and every run they find is handed to the gallery. The
   recoveries belong to the studio, not the bubble (`recoverApproval`):
   tucking the bubble away does not stop one, and reopening it shows the
   check still running and resumes any step that still reads `submitting`.
   Every step that started a run or became uncertain is also kept, by quote
   id, in the session's `results` (up to a hundred, gone with the session),
   apart from the six visible steps: a step that later quotes push out of the
   list still tells recovery where its run is. A step that is gone with no
   result is not taken as settled; recovery keeps reading.
   The studio keeps the latest session each recovery read back
   (`recoveredSession`), and a reopened bubble shows a step as that read
   left it, so a step already sent never offers Approve again. A recovered
   `started` or `uncertain` step with a run id is handed to the gallery.

   The run belongs to the person's session: it appears in their gallery,
   joins its polling and counts against their budget. The job the approve
   answer returned goes straight into the list; a run known only from a
   recovery read is handed over by its own read (`handOffApprovedJob`,
   `src/agent/approved-jobs.ts`), kept pending for the page's lifetime and
   never dropped: it is read again with capped backoff, and at once when the
   browser comes back online, after a history load or a session read that
   succeeded, or when the person presses **Refresh history**. After about
   five minutes of failed reads the bubble says "A paid run could not be
   shown yet." with that button.

5. **Decline runs nothing.** `POST …/approvals/:quote/decline` closes the step
   and removes the quote, so nobody can spend it. The removal is saved before
   the route answers, so a failed save is an error answer, not a crash.

The approve route is in `PAID_ROUTES`, so an agent's own request to it is
refused before it reaches the session, and only the session's owner can find
the session at all.

## A split upscale is one step

An agent's `genobi_upscale_parts_plan` (a clip longer than one upscale, cut
into parts) becomes one step, not one per part: the combined price, the
plan's upscale line with "in N parts joined with its sound", and the step's
`setId`. Approve confirms the set (`confirmSet`) in the agent's session,
where its cuts are, on the payer the person saw: each part goes through the
job service's reservation under its own key and is sent once; a definite
refusal closes the step as `refused`, anything else as `uncertain`, never
retried. The server then reads the set on its own until it is joined, again
after a restart. Decline
voids the set's quotes and marks it declined, so nothing of it can run. The
agent's own confirm stays in `PAID_ROUTES`. See [upscaling](upscaling.md).

## Limits

- A quote is approved in the person's session, under their settings. The
  agent's studio session takes the person's run location and templates when
  it starts ([Picks and context](agent-context.md)), so its workflow quotes
  match; if the person changes either afterwards, the approval is refused and
  the agent quotes again.
- Steps live in memory with the session (twenty sessions kept). A server
  restart forgets them; the quotes expire on their own.
- A quote the agent takes from a terminal (`hermes -p genobi`, no session
  grant) is not shown in the studio.
- Chains the agent creates stay in its own session; their stage approvals are
  not moved to the person.

## Verification

Local, 22 October 2026, against fakes; no model and no provider were called:

- `tests/agent-approvals.test.ts`: the fake runner quotes as the MCP server
  would (mark and grant from its MCP config). The step appears with its plan
  and price and the session ends **Waiting for you**, with no submission; a
  quote without the grant makes no step; Approve submits exactly once, with
  the quote spent by that run in the person's history, and a second Approve or
  a Decline is `approval_closed`; Decline voids the quote and submits nothing;
  an expired quote reads as expired and is refused; another person's session,
  a missing request key and a malformed quote id are refused; a template
  swapped after a workflow quote is refused with `quote_mismatch` and the
  workflow client runs nothing.
- `tests/agent-approvals-steps.test.ts`: the steps alone: one submission, an
  unconfirmed run marked uncertain and never retried, a refusal's words kept,
  expiry and a changed payer or spent quote sending nothing, the cap.
- `tests/agent-spend.test.ts`: the approve route refuses the agent's ticket
  session and a marked request. `tests/agent-request.test.ts`: the grant is in
  the Genobi MCP server's environment only. `tests/mcp.test.ts`: the MCP
  server sends a well-formed grant with its mark, and never without it.

- `tests/agent-approvals-recovery.test.tsx`: Approve held while restoring,
  saving or checking (no request, button disabled with the reason); recovery
  reading back through a failed read and two `submitting` answers with
  1, 2 and 4 second waits, and stopping when the panel goes; the returned job
  inserted without a read, and the handoff surviving one failed read; an
  upscale's plan from the measured source, with no video fields, and none
  without the server's record.
- `tests/agent-approvals.test.ts` also quotes an upscale of an uploaded clip
  through the fake runner: the plan has the stored source's size and
  duration, not the request's 5 s.
- `tests/agent-approvals-locks.test.ts`: a Keychain write held open while
  the person approves gives `payer_changed` and no submission on either
  provider; an approved upscale of the agent's uploaded clip submits once
  while the person's own session still cannot quote that clip; a failed save
  while voiding reaches the caller. `tests/agent-approvals-steps.test.ts`
  also covers Decline and expiry awaiting the save, and the payer rule;
  `tests/agent-approvals-recovery.test.tsx` two recoveries side by side,
  each job reaching the gallery, and one that keeps reading with no view open
  until its job reaches the gallery; the steps test keeps a submitting step
  past a seventh quote and refuses a quote when every step is in flight.
  A final save that fails after the provider accepted leaves the step
  `uncertain` with its reserved run, readable in the person's gallery, and a
  second Approve sends nothing; a recovery that ends while no view is open
  is what a later view shows, settled and without Approve.
- Route and handoff (third review): an owner's BFL quote, then an owner's
  Comfy key, gives `route_changed` and no submission; a handoff whose reads
  fail past the old twelve tries keeps going, shows as stuck with Refresh
  history, and lands when reads work again, at once on a retry.
- `tests/agent-approvals-picked.test.ts`: an upscale of a take the person
  picked is quoted through the read scope and, approved, submits once with
  that clip (it was a 404 when Approve read the agent's session); an
  unpicked take of the person's is never quoted, so no step is offered. The
  agent's uploaded clip still works (`tests/agent-approvals-locks.test.ts`).
- `tests/agent-approvals-results.test.ts`: Approve succeeds, its answer is
  lost, six more quotes push the started step out of the list, and recovery
  still hands its job to the gallery through `results` (before, it read the
  missing step as settled and the run never arrived).
- `tests/agent-approvals-view.test.tsx`: the bubble's step with its plan
  line, prompt, price, payer and countdown, Approve and Decline only while it
  is open, and each closed state's words.
- `node scripts/check-voice-overlay.mjs` against a dev server (fixture routes,
  `scripts/lib/voice-approval-checks.mjs`): a session started from Voice
  reads a quoted step; the bubble shows its plan, price and payer; Approve
  sends one request with a request key and the step reads started; Decline
  sends one request; a refused Approve shows the studio's words and is not
  retried; the page makes no other write.

Not yet run: a real agent quoting through the studio, or a person approving a
real run; nothing paid was run.
