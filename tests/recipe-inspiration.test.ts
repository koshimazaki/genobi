import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCommand, type DirectorCopy } from "../shared/director/commands";
import { checkReferences, type Project } from "../shared/director/types";
import versionMedia from "../docs/director-bundle/version-media/modules.json";
import { validateProject } from "../src/director/validate";

// A project saved before the write-time rule: a trusted recipe whose image
// parameter binds `moodboard`, an Inspiration (use "reference").
const parameters = {
  still: "asset:moodboard",
  matte: "#101316",
  accent: "#e4e8ed",
  inset: 0.1,
  duration: 2,
  mode: "trace",
  steps: "",
  done: "",
  fadeAt: 5,
};
function older(): Project {
  const p = JSON.parse(
    readFileSync("docs/director-bundle/example/studio.json", "utf8"),
  ) as Project;
  p.modules["version-gen-image"] = structuredClone(
    versionMedia["version-gen-image"],
  ) as Project["modules"][string];
  p.layers.push({
    id: "still-card",
    name: "Still card",
    kind: "graphics",
    moduleId: "version-gen-image",
    startFrame: 0,
    durationFrames: 60,
    locked: false,
    position: { x: 0, y: 0 },
    opacity: 1,
    scale: 1,
    rotationDegrees: 0,
    parameters: { ...parameters },
  } as Project["layers"][number]);
  return p;
}
const copyOf = (project: Project): DirectorCopy => ({ project, prompt: "" });
function ok(project: Project, command: unknown) {
  const result = applyCommand(copyOf(project), command);
  if (!result.ok) throw new Error(result.error);
  validateProject(result.copy.project);
  return result.copy.project;
}
function refused(project: Project, command: unknown) {
  const result = applyCommand(copyOf(project), command);
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.error;
}

describe("an Inspiration bound to a recipe image", () => {
  it("still opens and edits in a project saved before the rule", () => {
    const p = older();
    expect(p.assets.moodboard.use).toBe("reference");
    expect(() => checkReferences(p)).not.toThrow();
    expect(() => validateProject(structuredClone(p))).not.toThrow();
    // Editing another parameter leaves the older binding alone.
    const next = ok(p, {
      op: "set-parameters",
      layerId: "still-card",
      parameters: { matte: "#000000" },
    });
    expect(next.layers.find((l) => l.id === "still-card")).toMatchObject({
      parameters: { still: "asset:moodboard", matte: "#000000" },
    });
  });

  it("is refused at write time without the person's opt-in", () => {
    const p = older();
    const command = {
      op: "set-parameters",
      layerId: "still-card",
      parameters: { still: "asset:moodboard" },
    };
    expect(refused(p, command)).toMatch(
      /moodboard is an Inspiration.*allowInspirationAsInput: true/,
    );
    expect(refused(p, { ...command, allowInspirationAsInput: "yes" })).toMatch(
      /must be a boolean/,
    );
    expect(
      refused(p, {
        op: "add-graphic",
        layerId: "second-card",
        moduleId: "version-gen-image",
        track: "new",
        startFrame: 60,
        durationFrames: 30,
      }),
    ).toMatch(/moodboard is an Inspiration/);
    // A production image binds as before.
    expect(
      ok(p, { ...command, parameters: { still: "asset:image-1" } }).layers.find(
        (l) => l.id === "still-card",
      ),
    ).toMatchObject({ parameters: { still: "asset:image-1" } });
  });

  it("binds a production copy with the opt-in, as replace-plate does", () => {
    const p = older();
    const next = ok(p, {
      op: "set-parameters",
      layerId: "still-card",
      parameters: { still: "asset:moodboard" },
      allowInspirationAsInput: true,
    });
    expect(next.layers.find((l) => l.id === "still-card")).toMatchObject({
      parameters: { still: "asset:moodboard-plate" },
    });
    expect(next.assets["moodboard-plate"]).toMatchObject({
      use: "production",
      file: p.assets.moodboard.file,
    });
    expect(next.assets.moodboard.use).toBe("reference");
    const added = ok(p, {
      op: "add-graphic",
      layerId: "second-card",
      moduleId: "version-gen-image",
      track: "new",
      startFrame: 60,
      durationFrames: 30,
      allowInspirationAsInput: true,
    });
    expect(added.layers.find((l) => l.id === "second-card")).toMatchObject({
      parameters: { still: "asset:moodboard-plate" },
    });
  });
});
