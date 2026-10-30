import { referenceBytes } from "../src/director/reference-bytes";
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  parseCommand,
  runDirectorCommand,
} from "../src/director/remix-commands";
import { swapInput } from "../src/director/remix-prompt";
import type { Bundle } from "../src/director/bundle";
const root = new URL("../docs/director-bundle/example/", import.meta.url);
function fixture(): Bundle {
  const project = JSON.parse(
    readFileSync(new URL("studio.json", root), "utf8"),
  );
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const item of [
    ...Object.values(project.assets),
    ...Object.values(project.modules),
  ] as { file: { path: string } }[])
    files.set(
      item.file.path,
      new Uint8Array(readFileSync(new URL(item.file.path, root))),
    );
  return { project, files };
}
describe("Director agent commands", () => {
  it("edits a caption without changing shots, media or the input bundle", async () => {
    const b = fixture();
    const result = await runDirectorCommand(b, {
      op: "text",
      revision: 1,
      layerId: "title",
      text: "NEW LOOK",
    });
    expect("bundle" in result && result.bundle?.project.revision).toBe(2);
    if (!("bundle" in result) || !result.bundle)
      throw new Error("missing result");
    expect(
      result.bundle.project.layers.filter((l) => l.id !== "title"),
    ).toEqual(b.project.layers.filter((l) => l.id !== "title"));
    expect(result.bundle.files).toBe(b.files);
    expect(b.project.revision).toBe(1);
    const title = result.bundle.project.layers.find((l) => l.id === "title");
    expect(title?.kind === "graphics" && title.parameters.text).toBe(
      "NEW LOOK",
    );
  });
  it("rejects stale writes and locked caption edits", async () => {
    const b = fixture();
    await expect(
      runDirectorCommand(b, {
        op: "text",
        revision: 0,
        layerId: "title",
        text: "x",
      }),
    ).rejects.toThrow("changed");
    b.project.layers.find((l) => l.id === "title")!.locked = true;
    await expect(
      runDirectorCommand(b, {
        op: "text",
        revision: 1,
        layerId: "title",
        text: "x",
      }),
    ).rejects.toThrow("Unlock");
  });
  it("splits media without changing its source time or total duration", async () => {
    const b = fixture();
    const result = await runDirectorCommand(b, {
      op: "split",
      revision: 1,
      layerId: "plate",
      frame: 90,
      newId: "plate-two",
    });
    if (!("bundle" in result) || !result.bundle)
      throw new Error("missing result");
    const layers = result.bundle.project.layers.filter((l) =>
      ["plate", "plate-two"].includes(l.id),
    );
    expect(
      layers.map((l) => [
        l.startFrame,
        l.durationFrames,
        "sourceStartFrame" in l && l.sourceStartFrame,
      ]),
    ).toEqual([
      [0, 90, 0],
      [90, 90, 90],
    ]);
  });
  it("validates full JSON before commit, retains bytes and controls the revision", async () => {
    const b = fixture(),
      project = structuredClone(b.project);
    project.revision = 900;
    const result = await runDirectorCommand(b, {
      op: "project",
      revision: 1,
      project,
    });
    expect("bundle" in result && result.bundle?.project.revision).toBe(2);
    project.assets.video.file.sha256 = "0".repeat(64);
    await expect(
      runDirectorCommand(b, { op: "project", revision: 1, project }),
    ).rejects.toThrow("File changed");
  });
  it.each([
    { op: "cut", revision: 1, assetId: "video", in: 2.5, out: 20 },
    { op: "inspect", key: "secret" },
    { op: "text", revision: 1, layerId: "title", text: "x".repeat(81) },
    { op: "replace", revision: 1, layerIds: [] },
  ])("rejects malformed command %j", (c) =>
    expect(() => parseCommand(c)).toThrow(),
  );
  it("returns an inspection snapshot, not mutable editor state", async () => {
    const b = fixture(),
      result = await runDirectorCommand(b, { op: "inspect" });
    expect(result.receipt).toEqual(b.project);
    expect(result.receipt).not.toBe(b.project);
  });
});
describe("FLUX swap request", () => {
  it("binds image 0 as source and image 1 as clothing reference", () => {
    const input = swapInput(
      "clothing",
      ["scene", "outfit"],
      [100, 200, 800, 900],
      "blue coat",
    );
    expect(input.generator).toBe("edit");
    expect(input.imageReferences).toEqual(["scene", "outfit"]);
    expect(input.description).toContain('"from":"ref_image_1"');
    expect(input.description).toContain('"tgt_bbox":[100,200,800,900]');
    expect(input.description).toContain("Preserve the person's face");
    expect(input).not.toHaveProperty("key");
  });
  it("rejects inverted or out-of-range boxes", () => {
    expect(() =>
      swapInput("character", ["a", "b"], [900, 0, 100, 1000], ""),
    ).toThrow("Box");
    expect(() =>
      swapInput("character", ["a", "b"], [0, 0, 1000, 1001], ""),
    ).toThrow("Box");
  });
});

describe("Reference image provenance without network access", () => {
  it("preserves exact bytes and type under a CSP that excludes data fetches", () => {
    const bytes = readFileSync(
      new URL(
        "../docs/director-bundle/templates/character-intro.png",
        import.meta.url,
      ),
    );
    const decoded = referenceBytes(
      `data:image/png;base64,${bytes.toString("base64")}`,
    );
    expect(decoded.type).toBe("image/png");
    expect(decoded.bytes).toEqual(new Uint8Array(bytes));
  });
  it.each([
    "https://example.com/image.png",
    "data:text/html;base64,YQ==",
    "data:image/png;base64,!!",
    "data:image/png;base64,",
  ])("rejects non-image/malformed reference %s", (value) =>
    expect(() => referenceBytes(value)).toThrow(),
  );
});
