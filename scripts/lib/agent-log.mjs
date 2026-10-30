// The run log the agent-session watcher writes (scripts/watch-agent-session.mjs):
// what one read of GET /api/agent/sessions/:id adds to the record, and the
// record as a wiki page. Pure functions; no network, files or clock of their
// own, so tests drive them with a scripted session.

/** Lines the server keeps per session (AGENT_LINES_MAX in shared/agent-session-events.ts). */
export const LINES_MAX = 40;

const RUNNERS = { claude: "Claude Code", hermes: "Hermes" };
const FAILED = new Set(["failed", "stopped", "interrupted"]);
const APPROVED = new Set(["submitting", "started", "uncertain"]);

/**
 * One line of safe text: control characters become spaces (the same class
 * the server's sanitisers strip), machine paths and anything shaped like a
 * key or a session cookie are replaced, and the result is bounded.
 */
export function clean(value, max = 2000) {
  const text = String(value ?? "")
    .replace(/[\x00-\x1f\x7f]/g, " ")
    .replace(/\bcamera_session=[^\s;]+/gi, "camera_session=<redacted>")
    .replace(/\bBearer\s+\S+/gi, "Bearer <redacted>")
    .replace(
      /\b((?:[A-Z][A-Z0-9]*_)*(?:KEY|TOKEN|SECRET|PASSWORD)|GENOBI_AGENT_RUN)=\S+/g,
      "$1=<redacted>",
    )
    .replace(
      /\b(api[-_ ]?key|access[-_ ]?token|secret|password)(\s*[:=]\s*)\S+/gi,
      "$1$2<redacted>",
    )
    .replace(/\b(?:sk|pk|rk|bfl|comfy)[-_][A-Za-z0-9_-]{12,}/gi, "<redacted>")
    .replace(/file:\/\/\S+/gi, "<path>")
    .replace(
      /(?:~|\/(?:Users|home|private|tmp|var|root|Volumes|opt|mnt|srv|etc))(?:\/[^\s"'`)\]]+)+/g,
      "<path>",
    )
    .replace(/\b[A-Za-z]:\\[^\s"'`]+/g, "<path>")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The new lines in `current`, a sliding window over the session's lines,
 * after `previous`, the window one read earlier: the longest tail of
 * `previous` that `current` starts with is the overlap. With no overlap the
 * window moved by its whole length or more between reads, so lines may be
 * missing (`gap`). The server numbers no lines, so identical lines repeated
 * across a full window can be under-counted.
 */
export function mergeLines(previous, current) {
  for (let shift = 0; shift <= previous.length; shift++) {
    const tail = previous.slice(shift);
    if (tail.length > current.length) continue;
    if (tail.every((line, i) => line === current[i]))
      return {
        added: current.slice(tail.length),
        gap:
          shift === previous.length &&
          previous.length > 0 &&
          current.length > 0,
      };
  }
  return { added: [...current], gap: previous.length > 0 };
}

/** A new, empty record for one watched session. */
export function newRecord({ label = "session", note } = {}) {
  return {
    label: clean(label, 60),
    ...(note ? { note: clean(note, 500) } : {}),
    runner: undefined,
    sessionId: undefined,
    prompt: undefined,
    startedAt: undefined,
    endedAt: undefined,
    status: undefined,
    summary: undefined,
    outcome: undefined,
    window: [],
    lines: 0,
    gaps: 0,
    approvals: {},
    results: {},
    events: [],
  };
}

const usd = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? `$${value.toFixed(2)}`
    : "unpriced";

function approvalText(a) {
  const plan = a.plan ?? {};
  const parts = [
    clean(a.quoteId, 60),
    `${clean(plan.entry ?? plan.model ?? "unknown", 60)} on ${clean(plan.route ?? "unknown route", 40)}`,
    `about ${usd(a.estimateUsd)}`,
    clean(a.status, 20),
  ];
  if (plan.duration) parts.push(`${plan.duration} s`);
  if (a.jobId) parts.push(`job ${clean(a.jobId, 60)}`);
  if (a.message) parts.push(clean(a.message, 300));
  return parts.join(" · ");
}

/**
 * Folds one read of the session into the record and returns what changed,
 * each change stamped with `at` (an ISO time).
 */
export function observe(record, session, at) {
  const events = [];
  const add = (kind, text) => {
    const event = { at, kind, text: clean(text) };
    record.events.push(event);
    events.push(event);
  };
  if (!record.sessionId) {
    record.sessionId = clean(session.id, 60);
    record.runner = clean(session.runner, 20);
    record.prompt = clean(session.prompt, 4000);
    record.startedAt = clean(session.startedAt, 40);
  }
  if (session.status !== record.status) {
    record.status = clean(session.status, 20);
    add("status", record.status);
  }
  const lines = Array.isArray(session.lines) ? session.lines.map(String) : [];
  const { added, gap } = mergeLines(record.window, lines);
  record.window = lines;
  if (gap) {
    record.gaps++;
    add(
      "gap",
      `The window moved by ${LINES_MAX} lines or more between two reads; lines may be missing here.`,
    );
  }
  for (const line of added) {
    record.lines++;
    add("line", line);
  }
  for (const a of session.approvals ?? []) {
    const id = String(a.quoteId);
    const known = record.approvals[id];
    const view = {
      status: clean(a.status, 20),
      estimateUsd: a.estimateUsd,
      jobId: a.jobId ? clean(a.jobId, 60) : undefined,
    };
    if (!known || known.status !== view.status || known.jobId !== view.jobId) {
      record.approvals[id] = view;
      add("approval", approvalText(a));
    }
  }
  for (const r of session.results ?? []) {
    const id = String(r.quoteId);
    const known = record.results[id];
    const view = {
      status: clean(r.status, 20),
      jobId: r.jobId ? clean(r.jobId, 60) : undefined,
    };
    if (!known || known.status !== view.status || known.jobId !== view.jobId) {
      record.results[id] = view;
      add(
        "result",
        `${clean(id, 60)} · ${view.status}${view.jobId ? ` · job ${view.jobId}` : " · no job id yet"}`,
      );
    }
  }
  const summary = session.summary ? clean(session.summary, 2000) : undefined;
  if (summary && summary !== record.summary) {
    record.summary = summary;
    add(
      "summary",
      summary.length > 160 ? `${summary.slice(0, 159)}…` : summary,
    );
  }
  return events;
}

/**
 * Whether the watch is over, and its exit code: 0 for `done`, 1 for
 * `failed`, `stopped` or `interrupted`. A `waiting` session (the agent ended
 * with a paid step before the person) is over once no step is pending and
 * unexpired or being sent: 0 when every step it quoted started a run, 1
 * otherwise. `starting` and `running` keep the watch going.
 */
export function settled(record, session, now) {
  if (session.status === "done") return { code: 0, outcome: "done" };
  if (FAILED.has(session.status))
    return { code: 1, outcome: clean(session.status, 20) };
  if (session.status !== "waiting") return undefined;
  const open = (session.approvals ?? []).some(
    (a) =>
      a.status === "submitting" ||
      (a.status === "pending" && Date.parse(a.expiresAt) > now),
  );
  if (open) return undefined;
  const steps = Object.values(record.approvals);
  const allStarted =
    steps.length > 0 && steps.every((a) => a.status === "started");
  return allStarted
    ? { code: 0, outcome: "waiting, every step approved and started" }
    : { code: 1, outcome: "waiting, with no step left to approve" };
}

/** Ends the record: how the watch ended and when. */
export function finish(record, outcome, at) {
  record.outcome = clean(outcome, 200);
  record.endedAt = at;
  record.events.push({ at, kind: "end", text: record.outcome });
}

/** Counts of the steps the session quoted, by how each ended. */
export function tally(record) {
  const steps = Object.values(record.approvals);
  const count = (test) => steps.filter(test).length;
  const approved = steps.filter((a) => APPROVED.has(a.status));
  const estimate = approved.reduce(
    (sum, a) => sum + (typeof a.estimateUsd === "number" ? a.estimateUsd : 0),
    0,
  );
  return {
    quoted: steps.length,
    approved: approved.length,
    declined: count((a) => a.status === "declined"),
    expired: count((a) => a.status === "expired"),
    refused: count((a) => a.status === "refused"),
    pending: count((a) => a.status === "pending"),
    estimate,
  };
}

/** Text safe in a Markdown table cell or paragraph: no link, tag or cell break. */
const escape = (text) => clean(text).replace(/[\\`*[\]()<>|]/g, "\\$&");

const time = (iso) =>
  /T(\d\d:\d\d:\d\d)/.exec(iso ?? "")?.[1] ?? clean(iso ?? "unknown", 40);
const stamp = (iso) =>
  iso
    ? `${clean(iso, 40)
        .replace("T", " ")
        .replace(/\.\d+Z$|Z$/, "")} UTC`
    : "not seen";

/** A fence longer than any run of backticks in the text. */
function fenced(text) {
  const longest = Math.max(
    2,
    ...[...text.matchAll(/`+/g)].map((m) => m[0].length),
  );
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${text}\n${fence}`;
}

/** The record's file name: `<YYYY-MM-DD>-<runner>-<label>.md`. */
export function logName(record) {
  const day = /^\d{4}-\d\d-\d\d/.exec(record.startedAt ?? "")?.[0] ?? "undated";
  const slug = (value) =>
    String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "session";
  return `${day}-${slug(record.runner)}-${slug(record.label)}.md`;
}

/** The record as a wiki page (tags from docs/tags.md). */
export function renderLog(record) {
  const runner = RUNNERS[record.runner] ?? record.runner ?? "Unknown runner";
  const t = tally(record);
  const status = record.outcome ?? record.status ?? "not read";
  const summaryLine = clean(
    `Watcher log of a ${runner} session (${record.label}): ${status}, ${record.lines} lines, ${t.approved} of ${t.quoted} quoted steps approved, ${t.declined} declined.`,
    300,
  );
  const rows = [
    ["Runner", runner],
    ["Session id", record.sessionId ?? "not read"],
    ["Template", record.label],
    ["Started", stamp(record.startedAt)],
    ["Ended", stamp(record.endedAt)],
    ["Status", status],
    [
      "Quotes",
      `${t.quoted} quoted: ${t.approved} approved, ${t.declined} declined, ${t.expired} expired, ${t.refused} refused, ${t.pending} pending`,
    ],
    [
      "Spend",
      t.approved
        ? `about $${t.estimate.toFixed(2)} estimated for the approved steps; the actual cost is not in the session's answer and arrives with each job`
        : "nothing approved",
    ],
    [
      "Lines",
      `${record.lines} recorded${record.gaps ? `, ${record.gaps} possible gap${record.gaps === 1 ? "" : "s"}` : ", no gap"}`,
    ],
  ];
  const out = [
    "---",
    "tags: [agents, verification, mcp]",
    `summary: ${JSON.stringify(summaryLine)}`,
    "---",
    "",
    `# Run log: ${escape(record.label)}, ${escape(runner)}`,
    "",
    "Written by `scripts/watch-agent-session.mjs` from the studio's",
    "`GET /api/agent/sessions/:id`, read on an interval. Times are UTC. Lines,",
    "quotes and summaries are the session's own words, with control characters,",
    "machine paths and anything shaped like a key removed. See",
    "[Hermes runs](../hermes-runs.md#run-cards-and-logs).",
    "",
  ];
  if (record.note) out.push(`> ${escape(record.note)}`, "");
  out.push("| Field | Value |", "| --- | --- |");
  for (const [field, value] of rows)
    out.push(`| ${field} | ${escape(value)} |`);
  out.push("", "## Prompt", "", fenced(record.prompt ?? "Not read."), "");
  out.push("## Timeline", "", "| Time | Kind | Text |", "| --- | --- | --- |");
  for (const event of record.events)
    out.push(`| ${time(event.at)} | ${event.kind} | ${escape(event.text)} |`);
  out.push(
    "",
    "## Final summary",
    "",
    record.summary ? fenced(record.summary) : "The session gave no summary.",
    "",
  );
  return out.join("\n");
}
