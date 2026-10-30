#!/usr/bin/env node
// Stands in for `hermes` in tests. `profile create`, `plugins enable` and
// `config set` record into `fake-config.json` in HERMES_HOME (the real ones
// write config.yaml). `chat --query-file - --format stream-json` reads the
// query on stdin and prints Hermes' stream-JSON events; it calls nothing and
// needs no sign-in. Words in the query choose the run:
// "hang" waits to be stopped, "spend" meets a paid refusal, "fail" ends in an
// error, "signin" fails as Hermes does without credentials, "ticket" reports
// the ticket path its brief carries, "config" reports what its profile's
// config.yaml lets it use, and "stubborn" starts a child in a session of its
// own that ignores SIGTERM, as Hermes' MCP SDK starts its stdio servers;
// "orphan" does the same and exits at once, so the child is reparented
// before anything can see it as this runner's.
/* global process, setInterval */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const command = process.argv.slice(2, 4).join(" ");
const home = process.env.HERMES_HOME ?? "";
const recorded = path.join(home, "fake-config.json");
const read = () => {
  try {
    return JSON.parse(readFileSync(recorded, "utf8"));
  } catch {
    return {};
  }
};
// `hermes --version`, without an install directory: the route probe skips.
if (process.argv[2] === "--version") {
  process.stdout.write("Hermes Agent (fake)\n");
  process.exit(0);
}
if (command.startsWith("profile create")) {
  mkdirSync(path.join(home, "profiles", process.argv[4]), { recursive: true });
  process.exit(0);
}
if (command === "plugins enable" || command === "config set") {
  const config = read();
  if (command === "plugins enable") config.plugins = [process.argv[4]];
  else {
    const [key, value] = process.argv.slice(4);
    let parsed = value;
    try {
      parsed = JSON.parse(value);
    } catch {
      // A plain string, as Hermes keeps it.
    }
    config[key] = parsed;
  }
  writeFileSync(recorded, JSON.stringify(config));
  process.exit(0);
}

let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
const out = (event) =>
  process.stdout.write(`${JSON.stringify({ ...event, timestamp: 1 })}\n`);
const say = (text) => out({ type: "text", text: `${text}\n\n` });
const flag = (name) => process.argv[process.argv.indexOf(name) + 1];

out({ type: "system", subtype: "init", model: flag("-m"), session_id: "s1" });
process.stdout.write("not json at all\n");

if (prompt.includes("ticket")) {
  const brief = process.env.HERMES_EPHEMERAL_SYSTEM_PROMPT ?? "";
  say(`ticket ${brief.match(/\/api\/agent\/ticket\/[A-Za-z0-9_-]+/)?.[0]}`);
}
if (prompt.includes("config")) {
  const config = read();
  const genobi = config["mcp_servers.genobi"];
  say(`plugins ${config.plugins}`);
  // A few per line: the session keeps only its last 40 short lines.
  const include = genobi.tools.include;
  for (let i = 0; i < include.length; i += 6)
    say(`include ${include.slice(i, i + 6).join(",")}`);
  say(`marked ${genobi.env.GENOBI_AGENT_SESSION}`);
  say(`toolsets ${flag("-t")}`);
  say(
    `keys ${["COMFY_API_KEY", "BFL_API_KEY"].filter((k) => k in process.env).join(",") || "none"}`,
  );
}
if (prompt.includes("stubborn") || prompt.includes("orphan")) {
  const { spawn } = await import("node:child_process");
  const child = spawn(
    process.execPath,
    [
      "-e",
      "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);",
    ],
    { stdio: ["ignore", "pipe", "ignore"], detached: true },
  );
  await new Promise((resolve) => child.stdout.once("data", resolve));
  child.stdout.destroy();
  child.unref();
  say(`child ${child.pid}`);
  if (prompt.includes("orphan")) process.exit(0);
}
if (prompt.includes("hang")) {
  say(`pid ${process.pid}`);
  setInterval(() => {}, 1000);
} else {
  out({ type: "text", text: "Checking " });
  out({ type: "text", text: "the studio." });
  out({ type: "tool_use", name: "mcp__genobi__genobi_status", input: {} });
  out({
    type: "tool_result",
    name: "mcp__genobi__genobi_status",
    output: "{}",
    duration_ms: 3,
    is_error: false,
  });
  if (prompt.includes("spend"))
    out({
      type: "tool_result",
      name: "mcp__genobi__genobi_quote",
      output: "An agent cannot spend. (agent_cannot_spend)",
      duration_ms: 3,
      is_error: true,
    });
  const failed = prompt.includes("fail") || prompt.includes("signin");
  // Hermes streams the final answer as text, then repeats it in `result`.
  if (!failed) {
    out({ type: "text", text: "The studio is up.\n\n" });
    out({ type: "text", text: "Nothing was spent." });
  }
  out({
    type: "result",
    session_id: "s1",
    exit_code: failed ? 1 : 0,
    text: failed ? "" : "The studio is up.\n\nNothing was spent.",
    tokens: { input: 1, output: 1, total: 2, cache_read: 0, cache_write: 0 },
    duration_ms: 10,
    ...(prompt.includes("signin")
      ? { error: "credentials or agent init failed" }
      : prompt.includes("fail")
        ? { error: "partial" }
        : {}),
  });
  process.exitCode = failed ? 1 : 0;
}
