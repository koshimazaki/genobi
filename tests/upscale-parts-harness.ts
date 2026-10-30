// The split upscale's service tests: the real job service and a fake BFL that
// counts submissions; the media work (cut, join) is faked, so nothing needs
// ffmpeg and nothing leaves the test.
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { JobService } from "../server/jobs";
import { ServerKeys } from "../server/keys";
import { probeVideo } from "../server/media";
import { UpscalePartsService, type PartMedia } from "../server/upscale-parts";
import { Store, type StoredSource } from "../server/store";
import { planParts } from "../shared/upscale-parts";
import type { Source } from "../shared/types";
import { FakeBfl, input } from "./server-harness";

export const fixture = path.resolve("tests/fixtures/metadata.mp4");
const folders: string[] = [];
afterEach(async () => {
  for (const folder of folders.splice(0))
    await rm(folder, { recursive: true, force: true });
});

export async function partsSetup() {
  // These tests call services directly; no HTTP listener is needed.
  const directory = await mkdtemp(path.join(tmpdir(), "upscale-parts-test-"));
  folders.push(directory);
  const store = new Store(directory);
  await store.load();
  const bfl = new FakeBfl();
  const service = new JobService(
    store,
    directory,
    ServerKeys.single("test-server-key"),
    { bfl, comfy: bfl },
  );
  const app = { store, service, bfl };
  const session = "11111111-2222-4333-8444-555555555555";
  const stored = async (id: string, extra: Partial<StoredSource> = {}) => {
    const filePath = path.join(store.directory, "media", `${id}.mp4`);
    await copyFile(fixture, filePath);
    const source: StoredSource = {
      id,
      sessionId: session,
      filePath,
      url: `/api/clips/${id}`,
      label: id,
      origin: "upload",
      ...(await probeVideo(filePath)),
      ...extra,
    };
    store.data.sources.push(source);
    return source;
  };
  // The Dimensions mix's length; the file itself is the short fixture.
  await stored("mix-source", { duration: 23.125 });
  const joins: string[][] = [];
  const media: PartMedia = {
    plan: async (_from, limits) => ({
      plan: planParts(555, 24, limits.partSeconds, limits.maxSeconds),
    }),
    cut: async (_from, plan) =>
      Promise.all(
        plan.parts.map((part) =>
          stored(`cut-${part.index}`, { origin: "derived" }),
        ),
      ),
    join: async (parts, original) => {
      joins.push([...parts.map((p) => p.source.id), original.source.id]);
      return (await stored("joined", { origin: "derived" })) as Source;
    },
  };
  const parts = new UpscalePartsService(service, media);
  const request = { ...input, generator: "upscale", sourceId: "mix-source" };
  return { ...app, session, parts, request, joins };
}

export const sent = (app: Awaited<ReturnType<typeof partsSetup>>) =>
  app.bfl.submissions;
