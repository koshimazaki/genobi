// The paired agent's route from a World take to the project and back to the
// recipe: send-to-project (the card's Send to Director), the asset label the
// take's name becomes, the recipe op, move-library presets by file name, and
// the CLI's client header. No browser, no encoder: takes are fakes.
import { readdirSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { worldCommand } from "../shared/world-control";
import { assetLabel } from "../shared/director/asset-media";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
} from "../shared/director/types";
import { boundedRecipe, connectWorld } from "../src/world-builder/agent-bridge";
import {
  findLibraryTake,
  sendLibraryTake,
} from "../src/world-builder/send-take";
import {
  libraryEntry,
  type LibraryTake,
} from "../src/world-builder/take-library";
import { builtInPresets, findPreset } from "../src/world-builder/world-presets";
import { presetSummary } from "../src/world-builder/useSceneLibrary";
import { defaultRecipe, presetRecipe } from "../src/world-builder/recipe";
import type { Take } from "../src/world-builder/export-take";
import type { SceneAdapter } from "../src/world-builder/scene-adapter";
import type { AddedAsset, OutputMedia } from "../src/studio/project-assets";
import { projectSummary } from "../mcp/director-tools";
import { GenobiApi, studioUrl } from "../mcp/api";
import { base } from "./house-template-fixtures";

afterEach(() => vi.unstubAllGlobals());

function take(name: string, bytes = 10, audio = false): Take {
  return {
    name,
    video: new Blob([new Uint8Array(bytes)], { type: "video/webm" }),
    first: new Blob(["png"], { type: "image/png" }),
    manifest: new Blob(
      [
        JSON.stringify({
          frameCount: 145,
          duration: 145 / 24,
          recipe: { ...presetRecipe("Studio"), width: 1024, height: 576 },
        }),
      ],
      { type: "application/json" },
    ),
    ...(audio && { audio: new Blob(["wav"], { type: "audio/wav" }) }),
  };
}

const entry = (name: string, id: string, now: number, bytes?: number) =>
  libraryEntry(take(name, bytes, true), now, id);

/** The studio's add, recording what reached it. */
function studio() {
  const added: OutputMedia[] = [];
  const onAsset = vi.fn(async (media: OutputMedia): Promise<AddedAsset> => {
    added.push(media);
    return {
      assetId: `asset-${added.length}`,
      added: true,
      use: media.use,
      filename: media.filename,
    };
  });
  const sizes: unknown[] = [];
  const addTake = vi.fn(
    async (t: Take, size: { width: number; height: number }) => {
      sizes.push(size);
      const video = await onAsset({
        blob: new Blob(["mp4"], { type: "video/mp4" }),
        filename: `${t.name}.mp4`,
        use: "production",
      });
      const audio =
        t.audio &&
        (await onAsset({
          blob: t.audio,
          filename: `${t.name}.wav`,
          use: "production",
        }));
      return { video, audio: audio || undefined };
    },
  );
  return { added, onAsset, addTake, sizes };
}

/** One command through the paired bridge; the tab's answer to it. */
async function bridge(adapter: Partial<SceneAdapter>, command: unknown) {
  const results: { state: string; result: unknown }[] = [];
  let served = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = (data: unknown) =>
        new Response(JSON.stringify(data), { status: 200 });
      if (url.endsWith("/connect"))
        return body({ id: "w1", code: "c".repeat(32) });
      if (url.endsWith("/next")) {
        if (served) return body(null);
        served = true;
        return body({ id: "job", command });
      }
      if (url.endsWith("/commands/job"))
        results.push(JSON.parse(String(init?.body)));
      return body({});
    }),
  );
  const link = await connectWorld(
    { live: { stop: vi.fn() }, ...adapter } as unknown as SceneAdapter,
    () => {},
  );
  await vi.waitFor(() => expect(results).toHaveLength(1));
  link.disconnect();
  return results[0];
}

