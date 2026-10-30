// The agent-session watcher (scripts/watch-agent-session.mjs): a scripted
// session read through a fake studio, never a real one. Nothing here starts a
// session, calls a provider or spends.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_LINES_MAX } from "../shared/agent-session-events";
import {
  LINES_MAX,
  clean,
  logName,
  mergeLines,
  newRecord,
  renderLog,
  type SessionRead,
} from "../scripts/lib/agent-log.mjs";
import { ReadError, watch } from "../scripts/lib/agent-watch.mjs";

const SESSION = "5d1b7a52-0c3e-4f7a-9b61-2a8e4c7d9f10";
const COOKIE = "0b6f4d1e-8a2c-4e9b-b7d3-6c1f2a9e5d84";
const QUOTE = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";
const SAMPLE = "docs/hermes-runs/2026-10-24-claude-watcher-example.md";
const NOTE =
  "Example only: produced by tests/watch-agent-session.test.ts from a scripted fake studio. No agent ran and nothing was spent.";

/** Line n of the scripted run, unique so each can be found exactly once. */
const line = (n: number) => {
  const id = String(n).padStart(2, "0");
  if (n === 3) return `Line ${id}: read the project\x1b[0m at revision 3.`;
  if (n === 9)
    return `Line ${id}: saved a frame to /Users/someone/genobi/frame.png.`;
  return `Line ${id}: step ${id} of the scripted run.`;
};
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => line(from + i));

const plan = {
  entry: "ltx-2-5-fast",
  model: "ltx-2.5",
  route: "router",
  duration: 4,
};
const approval = (status: string, jobId?: string) => ({
  quoteId: QUOTE,
  status,
  estimateUsd: 0.52,
  expiresAt: "2026-10-24T09:10:00.000Z",
  plan,
  ...(jobId ? { jobId } : {}),
});

/** The reads the fake studio answers, in order; the last repeats. */
function script(): SessionRead[] {
  const base = {
    id: SESSION,
    runner: "claude",
    prompt: "Make the anime teaser from the anime-teaser skill.",
    startedAt: "2026-10-24T09:00:00.000Z",
  };
  return [
    { ...base, status: "starting", lines: [] },
    { ...base, status: "running", lines: range(1, 5) },
    {
      ...base,
      status: "running",
      lines: range(1, 12),
      approvals: [approval("pending")],
    },
    // 33 more lines: the 40-line window slides, overlapping the last read.
    {
      ...base,
      status: "running",
      lines: range(6, 45),
      approvals: [approval("started", "job-1")],
      results: [{ quoteId: QUOTE, status: "started", jobId: "job-1" }],
    },
    {
      ...base,
      status: "done",
      lines: range(7, 46),
      approvals: [approval("started", "job-1")],
      results: [{ quoteId: QUOTE, status: "started", jobId: "job-1" }],
      summary:
        "Quoted the Breath shot\x07 for about $0.52; you approved it and it started as job-1.\nNext: approve the other three in the bubble.",
    },
  ];
}

/** Runs the watch loop over the script with a clock that sleeps instantly. */
async function scripted(states = script(), label = "watcher-example") {
  let clock = Date.parse("2026-10-24T09:00:01.000Z");
  let i = 0;
  const record = newRecord({ label, note: NOTE });
  const code = await watch({
    read: async () => states[Math.min(i++, states.length - 1)],
    record,
    intervalMs: 4000,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  });
  return { code, record, markdown: renderLog(record) };
}

const CONTROL = /[\x00-\x09\x0b-\x1f\x7f]/;

