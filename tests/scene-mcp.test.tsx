import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { sceneTools } from "../mcp/scene-tools";
import { tools } from "../mcp/tools";
import { GENOBI_TOOLS } from "../server/agent-runner";
import { roomAcoustics } from "../shared/scene/acoustics";
import { parseScene } from "../shared/scene/parse";
import type { SceneSpec } from "../shared/scene/types";
import { readSceneFile, SceneFile } from "../src/scene3d/SceneFile";
import { AcousticsReadout } from "../src/scene3d/AcousticsReadout";
import { SCENES } from "../src/scene3d/scenes";
import { mediumRoom } from "./scene-fixtures";

const tool = sceneTools[0];
const api = {} as Parameters<typeof tool.run>[0];
const run = (args: Record<string, unknown>) => tool.run(api, args);
const room = {
  width: 7,
  length: 9,
  height: 3.2,
  wallMaterial: "plaster",
  floorMaterial: "wood",
  ceilingMaterial: "plaster",
};

describe("genobi_scene", () => {
  it("is stateless, read-only, never paid and reaches agent sessions", () => {
    expect(tool.name).toBe("genobi_scene");
    expect(tool.annotations.readOnlyHint).toBe(true);
    expect(tool.paid).toBeUndefined();
    expect(tools.map((t) => t.name)).toContain("genobi_scene");
    expect(GENOBI_TOOLS).toContain("genobi_scene");
  });

  it("creates, adds a room, edits with the current revision and reads acoustics", async () => {
    const created = (await run({
      action: "create",
      id: "rehearsal",
      label: "Rehearsal",
    })) as SceneSpec;
    expect(created.revision).toBe(0);
    await expect(
      run({ action: "room", document: created, revision: 3, room }),
    ).rejects.toThrow(/revision/);
    const roomed = (await run({
      action: "room",
      document: created,
      revision: 0,
      room,
    })) as SceneSpec;
    expect(roomed.objects.filter((p) => p.role)).toHaveLength(6);
    const edited = (await run({
      action: "edit",
      document: roomed,
      revision: 1,
      command: { op: "set-camera", scale: 0.4 },
    })) as SceneSpec;
    expect(edited).toMatchObject({ revision: 2, scale: 0.4 });
    expect(await run({ action: "acoustics", document: edited })).toEqual(
      roomAcoustics(edited),
    );
    const moved = (await run({
      action: "acoustics",
      document: edited,
      listener: [1, 1.2, 1],
    })) as { listener: number[] };
    expect(moved.listener).toEqual([1, 1.2, 1]);
  });

  it("inspects, hands off text and refuses invalid documents", async () => {
    const doc = mediumRoom();
    const inspected = (await run({ action: "inspect", document: doc })) as {
      document: SceneSpec;
      capabilities: Record<string, unknown>;
    };
    expect(inspected.document).toEqual(doc);
    expect(inspected.capabilities).toMatchObject({
      runsCode: false,
      appliesToAudio: false,
    });
    const handoff = (await run({ action: "handoff", document: doc })) as {
      text: string;
    };
    expect(handoff.text).toMatch(/plaster walls/);
    expect(
      await run({ action: "acoustics", document: SCENES[0] }),
    ).toMatchObject({ acoustics: null });
    await expect(
      run({
        action: "inspect",
        document: { ...doc, objects: [{ shape: "mesh" }] },
      }),
    ).rejects.toThrow();
  });
});

describe("Load scene", () => {
  const file = (text: string) => new Blob([text], { type: "application/json" });

  it("loads a saved scene and refuses a bad file with its reason", async () => {
    const doc = mediumRoom();
    expect(await readSceneFile(file(JSON.stringify(doc, null, 2)))).toEqual(
      doc,
    );
    await expect(readSceneFile(file("{nope"))).rejects.toThrow(/not JSON/);
    await expect(
      readSceneFile(file(JSON.stringify({ ...doc, version: 9 }))),
    ).rejects.toThrow(/version 1/);
    await expect(readSceneFile(file(" ".repeat(300_000)))).rejects.toThrow(
      /at most 256 KB/,
    );
  });

  it("shows the refusal in place beside the picker", () => {
    const html = renderToStaticMarkup(
      <SceneFile
        scene={SCENES[0]}
        error={'Unknown material "velvet"'}
        onFile={() => {}}
      />,
    );
    expect(html).toContain("Load scene");
    expect(html).toContain("Save scene");
    expect(html).toContain('accept=".json,application/json"');
    expect(html).toMatch(/role="alert">Not loaded: Unknown material/);
    expect(
      renderToStaticMarkup(
        <SceneFile scene={SCENES[0]} error={null} onFile={() => {}} />,
      ),
    ).not.toContain("alert");
  });

  it("reads a room's acoustics as text, and says why an open set has none", () => {
    const html = renderToStaticMarkup(
      <AcousticsReadout scene={parseScene(mediumRoom())} />,
    );
    expect(html).toContain("RT60 mid");
    expect(html).toContain("Medium room");
    expect(
      renderToStaticMarkup(<AcousticsReadout scene={SCENES[0]} />),
    ).toContain("No walls");
  });
});
