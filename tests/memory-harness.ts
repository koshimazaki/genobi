import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { afterEach } from "vitest";
import { MemoryProjects } from "../server/memory-projects";
import { TasteProfiles } from "../server/taste-profiles";
import { base } from "./house-template-fixtures";
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});
export async function memoryHarness() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "genobi-memory-"));
  directories.push(directory);
  const projects = new MemoryProjects(directory);
  await projects.load();
  const bundle = base();
  for (const bytes of new Set(bundle.files.values()))
    await projects.putFile(
      bundle.project.id,
      "owner",
      createHash("sha256").update(bytes).digest("hex"),
      Buffer.from(bytes),
    );
  await projects.put(bundle.project.id, "owner", {
    baseRevision: null,
    project: { ...bundle.project, revision: 1 },
    brief: null,
  });
  const copyId = projects.list("owner")[0].copyId;
  const profiles = new TasteProfiles(directory, projects);
  const context = () =>
    projects.context(copyId, "owner", [], {
      medium: "video",
      useCase: "tutorial",
    });
  const decision = (id: string, changes: object = {}) => ({
    id,
    baseRevision: 1,
    memoryRevision: context().memoryRevision,
    kind: "kept",
    objectIds: [],
    source: "explicit-user",
    ...changes,
  });
  const link = async (session: string) => {
    const { code } = projects.link(bundle.project.id, "owner");
    await projects.redeem(session, { code });
  };
  return {
    directory,
    projects,
    profiles,
    copyId,
    bundle,
    context,
    decision,
    link,
  };
}
