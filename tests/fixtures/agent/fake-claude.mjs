#!/usr/bin/env node
// Stands in for `claude -p --output-format stream-json` in tests. It reads the
// prompt on stdin and prints stream-JSON; it calls nothing and needs no login.
// Words in the prompt choose the run: "hang" waits to be stopped, "spend"
// meets a paid refusal, "fail" ends in an error, "ticket" reports the
// ticket path its brief carries, "echo" reports the prompt it read and the
// studio context in its brief, "grant" reports the grant its Genobi MCP
// server holds (from its MCP config), for a test to act as that server, and
// "quote {json}" asks the studio for a quote of that run as its Genobi MCP
// server would: the agent's mark and the session's grant from its MCP config.
// "say: <words>" ends the turn with those words as its result.
// With `--input-format stream-json` (the studio's headless start) each stdin
// line is one user turn, answered in order with its own result; it exits when
// stdin closes, as Claude Code does.
/* global process, setInterval, fetch */
const streaming =
  process.argv[process.argv.indexOf("--input-format") + 1] === "stream-json";
const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const say = (text) =>
  out({ type: "assistant", message: { content: [{ type: "text", text }] } });

out({
  type: "system",
  subtype: "init",
  cwd: process.cwd(),
  tools: ["mcp__genobi__genobi_status"],
  mcp_servers: [
    { name: "genobi", status: "connected" },
    { name: "browser", status: "failed" },
  ],
});
out({ type: "rate_limit_event", note: "ignored" });
process.stdout.write("not json at all\n");

async function turn(prompt) {
  if (prompt.includes("ticket")) {
    const brief = process.argv.find((a) => a.includes("/api/agent/ticket/"));
    say(`ticket ${brief?.match(/\/api\/agent\/ticket\/[A-Za-z0-9_-]+/)?.[0]}`);
  }
  if (prompt.includes("grant")) {
    const { readFile } = await import("node:fs/promises");
    const file = process.argv[process.argv.indexOf("--mcp-config") + 1];
    const config = JSON.parse(await readFile(file, "utf8"));
    say(`grant ${config.mcpServers.genobi.env.GENOBI_AGENT_RUN}`);
  }
  if (prompt.includes("echo")) {
    say(`prompt ${prompt}`);
    const brief = process.argv.find((a) => a.includes("genobi-context")) ?? "";
    const json = brief.match(/```json genobi-context\n(.*)\n```/)?.[1];
    const context = json ? JSON.parse(json) : undefined;
    say(
      context
        ? `context picks=${context.picks.map((p) => p.id).join(",")} settings=${context.settings?.model ?? "none"}${context.settings?.sourceId ? ` source=${context.settings.sourceId}` : ""}${context.note ? ` note=${context.note}` : ""}`
        : "context none",
    );
  }
  const quoted = prompt.match(/quote (\{.*\})/);
  if (quoted) {
    const { readFile } = await import("node:fs/promises");
    const file = process.argv[process.argv.indexOf("--mcp-config") + 1];
    const { env } = JSON.parse(await readFile(file, "utf8")).mcpServers.genobi;
    const marks = {
      "X-Genobi-Agent-Session": "1",
      ...(prompt.includes("no-grant")
        ? {}
        : { "X-Genobi-Agent-Run": env.GENOBI_AGENT_RUN }),
    };
    const health = await fetch(`${env.GENOBI_URL}/api/health`, {
      headers: marks,
    });
    const cookie = health.headers.get("set-cookie").split(";")[0];
    // "upload <file>": the clip an upscale quote names as SOURCE.
    let body = quoted[1];
    const upload = prompt.match(/upload (\S+)/);
    if (upload) {
      const sent = await fetch(
        `${env.GENOBI_URL}/api/uploads?filename=clip.mp4`,
        {
          method: "POST",
          headers: { ...marks, cookie, "Content-Type": "video/mp4" },
          body: await readFile(upload[1]),
        },
      );
      body = body.replace("SOURCE", (await sent.json()).source.id);
    }
    // "parts": a split upscale's plan (genobi_upscale_parts_plan) instead.
    const parts = prompt.includes(" parts");
    const response = await fetch(
      `${env.GENOBI_URL}/api/${parts ? "upscale-parts" : "quotes"}`,
      {
        method: "POST",
        headers: { ...marks, cookie, "Content-Type": "application/json" },
        body,
      },
    );
    const answer = await response.json();
    say(
      `${parts ? "planned" : "quoted"} ${response.status} ${(parts ? answer.set?.id : answer.quote?.id) ?? answer.code}`,
    );
    // "self-confirm": the agent tries to confirm its own set; refused.
    if (parts && answer.set && prompt.includes("self-confirm")) {
      const self = await fetch(
        `${env.GENOBI_URL}/api/upscale-parts/${answer.set.id}/confirm`,
        {
          method: "POST",
          headers: { ...marks, cookie, "Quote-Id": answer.set.quoteId },
        },
      );
      say(`self-confirm ${self.status} ${(await self.json()).code}`);
    }
  }
  if (prompt.includes("stubborn")) {
    // A child in the runner's process group that ignores SIGTERM, as an MCP
    // server might; only the group's SIGKILL ends it.
    const { spawn } = await import("node:child_process");
    const child = spawn(
      process.execPath,
      [
        "-e",
        "process.on('SIGTERM', () => {}); process.stdout.write('ready'); setInterval(() => {}, 1000);",
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    // Report the child only once its SIGTERM handler is in place.
    await new Promise((resolve) => child.stdout.once("data", resolve));
    child.stdout.destroy();
    child.unref();
    say(`child ${child.pid}`);
  }
  if (prompt.includes("hang")) {
    say(`pid ${process.pid}`);
    setInterval(() => {}, 1000);
  } else {
    say("Checking the studio.");
    out({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "t1", name: "mcp__genobi__genobi_status" },
        ],
      },
    });
    out({
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "t1", content: "{}" }],
      },
    });
    if (prompt.includes("spend"))
      out({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              tool_use_id: "t2",
              is_error: true,
              content: [
                {
                  type: "text",
                  text: "An agent cannot spend. (agent_cannot_spend)",
                },
              ],
            },
          ],
        },
      });
    out(
      prompt.includes("fail")
        ? { type: "result", subtype: "error_during_execution", is_error: true }
        : {
            type: "result",
            subtype: "success",
            is_error: false,
            result:
              prompt.match(/say: (.*)/)?.[1] ??
              "The studio is up.\n\nNothing was spent.",
          },
    );
  }
}

if (streaming) {
  const { createInterface } = await import("node:readline");
  for await (const line of createInterface({ input: process.stdin })) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type === "user") await turn(String(event.message?.content));
  }
} else {
  let prompt = "";
  for await (const chunk of process.stdin) prompt += chunk;
  await turn(prompt);
}
