import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentConfig } from "../server/agent-config";
import { setupRoles } from "../scripts/lib/hermes-role-profiles";

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((p) => rm(p, { recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-roles-"));
  temporary.push(root);
  const env = {
    HOME: root,
    GENOBI_AGENT_HERMES_MODEL: "deepseek/deepseek-v4.1-flash",
    GENOBI_AGENT_HERMES_PROVIDER: "nous",
  };
  const config = await agentConfig(env);
  const mcpServer = path.join(root, "server.mjs");
  await writeFile(mcpServer, "// fixture");
  config.mcpServer = mcpServer;
  const run = vi.fn(async () => {});
  return {
    root,
    options: {
      config,
      studio: "http://127.0.0.1:4317",
      roles: ["creative", "developer"] as const,
      run,
      env,
    },
  };
}

describe("Hermes role setup preflight", () => {
  it("rejects a closed route before creating profiles or invoking Hermes", async () => {
    const { options } = await fixture();
    options.config.hermesClosed = true;
    await expect(setupRoles(options)).rejects.toThrow(/open route/);
    expect(options.run).not.toHaveBeenCalled();
  });

  it("requires an explicit model and a local studio before any write", async () => {
    const { options } = await fixture();
    await expect(
      setupRoles({ ...options, studio: "https://example.com" }),
    ).rejects.toThrow(/loopback/);
    options.config.hermesModel = undefined;
    await expect(setupRoles(options)).rejects.toThrow(/model and provider/);
    expect(options.run).not.toHaveBeenCalled();
  });

  it("checks both targets before installing either and preserves an existing role", async () => {
    const { root, options } = await fixture();
    const existing = path.join(root, ".hermes/profiles/hermes-developer");
    await mkdir(existing, { recursive: true });
    await writeFile(path.join(existing, "SOUL.md"), "Owner's instructions");
    await expect(setupRoles(options)).rejects.toThrow(/already exists/);
    expect(options.run).not.toHaveBeenCalled();
    expect(await readFile(path.join(existing, "SOUL.md"), "utf8")).toBe(
      "Owner's instructions",
    );
  });

  it("cannot reconfigure an unrelated profile", async () => {
    const { root, options } = await fixture();
    const home = path.join(root, ".hermes/profiles/hermes-creative");
    await mkdir(home, { recursive: true });
    await writeFile(
      path.join(home, "genobi-profile.json"),
      '{"owner":"other"}',
    );
    await writeFile(
      path.join(home, "distribution.yaml"),
      "name: hermes-creative\n",
    );
    await expect(
      setupRoles({ ...options, configureOnly: true }),
    ).rejects.toThrow(/not a configured Genobi role/);
    expect(options.run).not.toHaveBeenCalled();
  });
});