describe("mergeLines", () => {
  it("keeps the same window the server keeps", () => {
    expect(LINES_MAX).toBe(AGENT_LINES_MAX);
  });

  it("adds only what follows the overlap", () => {
    expect(mergeLines(["a", "b"], ["a", "b", "c"])).toEqual({
      added: ["c"],
      gap: false,
    });
    expect(mergeLines(["a", "b", "c"], ["b", "c", "d", "e"])).toEqual({
      added: ["d", "e"],
      gap: false,
    });
    expect(mergeLines(["a", "b"], ["a", "b"])).toEqual({
      added: [],
      gap: false,
    });
    expect(mergeLines([], ["a"])).toEqual({ added: ["a"], gap: false });
  });

  it("notes a possible gap when nothing overlaps", () => {
    expect(mergeLines(["a", "b"], ["x", "y"])).toEqual({
      added: ["x", "y"],
      gap: true,
    });
  });

  it("takes the fewest new lines when lines repeat", () => {
    expect(mergeLines(["a", "a"], ["a", "a", "a"])).toEqual({
      added: ["a"],
      gap: false,
    });
  });
});

describe("the run log", () => {
  it("holds every line once, in order, with the approval, the result and the summary", async () => {
    const { code, record, markdown } = await scripted();
    expect(code).toBe(0);
    expect(record.lines).toBe(46);
    expect(record.gaps).toBe(0);
    let last = -1;
    for (let n = 1; n <= 46; n++) {
      const id = `Line ${String(n).padStart(2, "0")}:`;
      const at = markdown.indexOf(id);
      expect(at, id).toBeGreaterThan(last);
      expect(markdown.indexOf(id, at + 1), id).toBe(-1);
      last = at;
    }
    expect(markdown).toContain(
      `| approval | ${QUOTE} · ltx-2-5-fast on router · about $0.52 · pending · 4 s |`,
    );
    expect(markdown).toContain(
      `${QUOTE} · ltx-2-5-fast on router · about $0.52 · started · 4 s · job job-1`,
    );
    expect(markdown).toContain(`| result | ${QUOTE} · started · job job-1 |`);
    expect(markdown).toContain("| Status | done |");
    expect(markdown).toContain("1 quoted: 1 approved, 0 declined");
    expect(markdown).toContain("about $0.52 estimated for the approved steps");
    expect(markdown).toContain("Next: approve the other three in the bubble.");
    expect(markdown).toMatch(/^---\ntags: \[agents, verification, mcp\]\n/);
  });

  it("writes no control characters, paths or cookies", async () => {
    const { markdown } = await scripted();
    expect(markdown).not.toMatch(CONTROL);
    expect(markdown).not.toContain("/Users/");
    expect(markdown).toContain("saved a frame to \\<path\\>");
    expect(markdown).not.toContain(COOKIE);
    expect(clean(`camera_session=${COOKIE}; COMFY_API_KEY=abc123`)).toBe(
      "camera_session=<redacted>; COMFY_API_KEY=<redacted>",
    );
  });

  it("is the committed example", async () => {
    const { record, markdown } = await scripted();
    expect(logName(record)).toBe(path.basename(SAMPLE));
    if (process.env.WRITE_WATCH_SAMPLE) await writeFile(SAMPLE, markdown);
    expect(await readFile(SAMPLE, "utf8")).toBe(markdown);
  });

  it("notes a gap when the window moved by 40 or more", async () => {
    const states = script();
    states.splice(3, 1, { ...states[3], status: "done", lines: range(60, 99) });
    const { record, markdown } = await scripted(states.slice(0, 4));
    expect(record.gaps).toBe(1);
    expect(markdown).toContain("lines may be missing here");
  });

  it("exits 1 when the session fails, and 0 for a waiting session whose steps all started", async () => {
    const states = script();
    states[4] = { ...states[4], status: "failed" };
    expect((await scripted(states)).code).toBe(1);
    states[4] = { ...states[4], status: "waiting" };
    expect((await scripted(states)).code).toBe(0);
    states[4] = {
      ...states[4],
      approvals: [
        { ...approval("pending"), expiresAt: "2026-10-24T08:00:00Z" },
      ],
    };
    expect((await scripted(states)).code).toBe(1);
  });

  it("gives up with 2 after three connection retries, and waits longer on a 429", async () => {
    const waits: number[] = [];
    const reads = [
      () => Promise.reject(new ReadError("Too many reads.", "rate")),
      ...Array.from(
        { length: 4 },
        () => () => Promise.reject(new ReadError("No answer.", "connection")),
      ),
    ];
    let i = 0;
    const record = newRecord({ label: "x" });
    const code = await watch({
      read: () => reads[i++](),
      record,
      intervalMs: 4000,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(code).toBe(2);
    expect(waits).toEqual([8000, 4000, 4000, 4000]);
    expect(record.outcome).toBe("could not read the session: No answer.");
  });
});

/** A fake studio on a loopback port, answering the script read by read. */
async function fakeStudio(states: SessionRead[]) {
  const seen: IncomingHttpHeaders[] = [];
  let i = 0;
  const server = createServer((request, response) => {
    seen.push(request.headers);
    response.setHeader("Content-Type", "application/json");
    if (
      request.url !== `/api/agent/sessions/${SESSION}` ||
      request.headers.cookie !== `camera_session=${COOKIE}`
    ) {
      response.statusCode = 404;
      return void response.end(
        JSON.stringify({ error: "Agent session not found." }),
      );
    }
    response.end(JSON.stringify(states[Math.min(i++, states.length - 1)]));
  });
  await new Promise<void>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve()),
  );
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/`,
    seen,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function run(args: string[], cookie = COOKIE) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) =>
      execFile(
        process.execPath,
        ["scripts/watch-agent-session.mjs", ...args],
        {
          env: { PATH: process.env.PATH ?? "", GENOBI_STUDIO_SESSION: cookie },
          timeout: 30_000,
        },
        (error, stdout, stderr) =>
          resolve({
            code: error ? Number(error.code ?? 1) : 0,
            stdout,
            stderr,
          }),
      ),
  );
}

describe("scripts/watch-agent-session.mjs", () => {
  it("reads the fake studio with the studio's header and the person's cookie, and writes the log", async () => {
    const studio = await fakeStudio(script());
    const dir = await mkdtemp(path.join(os.tmpdir(), "watch-agent-"));
    try {
      const out = path.join(dir, "log.md");
      const result = await run([
        SESSION,
        "--url",
        studio.url,
        "--out",
        out,
        "--interval",
        "1",
        "--label",
        "anime-teaser",
      ]);
      expect(result.code, result.stderr).toBe(0);
      expect(result.stdout).toContain("done");
      expect(result.stdout).not.toContain(COOKIE);
      const markdown = await readFile(out, "utf8");
      expect(markdown).not.toMatch(CONTROL);
      expect(markdown).not.toContain(COOKIE);
      for (let n = 1; n <= 46; n++)
        expect(
          markdown.split(`Line ${String(n).padStart(2, "0")}:`),
        ).toHaveLength(2);
      expect(studio.seen.length).toBe(5);
      for (const headers of studio.seen) {
        expect(headers["x-genobi-agent"]).toBe("1");
        expect(headers["x-genobi-agent-session"]).toBe("1");
        expect(headers.origin).toBeUndefined();
        expect(headers["sec-fetch-site"]).toBeUndefined();
      }
    } finally {
      await studio.close();
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it("exits 2 when the session is not the cookie's, and 64 without a cookie", async () => {
    const studio = await fakeStudio(script());
    try {
      const other = "1a2b3c4d-0000-4000-8000-000000000000";
      const missing = await run([SESSION, "--url", studio.url], other);
      expect(missing.code).toBe(2);
      expect(missing.stdout).toContain("Agent session not found.");
      expect((await run([SESSION, "--url", studio.url], "")).code).toBe(64);
      expect((await run([SESSION, "--url", "https://example.com/"])).code).toBe(
        64,
      );
    } finally {
      await studio.close();
    }
  });
});
