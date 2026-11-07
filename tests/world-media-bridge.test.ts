import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { attachAgentMedia } from "../src/world-builder/agent-media";
import { createSceneMedia } from "../src/world-builder/scene-media";
import type { SceneAdapter } from "../src/world-builder/scene-adapter";
import { worldCommand } from "../shared/world-control";
import { defaultRecipe } from "../src/world-builder/recipe";

afterEach(() => vi.unstubAllGlobals());
const command = {
  op: "attach-media" as const,
  requestId: "00000000-0000-4000-8000-000000000002",
  copyId: "studio.abcdefghjk",
  assetId: "sound",
  target: "audio",
  expectedRevision: "00000000-0000-4000-8000-000000000001:0",
};
const bytes = Buffer.from("inspected-by-server");
function adapter() {
  let revision = command.expectedRevision;
  const configure = vi.fn(async (_recipe, guard) => {
    if (guard.expectedRevision !== revision) throw new Error("scene changed");
    revision += "1";
    return structuredClone(defaultRecipe);
  });
  const surface = vi.fn(async (_target, _blob, guard) => {
    if (guard.expectedRevision !== revision) throw new Error("scene changed");
    revision += "1";
  });
  return {
    api: {
      getRecipeRevision: () => revision,
      getRecipe: () => structuredClone(defaultRecipe),
      configure,
      setSurface: surface,
    } as unknown as SceneAdapter,
    configure,
    surface,
    edit: () => {
      revision += "1";
    },
  };
}
function serve(type = "audio/wav", before = () => {}) {
  const fetcher = vi.fn(async () => {
    before();
    return new Response(bytes, {
      headers: {
        "Content-Type": type,
        "X-Content-SHA256": createHash("sha256").update(bytes).digest("hex"),
      },
    });
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

it("passes the exact revision to audio and texture commits and returns their source hash", async () => {
  const audio = adapter();
  serve();
  expect(
    await attachAgentMedia(audio.api, command, "/api/world/paired/media"),
  ).toMatchObject({
    assetId: "sound",
    target: "audio",
    sha256: expect.any(String),
    byteLength: bytes.length,
  });
  expect(audio.configure.mock.calls[0][1]).toMatchObject({
    expectedRevision: command.expectedRevision,
    sound: { label: "sound" },
  });
  const texture = adapter();
  serve("image/png");
  await attachAgentMedia(
    texture.api,
    { ...command, target: "prop:subject/all" },
    "/api/world/paired/media",
  );
  expect(texture.surface.mock.calls[0][2]).toEqual({
    expectedRevision: command.expectedRevision,
  });
});

it("refuses stale scenes before fetching and edits during the media read before committing", async () => {
  const stale = adapter();
  stale.edit();
  const fetcher = serve();
  await expect(
    attachAgentMedia(stale.api, command, "/api/world/paired/media"),
  ).rejects.toThrow("changed");
  expect(fetcher).not.toHaveBeenCalled();
  const changed = adapter();
  serve("audio/wav", changed.edit);
  await expect(
    attachAgentMedia(changed.api, command, "/api/world/paired/media"),
  ).rejects.toThrow("changed");
});

it("rejects a texture guard after decode without replacing the prior texture", async () => {
  const close = vi.fn();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 16, height: 16, close })),
  );
  const media = createSceneMedia();
  const blob = new Blob([bytes], { type: "image/png" });
  await media.load("screen/all", blob);
  const before = media.texture("screen/all");
  await expect(
    media.load("screen/all", blob, () => {
      throw new Error("scene changed");
    }),
  ).rejects.toThrow("changed");
  expect(media.texture("screen/all")).toBe(before);
  expect(close).toHaveBeenCalledTimes(1);
  media.dispose();
});

it("accepts the actual named primitive and playground surface identifiers", () => {
  for (const target of [
    "audio",
    "screen/all",
    "prop:subject/all",
    "world:box-a/all",
  ])
    expect(worldCommand.parse({ ...command, target }).op).toBe("attach-media");
  expect(
    worldCommand.safeParse({ ...command, target: "world:bad target/all" })
      .success,
  ).toBe(false);
});
