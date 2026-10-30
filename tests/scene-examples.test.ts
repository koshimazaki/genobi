import { sceneHandoff } from "../shared/scene/prompts";
import { sceneSubject } from "../shared/scene/subject";
import { SCENES } from "../src/scene3d/scenes";
import { primitiveBounds, wallBounds } from "../shared/scene/bounds";
import { roomAcoustics } from "../shared/scene/acoustics";
import { expect, it } from "vitest";
import { EXAMPLE_IDS, exampleScene } from "../shared/scene/examples";
import { parseScene } from "../shared/scene/parse";
import { applyCommand } from "../shared/scene/commands";
import { sceneVideoPlan } from "../shared/scene/video-plan";
import { danglingLinks } from "../shared/comfy/slots";
import { validatePlayblastReceipt } from "../shared/camera-path-playblast";
import { plateCameraPath } from "../src/scene3d/plate-path";
import { PLATE_BY_ID } from "../src/scene3d/plates";
import { DEFAULT_RIG } from "../src/scene3d/combo";
import { sceneTools } from "../mcp/scene-tools";

it.each(EXAMPLE_IDS)(
  "%s survives file round-trip and produces a valid camera receipt",
  (id) => {
    const scene = exampleScene(id);
    expect(parseScene(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
    expect(scene.objects.length).toBeLessThanOrEqual(200);
    expect(new Set(scene.objects.map((p) => p.id)).size).toBe(
      scene.objects.length,
    );
    const receipt = validatePlayblastReceipt({
      format: "genobi.playblast",
      version: 1,
      scene: scene.id,
      plate: "push-in",
      gestures: [],
      ease: "linear",
      fps: 24,
      frames: 121,
      width: 1280,
      height: 704,
      cameraPath: plateCameraPath(
        PLATE_BY_ID["push-in"],
        scene,
        { ...DEFAULT_RIG, duration: 5 },
        [],
        121,
      ),
    });
    expect(receipt.cameraPath.keys).toHaveLength(121);
  },
);

it("builds hybrids from independently editable parts and preserves revision checks", () => {
  const hybrid = exampleScene("exploded-house", {
    surroundings: "forest",
    cast: "pair",
  });
  expect(hybrid.objects.some((p) => p.id === "roof")).toBe(true);
  expect(hybrid.objects.some((p) => p.id === "extra-tree-0-trunk")).toBe(true);
  expect(hybrid.characters).toHaveLength(2);
  const changed = applyCommand(
    hybrid,
    { op: "set-primitive", id: "roof", position: [0, 11, 0] },
    0,
  );
  expect(changed.objects.find((p) => p.id === "roof")?.position).toEqual([
    0, 11, 0,
  ]);
  expect(hybrid.objects.find((p) => p.id === "roof")?.position).toEqual([
    0, 9, 0,
  ]);
  expect(() =>
    applyCommand(changed, { op: "set-characters", characters: [] }, 0),
  ).toThrow(/revision/);
  expect(
    applyCommand(changed, { op: "set-characters", characters: [] }, 1)
      .characters,
  ).toEqual([]);
});

it("bounds character inputs and rejects arbitrary asset URLs", () => {
  const scene = exampleScene("forest-meeting");
  const actor = scene.characters![0];
  for (const patch of [
    { asset: "https://example.com/model.glb" },
    { position: [501, 0, 0] },
    { pose: "eval" },
    { scale: 10 },
    { script: "alert(1)" },
  ])
    expect(() =>
      parseScene({ ...scene, characters: [{ ...actor, ...patch }] }),
    ).toThrow();
  expect(() =>
    parseScene({
      ...scene,
      characters: Array.from({ length: 9 }, () => actor),
    }),
  ).toThrow(/eight/);
  expect(() => parseScene({ ...scene, characters: [actor, actor] })).toThrow(
    /Duplicate/,
  );
  const room = exampleScene("house-interior");
  expect(() =>
    parseScene({ ...room, characters: [{ ...actor, position: [100, 0, 0] }] }),
  ).toThrow(/inside/);
});

it.each(["cathedral", "forest", "neo-tokyo-street"] as const)(
  "prepares a linked image-conditioned AKUSPACE workflow for %s",
  (id) => {
    const scene = exampleScene(id);
    const plan = sceneVideoPlan(scene, {
      duration: 5,
      firstFrame: "frame.png",
      referenceAudio: "dry.wav",
    });
    expect(plan.submitted).toBe(false);
    expect(plan.conditioning).toBe("first-frame-image");
    expect(plan.cameraConditioning).toBe("prompt-only");
    expect(danglingLinks(plan.graph)).toEqual([]);
    const inputs = (node: string) =>
      (plan.graph[node] as { inputs: Record<string, unknown> }).inputs;
    expect(inputs("90").image).toBe("frame.png");
    expect(inputs("40").audio).toBe("dry.wav");
    expect(inputs("30").value).toBe(121);
    expect(inputs("41").duration).toBe(121 / 24);
    expect(inputs("2").strength_model).toBe(1);
    expect(inputs("2").lora_name).toBe("akuspace-ltx25-v0.5.safetensors");
    expect(inputs("51").video_cfg).toBe(1);
    expect(inputs("81").audio_cfg).toBe(1);
    expect(plan.treatment.mode).toBe(id === "cathedral" ? "room" : "outside");
    if (id === "neo-tokyo-street")
      expect(inputs("12").application).toBe("Night");
    if (id === "forest") expect(inputs("12").application).toBe("Day");
  },
);

it("refuses handoff paths and keeps every new MCP action stateless", async () => {
  const api = {} as Parameters<(typeof sceneTools)[0]["run"]>[0];
  const run = (args: Record<string, unknown>) => sceneTools[0].run(api, args);
  expect(await run({ action: "examples" })).toHaveProperty("examples");
  const doc = await run({ action: "example", example: "forest", cast: "pair" });
  const plan = await run({ action: "video-plan", document: doc });
  expect(plan).toHaveProperty("submitted", false);
  expect(() => sceneVideoPlan(doc, { firstFrame: "../private.png" })).toThrow(
    /filename/,
  );
  expect(() =>
    sceneVideoPlan(doc, { referenceAudio: "file:///private.wav" }),
  ).toThrow(/filename/);
});

it("keeps companion scenery outside room boundaries and avoids duplicate environments", () => {
  const cathedral = exampleScene("cathedral");
  for (const surroundings of ["forest", "mountains", "city"]) {
    const scene = exampleScene("cathedral", { surroundings });
    const walls = wallBounds(scene)!;
    for (const p of scene.objects.filter((p) => p.id?.startsWith("extra-")))
      expect(primitiveBounds(p).min[0]).toBeGreaterThan(walls.max[0]);
    expect(roomAcoustics(scene)?.rt60Mid).toBe(
      roomAcoustics(cathedral)?.rt60Mid,
    );
  }
  for (const [id, surroundings] of [
    ["forest", "forest"],
    ["city-meeting", "city"],
    ["mountains", "mountains"],
  ])
    expect(exampleScene(id, { surroundings }).objects).toEqual(
      exampleScene(id).objects,
    );
});

it("keeps the abstract default and allows an actor in place of its hero", () => {
  const abstract = SCENES[0];
  expect(sceneSubject(abstract, "saved")).toBe(abstract);
  expect(abstract.characters).toBeUndefined();
  const actor = sceneSubject(abstract, "mannequin");
  expect(actor.characters).toHaveLength(1);
  expect(sceneHandoff(actor)).toContain("lead (mannequin, 1.8 m), idle");
  expect(actor.characters![0].asset).toBe("mannequin");
  expect(actor.objects.some((p) => p.hero)).toBe(false);
  expect(abstract.objects.some((p) => p.hero)).toBe(true);
  expect(sceneSubject(actor, "blob").characters).toEqual([]);
});

it("offers a mixed mannequin/dog starter with editable poses and CC0 handoff credits", async () => {
  const { sceneVideoReadme } = await import("../shared/scene/video-plan");
  const scene = exampleScene("forest-companion");
  expect(scene.characters?.map((c) => c.asset)).toEqual(["mannequin", "pug"]);
  expect(sceneHandoff(scene)).toContain("pet (pug, 0.55 m)");
  const pair = exampleScene("forest-companion", { cast: "pair" }).characters!;
  const pet = pair.find((c) => c.asset === "pug")!;
  for (const human of pair.filter((c) => c.asset === "mannequin"))
    expect(
      Math.hypot(
        human.position[0] - pet.position[0],
        human.position[2] - pet.position[2],
      ),
    ).toBeGreaterThan(1.5);
  expect(parseScene(JSON.parse(JSON.stringify(scene)))).toEqual(scene);
  const changed = applyCommand(
    scene,
    {
      op: "set-characters",
      characters: scene.characters?.map((c) =>
        c.asset === "pug" ? { ...c, pose: "walk" } : c,
      ),
    },
    0,
  );
  expect(changed.characters?.[1].pose).toBe("walk");
  expect(sceneVideoReadme(changed, sceneVideoPlan(changed))).toContain(
    "Pug by Quaternius",
  );
  expect(exampleScene("forest-companion", { cast: "none" }).characters).toEqual(
    [],
  );
});

it("keeps subject replacement captions consistent with the actual cast", () => {
  const mixed = exampleScene("forest-companion");
  const humans = sceneSubject(mixed, "mannequin");
  expect(humans.characters?.every((c) => c.asset === "mannequin")).toBe(true);
  expect(sceneVideoPlan(humans).prompt).not.toContain("dog");
  const dogs = sceneSubject(mixed, "pug");
  expect(
    dogs.characters?.every((c) => c.asset === "pug" && c.pose === "idle"),
  ).toBe(true);
  expect(sceneVideoPlan(dogs).prompt).toContain("dog figures");
});
