import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const script = fileURLToPath(
  new URL("../scripts/check-production.mjs", import.meta.url),
);
const HEAD = "abcdef1234567890123456789012345678901234";

/**
 * Exercise the real GitHub Actions script, not only its TypeScript comparator.
 * No external requests or deployment credentials are used.
 */
async function runCheck({ skipped, commits, unavailable = false }) {
  let requests = 0;
  const server = createServer((_request, response) => {
    requests++;
    if (unavailable) {
      response.writeHead(503);
      response.end("unavailable");
      return;
    }
    const commit = commits[Math.min(requests - 1, commits.length - 1)];
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify(commit === null ? { ok: true } : { ok: true, commit }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const directory = await mkdtemp(join(tmpdir(), "genobi-deploy-check-"));
  const summaryPath = join(directory, "summary.md");
  await writeFile(summaryPath, "# Deployment\n");
  let code = 0;
  let stdout;
  try {
    try {
      const result = await exec(process.execPath, [script], {
        timeout: 40_000,
        env: {
          ...process.env,
          GITHUB_SHA: HEAD,
          DEPLOY_SKIPPED: String(skipped),
          GENOBI_PRODUCTION_URL: "http://127.0.0.1:" + address.port,
          GITHUB_STEP_SUMMARY: summaryPath,
        },
      });
      stdout = result.stdout;
    } catch (error) {
      code = typeof error.code === "number" ? error.code : -1;
      stdout = error.stdout ?? "";
      if (code === -1) throw error;
    }
    return {
      code,
      stdout,
      summary: await readFile(summaryPath, "utf8"),
      requests,
    };
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

describe("production deployment identity script", () => {
  it("warns for missing credentials and a stale build", async () => {
    const result = await runCheck({ skipped: true, commits: ["1111111"] });
    expect(result.code).toBe(0);
    expect(result.requests).toBe(1);
    expect(result.stdout).toContain(
      "::warning title=Production was not deployed::",
    );
    expect(result.summary).toContain(
      "::warning title=Production was not deployed::",
    );
  });

  it("rejects an unversioned HTTP 200 build", async () => {
    const result = await runCheck({ skipped: true, commits: [null] });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("an unversioned build");
  });

  it("warns when health fails and deployment was skipped", async () => {
    const result = await runCheck({
      skipped: true,
      commits: [],
      unavailable: true,
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(
      "::warning title=Production identity unavailable::",
    );
  });

  it("accepts a stamped build without retrying", async () => {
    const result = await runCheck({ skipped: false, commits: ["abcdef1"] });
    expect(result.code).toBe(0);
    expect(result.requests).toBe(1);
    expect(result.stdout).toContain("serves this commit");
  });

  it("retries a valid health response naming the old build", async () => {
    const result = await runCheck({
      skipped: false,
      commits: ["1111111", "abcdef1"],
    });
    expect(result.code).toBe(0);
    expect(result.requests).toBe(2);
    expect(result.stdout).toContain("serves this commit");
  }, 15_000);

  it("keeps checkout and Node available without credentials", async () => {
    const ci = await readFile(
      fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)),
      "utf8",
    );
    const deployment = ci.split("\n  deploy:\n")[1];
    expect(deployment).toBeTruthy();
    const checkout = deployment.match(
      /- uses: actions\/checkout@[^\n]+(?:\n\s+if:[^\n]+)?/,
    )?.[0];
    const setup = deployment.match(
      /- uses: actions\/setup-node@[^\n]+(?:\n\s+if:[^\n]+)?/,
    )?.[0];
    expect(checkout).toBeTruthy();
    expect(setup).toBeTruthy();
    expect(checkout).not.toContain("if:");
    expect(setup).not.toContain("if:");
    expect(deployment).toContain(
      "if: always() && steps.creds.outputs.present != ''",
    );
  });
});
