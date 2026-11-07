import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strToU8, unzipSync, zipSync, Zip, ZipPassThrough } from "fflate";
import { expect, it, vi, afterEach } from "vitest";
import {
  archiveBundle,
  bundleZip,
  importBundle,
  saveBundle,
} from "../src/director/bundle";
import {
  ARCHIVE_PATH,
  checkArchiveEntries,
} from "../src/director/archive-integrity";
import { DIRECTOR_PROJECT_BYTES } from "../shared/director/types";
import { createStudioStore } from "../src/studio/store";
import { restoreProject } from "../src/director/restore-project";
import { readCopy } from "../src/director/project-copy";
import { readBrief, writeBrief } from "../src/director/prompt-brief";
import {
  readWorldFiles,
  writeWorldFile,
  WORLD_RECIPE_PATH,
} from "../src/director/world-files";
import { defaultRecipe } from "../src/world-builder/recipe";
import { base } from "./house-template-fixtures";
import { studio } from "./project-copy-harness";
import { wav } from "./audio-fixtures";

afterEach(() => vi.unstubAllGlobals());
const file = (bytes: Uint8Array<ArrayBuffer>) =>
  new File([bytes], "project.zip");

it(
  "archives agent-imported image/audio/video, brief and World source without a browser cache",
  { timeout: 15_000 },
  async () => {
    const s = await studio();
    await s.upload(s.cookie);
    await s.push(s.cookie, null, 1);
    const agent = await s.fresh();
    const { code } = await s.send(s.cookie, `/${s.project.id}/link`, "POST");
    const linked = await s.send(agent, "/link", "POST", { code });
    const copyId = (linked.project as { copyId: string }).copyId;
    let revision = 1;
    for (const [bytes, type] of [
      [
        await readFile("docs/director-bundle/templates/poster-motion.png"),
        "image/png",
      ],
      [Buffer.from(wav(2)), "audio/wav"],
      [await readFile("tests/fixtures/metadata.mp4"), "video/mp4"],
    ] as const) {
      const sha = createHash("sha256").update(bytes).digest("hex");
      const staged = await fetch(
        `${s.base}/api/projects/${copyId}/media/${sha}`,
        {
          method: "POST",
          headers: { cookie: agent, "Content-Type": type },
          body: bytes,
        },
      );
      expect(staged.status).toBe(201);
      expect(
        await s.send(agent, `/${copyId}/media`, "POST", {
          baseRevision: revision++,
          requestId: randomUUID(),
          command: { op: "attach", receiptId: sha, use: "production" },
        }),
      ).toMatchObject({ status: 200, revision });
    }
    const fetcher: typeof fetch = (url, init) =>
      fetch(`${s.base}${url}`, { ...init, headers: { cookie: s.cookie } });
    let bundle = await readCopy(copyId, undefined, fetcher);
    const assetId = Object.keys(bundle.project.assets).find(
      (id) => bundle.project.assets[id].kind === "image",
    )!;
    bundle = writeBrief(bundle, {
      version: 1,
      text: "Use [Image 1] for the opening.",
      references: [{ id: "reference", label: "Image 1", assetId }],
    });
    bundle = writeWorldFile(bundle, WORLD_RECIPE_PATH, defaultRecipe);
    const archive = await archiveBundle(bundle);
    const raw = unzipSync(archive);
    const index = JSON.parse(new TextDecoder().decode(raw[ARCHIVE_PATH]));
    expect(index.files.map((entry: { path: string }) => entry.path)).toContain(
      WORLD_RECIPE_PATH,
    );
    const fresh = createStudioStore();
    const restored = await restoreProject(file(archive), fresh);
    expect(restored.project).toEqual(bundle.project);
    expect(readBrief(restored)).toEqual(readBrief(bundle));
    expect(readWorldFiles(restored)).toEqual(readWorldFiles(bundle));
    for (const [path, bytes] of bundle.files)
      expect(restored.files.get(path)).toEqual(bytes);
    expect(JSON.stringify(index)).not.toContain(s.directory);
    expect(restored.project).not.toHaveProperty("mediaWrites");
    expect(s.bfl.submissions).toBe(0);
  },
);

