// Start the studio first (`npm run dev`). Launches the built plugin server over
// stdio exactly as an agent would and calls every read-only tool once
// (genobi_provenance needs finished jobs, so tests/mcp-provenance.test.ts covers it).
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["plugins/genobi/server/genobi-mcp.mjs"],
  env: {
    PATH: process.env.PATH ?? "",
    GENOBI_URL: process.env.GENOBI_URL ?? "http://127.0.0.1:4317",
  },
});
const client = new Client({ name: "check-mcp", version: "0" });
await client.connect(transport);
try {
  const { tools } = await client.listTools();
  const report = { tools: tools.map((t) => t.name) };
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, `${name}: ${result.content?.[0]?.text}`);
    return JSON.parse(result.content[0].text);
  };
  report.status = await call("genobi_status");
  report.models = (await call("genobi_models", { status: "ready" })).map(
    (m) => `${m.id} (${m.route})`,
  );
  report.jobs = (await call("genobi_jobs", { limit: 5 })).length;
  report.budget = await call("genobi_budget", { runs: 3, usd: 1.42 });
  report.projects = (await call("genobi_projects")).length;
  // Reads this machine: sizes and model names only, never a path.
  report.machine = (await call("genobi_machine")).summary;
  // Reads the plugin's registry file only.
  report.registry = (await call("genobi_registry", { tag: "sound" })).entries
    .map((e) => e.name)
    .join(", ");
  // Pure planning: reads no studio state and spends nothing.
  for (const template of ["product-video", "character-piece", "audio-visual"]) {
    const plan = await call("genobi_template_plan", { template });
    assert.equal(plan.shots.length, 3, `${template}: three shots`);
    report[template] =
      `${plan.shots.length} shots, ${plan.seconds} s, about $${plan.estimateUsd.toFixed(2)}`;
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}
