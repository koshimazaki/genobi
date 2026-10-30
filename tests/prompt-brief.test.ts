import { describe, expect, it } from "vitest";
import { unzipSync, strToU8, zipSync } from "fflate";
import { assetFixture } from "./director-asset-fixture";
import {
  BRIEF_PATH,
  activeReferences,
  briefArchive,
  readBrief,
  resolveBrief,
  withReferenceRoom,
  writeBrief,
  type PromptBrief,
} from "../src/director/prompt-brief";
import { digest, importBundle, validateFiles } from "../src/director/bundle";
import { runDirectorCommand } from "../src/director/remix-commands";

describe("asset-linked animation prompt", () => {
  it("resolves stable labels, swaps files without changing words, and exports actual bytes", async () => {
    const base = assetFixture();
    const ids = Object.keys(base.project.assets);
    const text = "Use [Image 1] behind the title.";
    const a = writeBrief(base, {
      version: 1,
      text,
      references: [{ id: "ref-1", label: "Image 1", assetId: ids[0] }],
    });
    const b = writeBrief(a, {
      ...readBrief(a),
      references: [{ id: "ref-1", label: "Image 1", assetId: ids[1] }],
    });
    expect(readBrief(b).text).toBe(text);
    expect(resolveBrief(b).references[0].path).toBe(
      base.project.assets[ids[1]].file.path,
    );
    const archive = unzipSync(
      new Uint8Array(await briefArchive(b).arrayBuffer()),
    );
    const packet = JSON.parse(new TextDecoder().decode(archive["brief.json"]));
    expect(archive[packet.references[0].path]).toEqual(
      base.files.get(packet.references[0].path),
    );
    expect((await runDirectorCommand(b, { op: "brief" })).receipt).toEqual(
      packet,
    );
    expect(base.files.has(BRIEF_PATH)).toBe(false);
    expect(activeReferences({ ...readBrief(b), text: "No reference" })).toEqual(
      [],
    );
  });
  it("retains prompt and fonts across bundle import and verifies font content", async () => {
    const base = assetFixture();
    const bytes = new Uint8Array([0, 1, 0, 0]);
    const path = "brief/fonts/test.ttf";
    base.files.set(path, bytes);
    const bundle = writeBrief(base, {
      version: 1,
      text: "Set the title in [Font 1]",
      references: [
        {
          id: "font-1",
          label: "Font 1",
          font: {
            name: "Test.ttf",
            file: { path, sha256: await digest(bytes) },
          },
        },
      ],
    });
    const zip = zipSync({
      ...Object.fromEntries(bundle.files),
      "project.json": strToU8(JSON.stringify(bundle.project)),
    });
    const restored = await importBundle(
      new File([new Uint8Array(zip)], "project.zip"),
    );
    expect(readBrief(restored)).toEqual(readBrief(bundle));
    restored.files.set(path, new Uint8Array([1]));
    await expect(validateFiles(restored)).rejects.toThrow("File changed");
  });
  it("rejects unsafe references and never exports dangling files", () => {
    const base = assetFixture();
    expect(() =>
      writeBrief(base, {
        version: 1,
        text: "[Font 1]",
        references: [
          {
            id: "f",
            label: "Font 1",
            font: {
              name: "x",
              file: { path: "../font.ttf", sha256: "a".repeat(64) },
            },
          },
        ],
      }),
    ).toThrow();
    const broken = writeBrief(base, {
      version: 1,
      text: "[Image 1]",
      references: [{ id: "i", label: "Image 1", assetId: "deleted" }],
    });
    expect(() => briefArchive(broken)).toThrow("Image 1 is missing");
    const unassigned = writeBrief(base, {
      version: 1,
      text: "Use [Image 2]",
      references: [],
    });
    expect(() => briefArchive(unassigned)).toThrow("not assigned");
    expect(() =>
      writeBrief(base, { version: 1, text: "x".repeat(12001), references: [] }),
    ).toThrow();
  });
});

describe("reference capacity", () => {
  const full = (text: string): PromptBrief => ({
    version: 1,
    text,
    references: Array.from({ length: 32 }, (_, i) => ({
      id: `ref-${i}`,
      label: `Image ${i + 1}`,
      assetId: "asset",
    })),
  });
  it("keeps deleted tokens' bindings below the cap so retyping restores them", () => {
    const brief = { ...full(""), references: full("").references.slice(0, 3) };
    expect(withReferenceRoom(brief)).toBe(brief);
  });
  it("frees slots whose tokens left the text once the cap is reached", () => {
    const room = withReferenceRoom(full("Keep [Image 2] only"))!;
    expect(room.references.map((r) => r.label)).toEqual(["Image 2"]);
  });
  it("refuses a 33rd reference while every token is still in the text", () => {
    const text = Array.from({ length: 32 }, (_, i) => `[Image ${i + 1}]`).join(
      " ",
    );
    expect(withReferenceRoom(full(text))).toBeUndefined();
  });
});
