import { constants } from "node:fs";
import {
  link,
  lstat,
  mkdir,
  open,
  readdir,
  rename,
  unlink,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  agentPreferences,
  executionPreferences,
  modelFamilies,
  weightPreferences,
} from "../shared/licensing/selection";
import { DEFAULT_URL, studioUrl } from "./api";

export const profileName = z.string().regex(/^[a-z][a-z0-9-]{0,47}$/);
export const profileSchema = z.strictObject({
  url: z
    .string()
    .max(200)
    .default(DEFAULT_URL)
    .transform((s) => studioUrl(s).origin),
  selection: z
    .strictObject({
      family: z.enum(modelFamilies).optional(),
      weights: z.enum(weightPreferences).optional(),
      execution: z.enum(executionPreferences).optional(),
      agent: z.enum(agentPreferences).optional(),
    })
    .default({}),
});
export type ConnectionProfile = z.output<typeof profileSchema>;
const missing = (e: unknown) => (e as NodeJS.ErrnoException).code === "ENOENT";
const exists = (e: unknown) => (e as NodeJS.ErrnoException).code === "EEXIST";

/** Private connection capabilities, never a provider key or a Taste database. */
export class ProfileStore {
  constructor(
    readonly directory = process.env.GENOBI_CONFIG_DIR ??
      join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "genobi"),
  ) {}

  private async prepare() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(this.directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o077) !== 0
    )
      throw new Error(
        "Genobi config directory must be owner-only (0700), owned by you, and not a symlink.",
      );
  }

  private async read(file: string): Promise<string | undefined> {
    await this.prepare();
    let handle;
    try {
      handle = await open(
        join(this.directory, file),
        constants.O_RDONLY | constants.O_NOFOLLOW,
      );
      const stat = await handle.stat();
      if (
        !stat.isFile() ||
        stat.uid !== process.getuid?.() ||
        (stat.mode & 0o077) !== 0 ||
        stat.size > 8192
      )
        throw new Error(
          "Genobi config files must be owner-only (0600), owned by you, and bounded.",
        );
      return await handle.readFile("utf8");
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    } finally {
      await handle?.close();
    }
  }

  /** Link publishes a complete new identity atomically, even with concurrent CLIs. */
  private async write(file: string, value: string, exclusive = false) {
    await this.prepare();
    const temporary = join(this.directory, `.tmp-${randomUUID()}`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(value);
      await handle.sync();
      await handle.close();
      if (exclusive) await link(temporary, join(this.directory, file));
      else await rename(temporary, join(this.directory, file));
    } catch (error) {
      if (!exclusive || !exists(error)) throw error;
    } finally {
      await handle.close();
      await unlink(temporary).catch((error) => {
        if (!missing(error)) throw error;
      });
    }
    // A concurrent caller that lost the link race also flushes the directory
    // before it can send a write under the published identity.
    const directory = await open(this.directory, constants.O_RDONLY);
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  async current() {
    return profileName.parse((await this.read("active"))?.trim() ?? "default");
  }

  async get(name: string): Promise<ConnectionProfile> {
    profileName.parse(name);
    const contents = await this.read(`profile-${name}.json`);
    if (!contents && name === "default") return profileSchema.parse({});
    if (!contents)
      throw new Error(
        "Profile not found. Use genobi profile set NAME --input JSON.",
      );
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      throw new Error(
        "Invalid profile JSON. Repair it with genobi profile set NAME --input JSON.",
      );
    }
    return profileSchema.parse(parsed);
  }

  async set(name: string, input: unknown) {
    profileName.parse(name);
    const profile = profileSchema.parse(input);
    await this.write(`profile-${name}.json`, JSON.stringify(profile));
    return { name, ...profile };
  }

  async use(name: string) {
    await this.get(name);
    await this.write("active", profileName.parse(name));
    return { active: name };
  }

  async list() {
    await this.prepare();
    const names = new Set(["default"]);
    for (const file of await readdir(this.directory)) {
      const match = /^profile-([a-z][a-z0-9-]{0,47})\.json$/.exec(file);
      if (match) names.add(match[1]);
    }
    return Promise.all(
      [...names]
        .sort()
        .map(async (name) => ({ name, ...(await this.get(name)) })),
    );
  }

  async session(name: string, origin: string, agent: boolean, grant?: string) {
    profileName.parse(name);
    const digest = createHash("sha256")
      .update(JSON.stringify([name, origin, agent, grant ?? null]))
      .digest("hex");
    const file = `session-${digest}`;
    let id = await this.read(file);
    if (!id) {
      await this.write(file, randomUUID(), true);
      id = await this.read(file);
    }
    return z.uuid().parse(id);
  }
}
