import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DIRECTOR_MEDIA_BYTES, type Project } from "../shared/director/types";
import { FILE_BYTES, ProjectCopies } from "../server/projects";
import { STAGE_MS } from "../server/project-staging";
import { studio } from "./project-copy-harness";
import { base } from "./house-template-fixtures";

// The media limit per copy: files staged for the next manifest are counted
// without the files the current copy holds, so replacing a large asset with a
// smaller one fits, while the manifest push still holds the whole copy to it.
const SESSION = "0f8fad5b-d9cb-469f-a165-70867728950e";
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const temporary: string[] = [];
afterEach(async () => {
  for (const dir of temporary.splice(0))
    await rm(dir, { recursive: true, force: true });
});

async function copies(
  limit: (total: number) => number,
  clock: () => number = Date.now,
) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "genobi-quota-test-"));
  temporary.push(dir);
  const bundle = base();
  const project = bundle.project as Project;
  const files = new Map<string, Uint8Array>();
  for (const bytes of bundle.files.values()) files.set(sha(bytes), bytes);
  const total = [...files.values()].reduce((n, b) => n + b.length, 0);
  const store = new ProjectCopies(dir, limit(total), clock);
  await store.load();
  const upload = (bytes: Uint8Array) =>
    store.putFile(project.id, SESSION, sha(bytes), Buffer.from(bytes));
  const push = (baseRevision: number | null, next: Project) =>
    store.put(project.id, SESSION, {
      baseRevision,
      project: next,
      brief: null,
    });
  return { dir, store, project, files, total, upload, push };
}

describe("the project copy's media limit", () => {
  it("lets a smaller file replace the largest asset when the copy is near the limit", async () => {
    const { dir, project, files, upload, push } = await copies((t) => t + 100);
    for (const bytes of files.values()) await upload(bytes);
    await push(null, project);
    const [assetId, asset] = Object.entries(project.assets).sort(
      ([, a], [, b]) =>
        files.get(b.file.sha256)!.length - files.get(a.file.sha256)!.length,
    )[0];
    const old = files.get(asset.file.sha256)!;
    const replacement = new Uint8Array(randomBytes(old.length - 10));
    // Old and new together would pass the limit; the old one is not counted.
    expect(await upload(replacement)).toEqual({ stored: true });
    const next = structuredClone(project);
    next.revision = 2;
    next.assets[assetId].file.sha256 = sha(replacement);
    expect(await push(1, next)).toEqual({ revision: 2 });
    const stored = await readdir(
      path.join(
        dir,
        "projects",
        (await readdir(path.join(dir, "projects")))[0],
        project.id,
        "files",
      ),
    );
    expect(stored).toContain(sha(replacement));
    expect(stored).not.toContain(asset.file.sha256);
  });

  it("refuses a manifest whose files together pass the limit", async () => {
    const { project, files, total, upload, push } = await copies(
      (t) => t + 100,
    );
    for (const bytes of files.values()) await upload(bytes);
    await push(null, project);
    const extra = new Uint8Array(randomBytes(200));
    expect(await upload(extra)).toEqual({ stored: true });
    const next = structuredClone(project);
    next.revision = 2;
    next.assets["extra-still"] = {
      kind: "image",
      use: "reference",
      origin: "uploaded",
      file: { path: "references/extra.png", sha256: sha(extra) },
    };
    await expect(push(1, next)).rejects.toMatchObject({
      status: 413,
      code: "project_too_large",
    });
    expect(total).toBeGreaterThan(0);
  });

  it("refuses staging a new project's files past the limit", async () => {
    const { files, upload } = await copies((t) => t - 1);
    const all = [...files.values()];
    for (const bytes of all.slice(0, -1)) await upload(bytes);
    await expect(upload(all.at(-1)!)).rejects.toMatchObject({ status: 413 });
  });
});