it("refuses missing and changed media before creating a download", async () => {
  const click = vi.fn();
  vi.stubGlobal("document", { createElement: () => ({ click }) });
  const missing = base();
  const path = Object.values(missing.project.assets)[0].file.path;
  missing.files.delete(path);
  await expect(saveBundle(missing)).rejects.toThrow(`Missing file: ${path}`);
  const changed = base();
  changed.files.set(path, new Uint8Array([1, 2, 3]));
  await expect(saveBundle(changed)).rejects.toThrow(`File changed: ${path}`);
  expect(click).not.toHaveBeenCalled();
});

it("verifies companion hashes and refuses missing, additional or recursive index entries", async () => {
  const bundle = writeWorldFile(base(), WORLD_RECIPE_PATH, defaultRecipe);
  const bytes = await archiveBundle(bundle);
  const raw = unzipSync(bytes);
  raw[WORLD_RECIPE_PATH] = strToU8(
    JSON.stringify({ ...defaultRecipe, prompt: "Changed source" }),
  );
  await expect(importBundle(file(zipSync(raw)))).rejects.toThrow(
    "Archive file missing or changed: world/recipe.json",
  );
  const missing = unzipSync(bytes);
  delete missing[WORLD_RECIPE_PATH];
  await expect(importBundle(file(zipSync(missing)))).rejects.toThrow(
    "Archive file missing or changed",
  );
  const extra = unzipSync(bytes);
  extra["extra.txt"] = strToU8("unexpected");
  await expect(importBundle(file(zipSync(extra)))).rejects.toThrow("unindexed");
  const recursive = unzipSync(bytes);
  const index = JSON.parse(new TextDecoder().decode(recursive[ARCHIVE_PATH]));
  index.files.push({ ...index.files[0], path: ARCHIVE_PATH });
  recursive[ARCHIVE_PATH] = strToU8(JSON.stringify(index));
  await expect(importBundle(file(zipSync(recursive)))).rejects.toThrow(
    "recursive",
  );
});

it("keeps legacy ZIPs readable and refuses reserved media paths", async () => {
  expect((await importBundle(file(bundleZip(base())))).project).toEqual(
    base().project,
  );
  const bundle = base();
  const asset = Object.values(bundle.project.assets)[0];
  bundle.files.set("project.json", bundle.files.get(asset.file.path)!);
  asset.file.path = "project.json";
  await expect(archiveBundle(bundle)).rejects.toThrow("reserved bundle path");
});

it("holds save and import to the same file and byte limits", () => {
  const entries = Object.fromEntries(
    Array.from({ length: 129 }, (_, i) => [
      `files/item${i}.txt`,
      new Uint8Array(1),
    ]),
  );
  expect(() => checkArchiveEntries(entries)).toThrow("128 files");
  const large = new Uint8Array(DIRECTOR_PROJECT_BYTES);
  expect(() =>
    checkArchiveEntries({
      "media/large.mp4": large,
      "project.json": new Uint8Array(1),
    }),
  ).toThrow("Unpacked bundle");
});

it("refuses duplicate and unsafe ZIP paths and truncated restores without changing the current project", async () => {
  const store = createStudioStore();
  store.getState().actions.initialize(base());
  const before = store.getState().director.bundle;
  const chunks: Uint8Array[] = [];
  const zip = new Zip((error, chunk) => {
    if (error) throw error;
    chunks.push(chunk);
  });
  for (let i = 0; i < 2; i++) {
    const entry = new ZipPassThrough("project.json");
    zip.add(entry);
    entry.push(strToU8("{}"), true);
  }
  zip.end();
  const duplicate = new Uint8Array(Buffer.concat(chunks));
  const unsafe = zipSync({ "../escape.txt": strToU8("outside") });
  const valid = await archiveBundle(base());
  for (const bytes of [duplicate, unsafe, valid.slice(0, 30)]) {
    await expect(restoreProject(file(bytes), store)).rejects.toThrow();
    expect(store.getState().director.bundle).toBe(before);
  }
});

it("does not replace a project changed during restore, including initial startup", async () => {
  for (const initialized of [false, true]) {
    const store = createStudioStore();
    if (initialized) store.getState().actions.initialize(base());
    const bytes = await archiveBundle(base());
    let finish!: (bytes: ArrayBuffer) => void;
    const pending = file(bytes);
    pending.arrayBuffer = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const opening = restoreProject(pending, store);
    const changed = base();
    changed.project.name = "Keep this work";
    store.getState().actions.commit(changed);
    const before = store.getState().director.bundle;
    finish(bytes.buffer);
    await expect(opening).rejects.toThrow("Project changed");
    expect(store.getState().director.bundle).toBe(before);
  }
});