describe("send-to-project command", () => {
  it("parses a take by id or name and refuses anything else", () => {
    expect(
      worldCommand.parse({ op: "send-to-project", take: "fall-wide" }),
    ).toEqual({ op: "send-to-project", take: "fall-wide" });
    for (const bad of [
      { op: "send-to-project" },
      { op: "send-to-project", take: "" },
      { op: "send-to-project", take: "x".repeat(81) },
      { op: "send-to-project", take: "a", project: "b" },
    ])
      expect(() => worldCommand.parse(bad)).toThrow();
    expect(worldCommand.parse({ op: "recipe" })).toEqual({ op: "recipe" });
    expect(() => worldCommand.parse({ op: "recipe", name: "x" })).toThrow();
  });

  it("finds a take by id, else the newest of that name", async () => {
    // The library is newest first.
    const takes: LibraryTake[] = [
      await entry("fall-wide", "id-new", 3),
      await entry("fall-wide", "id-old", 1),
      await entry("fall-low", "id-low", 2),
    ];
    expect(findLibraryTake(takes, "fall-wide").id).toBe("id-new");
    expect(findLibraryTake(takes, "id-old").id).toBe("id-old");
    expect(() => findLibraryTake(takes, "fall-high")).toThrow(
      'No take named "fall-high" in the library. List the takes first.',
    );
  });

  it("sends the first frame, then the take as MP4 and WAV, and returns each id", async () => {
    const { added, onAsset, addTake, sizes } = studio();
    const t = await libraryEntry(take("fall-wide", 10, true), 1, "id-a");
    const sent = await sendLibraryTake(t, onAsset, addTake);
    expect(added.map((m) => [m.filename, m.use])).toEqual([
      ["fall-wide.png", "reference"],
      ["fall-wide.mp4", "production"],
      ["fall-wide.wav", "production"],
    ]);
    // The MP4 is encoded at the take's own size, not the current recipe's.
    expect(sizes).toEqual([t]);
    expect(sent).toEqual({
      take: { id: "id-a", name: "fall-wide" },
      frame: {
        assetId: "asset-1",
        added: true,
        use: "reference",
        filename: "fall-wide.png",
      },
      video: {
        assetId: "asset-2",
        added: true,
        use: "production",
        filename: "fall-wide.mp4",
      },
      audio: {
        assetId: "asset-3",
        added: true,
        use: "production",
        filename: "fall-wide.wav",
      },
    });
  });

  it("refuses outside the studio and past the media limit before anything lands", async () => {
    const { onAsset, addTake } = studio();
    const t = await entry("big", "id-big", 1, DIRECTOR_MEDIA_BYTES + 1);
    await expect(sendLibraryTake(t, onAsset, addTake)).rejects.toThrow(
      `too large for project assets (${DIRECTOR_MEDIA_LIMIT})`,
    );
    await expect(
      sendLibraryTake(await entry("a", "id-a", 1), undefined, addTake),
    ).rejects.toThrow("Open the studio to send takes.");
    expect(onAsset).not.toHaveBeenCalled();
    expect(addTake).not.toHaveBeenCalled();
  });

  it("runs through the paired bridge and reports a refusal as its error", async () => {
    const result = {
      take: { id: "id-a", name: "fall-wide" },
      frame: { assetId: "asset-1" },
      video: { assetId: "asset-2" },
      audio: null,
    };
    const sendTake = vi.fn(async () => result);
    expect(
      await bridge({ sendTake } as never, {
        op: "send-to-project",
        take: "fall-wide",
      }),
    ).toEqual({ state: "done", result });
    expect(sendTake).toHaveBeenCalledWith("fall-wide");
    expect(
      await bridge({}, { op: "send-to-project", take: "fall-wide" }),
    ).toEqual({
      state: "error",
      result: { error: "Open World Builder to use its library." },
    });
  });
});

describe("asset labels", () => {
  it("are the name a file was added under, or none for an id-named file", () => {
    expect(assetLabel("media/asset-1/fall-wide.mp4")).toBe("fall-wide");
    expect(assetLabel("media/asset-1/world-first-frame.png")).toBe(
      "world-first-frame",
    );
    expect(assetLabel("media/gen-1.mp4")).toBeNull();
    expect(assetLabel("media/asset-1/a b.mp4")).toBeNull();
    expect(assetLabel("modules/x/fall.mp4")).toBeNull();
  });

  it("show in genobi_project's asset listing", () => {
    const { project } = base();
    const [id, asset] = Object.entries(project.assets).find(
      ([, a]) => a.kind === "video",
    )!;
    const summary = projectSummary({
      copyId: "falling.abcdefghjk",
      id: project.id,
      revision: 1,
      updatedAt: "2026-10-29T00:00:00.000Z",
      project: {
        ...project,
        assets: {
          ...project.assets,
          [id]: {
            ...asset,
            file: { ...asset.file, path: `media/${id}/fall-wide.mp4` },
          },
        },
      },
      brief: null,
    });
    expect(summary.assets.find((a) => a.assetId === id)).toMatchObject({
      label: "fall-wide",
      kind: "video",
    });
  });
});

describe("recipe op and presets", () => {
  it("returns the current recipe, refused past 64 KB", async () => {
    const recipe = structuredClone(defaultRecipe);
    expect(
      await bridge(
        {
          getRecipe: () => recipe,
          getRecipeRevision: () => "scene:7",
        } as never,
        { op: "recipe" },
      ),
    ).toEqual({ state: "done", result: { recipe, revision: "scene:7" } });
    expect(() => boundedRecipe({ prompt: "x".repeat(64_001) })).toThrow(
      "Recipe exceeds 64 KB.",
    );
  });

  it("lists every move-library recipe and loads it by its file name", () => {
    const files = readdirSync(
      "custom_nodes/director_world_builder/examples/moves",
    )
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5))
      .sort();
    expect(files).toHaveLength(13);
    const presets = builtInPresets();
    expect(
      presets
        .map((p) => p.file)
        .filter(Boolean)
        .sort(),
    ).toEqual(files);
    for (const file of files) {
      const preset = findPreset(file, []);
      expect(preset.name).toBe(`Move · ${file}`);
      expect(presetSummary(preset)).toMatchObject({ file });
    }
    expect(findPreset("fall-cathedral", []).recipe.cameraShot).toBe("highWide");
    // A saved preset of that exact name still wins over a file name.
    const saved = { ...presets[0], name: "jog", source: "saved" as const };
    expect(findPreset("jog", [saved])).toBe(saved);
    expect(presetSummary(findPreset("Fall · big room", []))).not.toHaveProperty(
      "file",
    );
  });
});

describe("the CLI's client header", () => {
  it("is sent by a CLI connection only, and grants nothing", async () => {
    const seen: Record<string, string>[] = [];
    const fetcher = (async (_: unknown, init?: RequestInit) => {
      seen.push({ ...(init?.headers as Record<string, string>) });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await new GenobiApi(
      studioUrl(),
      fetcher,
      false,
      undefined,
      undefined,
      "cli",
    ).get("/api/health");
    await new GenobiApi(studioUrl(), fetcher).get("/api/health");
    expect(seen.at(0)?.["X-Genobi-Client"]).toBe("cli");
    expect(seen.at(-1)).not.toHaveProperty("X-Genobi-Client");
    expect(seen.at(0)).not.toHaveProperty("X-Genobi-Agent-Session");
  });
});
