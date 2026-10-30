import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import { expect, it } from "vitest";
import { runBundle } from "../scripts/lib/teaser-run/bundle";
import { validateFiles } from "../src/director/bundle";

it("packages the v1 run with matching original media and current recipes without swapping templates", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "teaser-bundle-"));
  const templatePath = "shared/templates/genobi-teaser.cut.json";
  const before = readFileSync(templatePath);
  // The v1-era derived fixture with its focus boxes drawn in 0.1 s and held
  // to their end, so their labels read 1.3 s (the verifier's typed-label hold).
  const derived = JSON.parse(
    readFileSync("tests/fixtures/teaser-run/derived-v1.cut.json", "utf8"),
  );
  for (const l of derived.layers)
    if (l.module === "ui-focus") {
      l.parameters.draw = 0.1;
      l.parameters.fadeAt =
        Math.round(((l.beats * 60) / derived.bpm) * 1000) / 1000;
    }
  const cut = Buffer.from(JSON.stringify(derived));
  try {
    writeFileSync(path.join(folder, "cut.json"), cut);
    const files = unzipSync(runBundle(folder));
    const project = JSON.parse(new TextDecoder().decode(files["project.json"]));
    await validateFiles({ project, files: new Map(Object.entries(files)) });
    expect(project.id).toBe("genobi-teaser-run");
    expect(files["media/ui-camera.mp4"]).toEqual(
      new Uint8Array(
        readFileSync("public/media/showcase/genobi-teaser/v1/ui-camera.mp4"),
      ),
    );
    expect(
      project.layers.find((l: { id: string }) => l.id === "title").parameters
        .plate,
    ).toBe(0);
    expect(readFileSync(templatePath)).toEqual(before);
    expect(readFileSync(path.join(folder, "cut.json"))).toEqual(cut);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}, 60000);

it("verifies and packages the v2 derived run on v2's media, every asset resolved", async () => {
  const folder = mkdtempSync(path.join(tmpdir(), "teaser-bundle-v2-"));
  const cut = readFileSync("tests/fixtures/teaser-run/derived.cut.json");
  try {
    writeFileSync(path.join(folder, "cut.json"), cut);
    const files = unzipSync(runBundle(folder));
    const project = JSON.parse(new TextDecoder().decode(files["project.json"]));
    await validateFiles({ project, files: new Map(Object.entries(files)) });
    for (const asset of Object.values(project.assets) as {
      file: { path: string };
    }[])
      expect(files[asset.file.path], asset.file.path).toBeDefined();
    // v3 re-recorded ui-agent; the run packages v2's archived take.
    expect(files["media/ui-agent.mp4"]).toEqual(
      new Uint8Array(
        readFileSync("public/media/showcase/genobi-teaser/v2/ui-agent.mp4"),
      ),
    );
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
}, 60000);