describe("abandoned staging", () => {
  // A copy of total size T under a limit of 2T + 1, and two candidate stills
  // of T + 1 bytes each: either fits beside the copy, both together do not.
  const setup = async (clock?: () => number) => {
    const c = await copies((t) => 2 * t + 1, clock);
    for (const bytes of c.files.values()) await c.upload(bytes);
    await c.push(null, c.project);
    const still = () => new Uint8Array(randomBytes(c.total + 1));
    const withStill = (bytes: Uint8Array, revision: number) => {
      const next = structuredClone(c.project);
      next.revision = revision;
      next.assets["extra-still"] = {
        kind: "image",
        use: "reference",
        origin: "uploaded",
        file: { path: "references/extra.png", sha256: sha(bytes) },
      };
      return next;
    };
    const stored = async () =>
      readdir(
        path.join(
          c.dir,
          "projects",
          (await readdir(path.join(c.dir, "projects")))[0],
          c.project.id,
          "files",
        ),
      );
    return { ...c, still, withStill, stored };
  };

  it("frees a refused push's uploads, so the next batch fits", async () => {
    const { upload, push, still, withStill, stored } = await setup();
    const lost = still();
    await upload(lost);
    // Another window wrote first: this push names a stale base.
    await expect(push(7, withStill(lost, 8))).rejects.toMatchObject({
      status: 409,
      code: "revision_conflict",
    });
    expect(await stored()).not.toContain(sha(lost));
    const kept = still();
    expect(await upload(kept)).toEqual({ stored: true });
    expect(await push(1, withStill(kept, 2))).toEqual({ revision: 2 });
  });

  it("reclaims uploads whose push never came once they are old", async () => {
    let now = 1_000_000;
    const { upload, still, stored } = await setup(() => now);
    const abandoned = still();
    await upload(abandoned);
    // Still recent: it counts, and a second batch does not fit beside it.
    await expect(upload(still())).rejects.toMatchObject({ status: 413 });
    now += STAGE_MS + 1;
    const next = still();
    expect(await upload(next)).toEqual({ stored: true });
    expect(await stored()).not.toContain(sha(abandoned));
  });
});

describe("refusals free what they staged", () => {
  it("frees a refused oversize addition, so a later large batch fits", async () => {
    // Scaled down: the copy is 80% of the limit, the refused addition 30%,
    // the later batch 90% in three files.
    const c = await copies((t) => Math.ceil((t * 100) / 80));
    const limit = Math.ceil((c.total * 100) / 80);
    for (const bytes of c.files.values()) await c.upload(bytes);
    await c.push(null, c.project);
    const addition = new Uint8Array(randomBytes(Math.ceil(limit * 0.3)));
    expect(await c.upload(addition)).toEqual({ stored: true });
    const next = structuredClone(c.project);
    next.revision = 2;
    next.assets["extra-still"] = {
      kind: "image",
      use: "reference",
      origin: "uploaded",
      file: { path: "references/extra.png", sha256: sha(addition) },
    };
    await expect(c.push(1, next)).rejects.toMatchObject({
      status: 413,
      code: "project_too_large",
    });
    for (let i = 0; i < 3; i++)
      expect(
        await c.upload(new Uint8Array(randomBytes(Math.floor(limit * 0.3)))),
      ).toEqual({ stored: true });
  });

  it("stops counting abandoned first uploads toward the copies a session may keep", async () => {
    let now = 5_000_000;
    const dir = await mkdtemp(path.join(os.tmpdir(), "genobi-count-test-"));
    temporary.push(dir);
    const store = new ProjectCopies(dir, undefined, () => now);
    await store.load();
    const one = (n: number) => Buffer.from(`abandoned ${n}`);
    for (let i = 1; i <= 16; i++)
      await store.putFile(`draft-${i}`, SESSION, sha(one(i)), one(i));
    // Sixteen recent first uploads hold every place.
    const bundle = base();
    const [first] = bundle.files.values();
    await expect(
      store.putFile("fresh", SESSION, sha(first), Buffer.from(first)),
    ).rejects.toMatchObject({ status: 409, code: "project_limit" });
    now += STAGE_MS + 1;
    // Once idle they no longer count: a valid new project fits.
    const project = { ...(bundle.project as Project), id: "fresh" };
    for (const bytes of new Set(bundle.files.values()))
      await store.putFile("fresh", SESSION, sha(bytes), Buffer.from(bytes));
    expect(
      await store.put("fresh", SESSION, {
        baseRevision: null,
        project,
        brief: null,
      }),
    ).toEqual({ revision: project.revision });
    const owner = (await readdir(path.join(dir, "projects")))[0];
    expect(await readdir(path.join(dir, "projects", owner))).toEqual(["fresh"]);
  });
});

describe("one file's limit", () => {
  it("takes any file the Director imports, up to its media limit, and no more", async () => {
    expect(FILE_BYTES).toBe(DIRECTOR_MEDIA_BYTES);
    const { cookie, project, base: url } = await studio();
    const put = (bytes: Uint8Array<ArrayBuffer>) =>
      fetch(`${url}/api/projects/${project.id}/files/${sha(bytes)}`, {
        method: "PUT",
        headers: { cookie, "Content-Type": "application/octet-stream" },
        body: bytes,
      });
    const largest = new Uint8Array(DIRECTOR_MEDIA_BYTES).fill(7);
    expect((await put(largest)).status).toBe(201);
    const over = new Uint8Array(DIRECTOR_MEDIA_BYTES + 1).fill(7);
    expect((await put(over)).status).toBe(413);
    // Two 150 MiB bodies hashed and sent: allow a slow machine the time.
  }, 60_000);
});
