import { afterEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reserveCaptureDirectory } from "../scripts/experiments/capture-files.mjs";

const temporary = [];
async function root() {
  const path = await mkdtemp(join(tmpdir(), "genobi-capture-test-"));
  temporary.push(path);
  return path;
}
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("capture output lineage", () => {
  it("reserves a new or empty directory before any capture writes", async () => {
    for (const directory of [await root(), join(await root(), "new")]) {
      await reserveCaptureDirectory(directory);
      expect(await readdir(directory)).toEqual(["capture-reservation.json"]);
      await expect(reserveCaptureDirectory(directory)).rejects.toThrow(
        /absent or empty/,
      );
    }
  });

  it("refuses a different study in an existing root without overwriting its source", async () => {
    const directory = await root();
    await mkdir(join(directory, "fruit"));
    const source = join(directory, "source.json");
    await writeFile(source, '{"excerptStartSeconds":16}');
    await expect(reserveCaptureDirectory(directory)).rejects.toThrow(
      /absent or empty/,
    );
    expect(await readFile(source, "utf8")).toBe('{"excerptStartSeconds":16}');
    expect((await readdir(directory)).sort()).toEqual(["fruit", "source.json"]);
  });

  it("allows only one claimant when two captures race on an empty directory", async () => {
    const directory = await root();
    const results = await Promise.allSettled([
      reserveCaptureDirectory(directory),
      reserveCaptureDirectory(directory),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      JSON.parse(
        await readFile(join(directory, "capture-reservation.json"), "utf8"),
      ).status,
    ).toBe("reserved");
  });
});
