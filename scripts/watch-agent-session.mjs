// Records one agent session (a project prompt run by Claude Code or Hermes)
// as a Markdown run log for the wiki. The studio keeps only a session's last
// 40 progress lines and logs nothing (docs/agent-sessions.md), so this polls
// GET /api/agent/sessions/:id, keeps every line once and in order, and writes
// the log after each change. It only reads: it starts, stops, approves and
// spends nothing, and every request carries the agent mark, which can only
// take spending away. Node 22, standard library only.
//
//   GENOBI_STUDIO_SESSION=<camera_session cookie> \
//     node scripts/watch-agent-session.mjs <sessionId> [--label anime-teaser]
//       [--url http://127.0.0.1:4317] [--out docs/hermes-runs/<file>.md]
//       [--interval 4] [--note "..."]
//
// Exit codes: 0 done, 1 failed/stopped/interrupted (or waiting with a step
// left unstarted), 2 the session could not be read, 64 a usage error, 130
// stopped with Ctrl-C (the log is still written).
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  clean,
  finish,
  logName,
  newRecord,
  renderLog,
} from "./lib/agent-log.mjs";
import { ReadError, describe, watch } from "./lib/agent-watch.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const UUID = /^[0-9a-f-]{36}$/;
const DEFAULT_URL = "http://127.0.0.1:4317";
/**
 * Seconds between reads. Session reads share the `poll` bucket (120 a
 * minute per studio session, shared/limits.ts) with the studio's own polling
 * of the same session: the bubble every 1.5 s and each unfinished job every
 * 4 s. Four shots in flight plus the bubble use 100 a minute, so the default
 * leaves room; a 429 doubles the wait (up to 30 s) rather than failing.
 */
const INTERVAL_DEFAULT = 4;
const INTERVAL_MIN = 1;

const USAGE = `Usage: GENOBI_STUDIO_SESSION=<cookie> node scripts/watch-agent-session.mjs <sessionId>
  [--label anime-teaser] [--url ${DEFAULT_URL}] [--out docs/hermes-runs/<file>.md]
  [--interval ${INTERVAL_DEFAULT}] [--note "<one line for the log>"]

GENOBI_STUDIO_SESSION is the value of the studio's camera_session cookie in
the browser that started the session (DevTools, Application, Cookies): the
studio shows a session only to the studio session that owns it. The session
id is in the studio's request to /api/agent/sessions (DevTools, Network).`;

function usage(message) {
  if (message) console.error(message);
  console.error(USAGE);
  process.exit(64);
}

/** The local studio only, as the MCP server requires (mcp/api.ts). */
function studioUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return usage(`--url is not a URL.`);
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/"
  )
    usage(`--url must be the local studio, for example ${DEFAULT_URL}`);
  return url;
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: "string" },
      out: { type: "string" },
      interval: { type: "string" },
      label: { type: "string" },
      note: { type: "string" },
      latest: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
} catch (error) {
  usage(error.message);
}
const { values, positionals } = parsed;
if (values.help) usage();
if (values.latest)
  usage(
    "--latest is not available: the studio has no route that lists agent sessions. Pass the session id.",
  );
const [sessionId] = positionals;
if (!sessionId || positionals.length > 1 || !UUID.test(sessionId))
  usage("Pass one agent session id (a UUID).");
const cookie = process.env.GENOBI_STUDIO_SESSION?.trim();
if (!cookie || !UUID.test(cookie))
  usage("Set GENOBI_STUDIO_SESSION to the studio's camera_session cookie.");
const base = studioUrl(values.url ?? process.env.GENOBI_URL ?? DEFAULT_URL);
const interval = Number(values.interval ?? INTERVAL_DEFAULT);
if (!Number.isFinite(interval) || interval < INTERVAL_MIN || interval > 600)
  usage(`--interval is seconds, from ${INTERVAL_MIN} to 600.`);
const label = values.label ?? "session";
if (!/^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/.test(label))
  usage("--label is up to 60 letters, digits, spaces or hyphens.");

async function read() {
  let response;
  try {
    response = await fetch(new URL(`/api/agent/sessions/${sessionId}`, base), {
      headers: {
        Accept: "application/json",
        // The studio's header on every agent route (agent-routes.ts).
        "X-Genobi-Agent": "1",
        // The agent mark: this request can never spend.
        "X-Genobi-Agent-Session": "1",
        Cookie: `camera_session=${cookie}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new ReadError(
      `The studio at ${base.origin} did not answer.`,
      "connection",
    );
  }
  let body;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  if (response.status === 429) throw new ReadError("Too many reads.", "rate");
  if (response.status >= 500)
    throw new ReadError(`The studio answered ${response.status}.`, "server");
  if (!response.ok) {
    const said = clean(
      body?.error ?? `The studio answered ${response.status}.`,
      300,
    );
    throw new ReadError(
      response.status === 404
        ? `${said} Check the session id and that GENOBI_STUDIO_SESSION is the cookie of the studio that started it.`
        : said,
      "http",
    );
  }
  if (
    !body ||
    typeof body.id !== "string" ||
    typeof body.status !== "string" ||
    !Array.isArray(body.lines)
  )
    throw new ReadError("The studio's answer was not a session.", "server");
  return body;
}

const record = newRecord({ label, note: values.note });
let out;
async function target() {
  if (values.out) return path.resolve(values.out);
  const dir = path.join(root, "docs", "hermes-runs");
  const name = logName(record).replace(/\.md$/, "");
  for (let n = 1; ; n++) {
    const file = path.join(dir, `${name}${n === 1 ? "" : `-${n}`}.md`);
    try {
      await access(file);
    } catch {
      return file;
    }
  }
}

/** Written whole on every change, through a temporary file and a rename. */
async function save() {
  if (!record.sessionId) return;
  out ??= await target();
  await mkdir(path.dirname(out), { recursive: true });
  const temporary = `${out}.${process.pid}.tmp`;
  await writeFile(temporary, renderLog(record));
  await rename(temporary, out);
}

const clock = (iso) => /T(\d\d:\d\d:\d\d)/.exec(iso)?.[1] ?? "";
process.once("SIGINT", async () => {
  finish(record, "the watcher was stopped", new Date().toISOString());
  await save();
  console.log("Stopped. The log is written.");
  process.exit(130);
});

const code = await watch({
  read,
  record,
  intervalMs: interval * 1000,
  onChange: async (current, events) => {
    await save();
    const at = events.at(-1)?.at ?? new Date().toISOString();
    console.log(`${clock(at)} ${describe(events, current)}`);
  },
});
if (out) console.log(`Log: ${path.relative(process.cwd(), out)}`);
process.exit(code);
