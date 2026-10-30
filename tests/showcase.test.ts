import Ajv from "ajv";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Project } from "../shared/director/types";
import { checkpointSchema, decisionSchema } from "../shared/memory/schema";
import type { ShowcaseRecord } from "../shared/showcase/types";
import { findMixTemplate } from "../shared/templates/catalogue";
import { mixProject } from "../shared/templates/mix";
import { loadShowcase, showcaseForTemplate } from "../src/director/showcase";
import { validateProject } from "../src/director/validate";
import { base } from "./house-template-fixtures";

// The showcase records (docs/director-bundle/showcase/): each version is a
// valid project, its media is where the record says, its memory keeps the
// project memory's shapes, and the newest version is the template today.
const root = new URL("../docs/director-bundle/showcase/", import.meta.url);
const read = (url: URL) => JSON.parse(readFileSync(url, "utf8"));
const names = readdirSync(root, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const record = (name: string): ShowcaseRecord =>
  read(new URL(`${name}/memory.json`, root));
const project = (name: string, file: string): Project =>
  read(new URL(`${name}/${file}`, root));
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const publicFile = (url: string) => new URL(`../public${url}`, import.meta.url);
const schema = read(
  new URL(
    "../docs/director-bundle/schema/showcase.schema.json",
    import.meta.url,
  ),
);
const validate = new Ajv({ allErrors: true }).compile(schema);

describe.each(names)("the %s showcase", (name) => {
  const r = record(name);

  it("matches the showcase schema and names its own folder", () => {
    expect(validate(r) || validate.errors).toBe(true);
    expect(r.project).toBe(name);
    expect(findMixTemplate(r.template)).toBeDefined();
    expect(showcaseForTemplate(r.template)?.project).toBe(name);
    expect(existsSync(new URL(`${name}/README.md`, root))).toBe(true);
  });

  it("keeps the project memory's decision and checkpoint shapes", () => {
    const ids = new Set(r.memory.events.map((e) => e.id));
    expect(ids.size).toBe(r.memory.events.length);
    for (const { actor, at, version, ...decision } of r.memory.events) {
      expect([actor, at, version]).not.toContain(undefined);
      decisionSchema.parse({ ...decision, baseRevision: 1, memoryRevision: 0 });
    }
    for (const { at, version, ...checkpoint } of r.memory.checkpoints) {
      expect([at, version]).not.toContain(undefined);
      checkpointSchema.parse({
        ...checkpoint,
        baseRevision: 1,
        memoryRevision: 0,
        coveredCursor: 0,
      });
      for (const id of checkpoint.eventIds) expect(ids).toContain(id);
    }
    for (const v of r.versions)
      for (const id of v.eventIds) expect(ids).toContain(id);
  });

  it("numbers its versions in order, each a valid project of its own", () => {
    expect(r.versions.map((v) => v.version)).toEqual(
      r.versions.map((_, i) => i + 1),
    );
    for (const v of r.versions) {
      const p = project(name, v.file);
      expect(() => validateProject(p)).not.toThrow();
      expect(p).toMatchObject({ id: v.projectId, revision: 1 });
      expect(v.projectId).toBe(`${name}-v${v.version}`);
      expect(p.layers).toHaveLength(v.layers);
      expect(p.composition.durationFrames).toBe(v.durationFrames);
    }
    for (const p of r.pending ?? [])
      expect(p.version).toBeGreaterThan(r.versions.length);
  });

  it("serves each media file's exact bytes, or says where git keeps it", () => {
    const used = new Set<string>();
    for (const v of r.versions)
      for (const a of Object.values(project(name, v.file).assets)) {
        used.add(a.file.sha256);
        expect(r.media[a.file.sha256]?.path).toBe(a.file.path);
      }
    expect(new Set(Object.keys(r.media))).toEqual(used);
    for (const [digest, m] of Object.entries(r.media))
      if (m.url) expect(sha(readFileSync(publicFile(m.url)))).toBe(digest);
      else
        expect(m).toMatchObject({
          shipped: false,
          reason: expect.any(String),
        });
  });

  it("preserves the recorded cut at its original resolution, unless a version is pending", () => {
    if (r.pending?.length) return;
    const template = findMixTemplate(r.template)!;
    const latest = r.versions.at(-1)!;
    const recorded = project(name, latest.file);
    const media = Object.fromEntries(
      Object.entries(template.mix!.media).map(([id, m]) => [
        id,
        { ...m, sha256: sha(readFileSync(publicFile(m.url))) },
      ]),
    );
    const today = mixProject(
      {
        ...template.mix!.cut,
        designSize: recorded.composition.designSize,
        width: recorded.composition.width,
        height: recorded.composition.height,
      },
      template.name,
      media,
      base().project.modules,
    );
    expect(recorded).toEqual({
      ...today,
      id: latest.projectId,
      name: `${r.name} · v${latest.version}`,
    });
  });
});

describe("opening a showcase version", () => {
  afterEach(() => vi.unstubAllGlobals());
  const serve = () =>
    vi.stubGlobal("fetch", async (url: string) =>
      existsSync(publicFile(url))
        ? new Response(readFileSync(publicFile(url)))
        : new Response("", { status: 404 }),
    );
  const example = async () => base();

  it("opens the newest Dimensions mix as recorded", async () => {
    serve();
    const r = record("dimensions-mix");
    const latest = r.versions.at(-1)!;
    const { bundle, note } = await loadShowcase(
      "dimensions-mix",
      latest.version,
      example,
    );
    expect(note).toBe("");
    expect(bundle.project).toEqual(project("dimensions-mix", latest.file));
  });

  it("puts the editable card in place of v1's unshipped capture, with a note", async () => {
    serve();
    const { bundle, note } = await loadShowcase("dimensions-mix", 1, example);
    const p = bundle.project;
    expect(p.assets["mix-end"]).toBeUndefined();
    expect(p.layers.some((l) => l.id === "shot-13")).toBe(false);
    expect(p.layers.find((l) => l.id === "end-card")).toMatchObject({
      startFrame: 453,
      durationFrames: 102,
    });
    expect(note).toContain("media/mix-end.mp4");
    expect(p.notes).toEqual([
      expect.objectContaining({ frame: 453, layerId: "end-card", text: note }),
    ]);
    expect(() => validateProject(p)).not.toThrow();
  });

  it("refuses a version the record does not have", async () => {
    await expect(loadShowcase("dimensions-mix", 99, example)).rejects.toThrow(
      "unavailable",
    );
  });
});
