import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentConfig } from "../../server/agent-config";
import {
  applyProfile,
  profileEnv,
  profileSettings,
  type HermesRun,
} from "../../server/agent-hermes-profile";
import { assertOpenProfile } from "../../server/agent-hermes-pins";
import { assertOpenRoute } from "../../server/agent-hermes-probe";

export const ROLES = ["creative", "developer"] as const;
export type Role = (typeof ROLES)[number];

/** Install only named role homes; never clone credentials or the default profile. */
export async function setupRoles(options: {
  config: AgentConfig;
  studio: string;
  roles: readonly Role[];
  run: HermesRun;
  env: NodeJS.ProcessEnv;
  configureOnly?: boolean;
}) {
  const { config, studio, roles, run, env, configureOnly } = options;
  if (!roles.length || roles.some((role) => !ROLES.includes(role)))
    throw new Error("Choose creative or developer.");
  if (!config.hermesHome || !path.isAbsolute(config.hermesHome))
    throw new Error("Set an absolute GENOBI_AGENT_HERMES_ROOT or HOME.");
  if (config.hermesInvalid)
    throw new Error("Set a valid Hermes model and provider.");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(studio))
    throw new Error("GENOBI_URL must be a loopback HTTP studio origin.");
  const origin = new URL(studio).origin;
  // Validate before installing either profile or executing any Hermes command.
  const settings = profileSettings(config, origin);
  await readFile(settings.mcpServer);
  const root = path.dirname(path.dirname(config.hermesHome));
  const repo = path.dirname(path.dirname(config.plugin));
  const targets = roles.map((role) => ({
    role,
    name: `hermes-${role}`,
    home: path.join(root, "profiles", `hermes-${role}`),
    source: path.join(repo, "profiles", `hermes-${role}`),
  }));
  // Preflight every target before a partial two-profile install is possible.
  for (const target of targets) {
    const entry = await lstat(target.home).catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (configureOnly) {
      if (!entry?.isDirectory() || entry.isSymbolicLink())
        throw new Error(`${target.name} must be an existing role directory.`);
      const marker = JSON.parse(
        await readFile(path.join(target.home, "genobi-profile.json"), "utf8"),
      );
      const manifest = await readFile(
        path.join(target.home, "distribution.yaml"),
        "utf8",
      );
      if (
        marker.owner !== "genobi" ||
        !manifest.includes(`name: ${target.name}\n`)
      )
        throw new Error(`${target.name} is not a configured Genobi role.`);
    } else if (entry) {
      throw new Error(
        `${target.name} already exists. Use Hermes profile update for role text, or --configure for tools/model/port.`,
      );
    }
    await readFile(path.join(target.source, "distribution.yaml"));
  }
  for (const target of targets) {
    if (!configureOnly)
      await run(["profile", "install", target.source, "--yes"], {
        ...profileEnv(root, env),
      });
    await applyProfile(target.home, settings, run, env, true);
    await assertOpenProfile(target.home);
    await assertOpenRoute(run.probe, profileEnv(target.home, env), {
      model: settings.model,
      provider: settings.provider,
    });
  }
  return targets;
}
