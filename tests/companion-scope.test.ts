import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GenobiApi, studioUrl } from "../mcp/api";
import { agentStudio } from "./agent-harness";
import { input } from "./server-harness";
import { wav } from "./audio-fixtures";

type Studio = Awaited<ReturnType<typeof agentStudio>>;
async function setup() {
  const studio = await agentStudio();
  studio.bfl.media = new Uint8Array(
    await readFile("tests/fixtures/metadata.mp4"),
  );
  studio.bfl.ready = true;
  return studio;
}
async function finished(studio: Studio, cookie: string, origin?: "cli") {
  const headers = { cookie, ...(origin ? { "X-Genobi-Client": origin } : {}) };
  const response = await fetch(`${studio.base}/api/jobs`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(input),
  });
  expect(response.status).toBe(202);
  const id = (await response.json()).job.id as string;
  const polled = await fetch(`${studio.base}/api/jobs/${id}`, { headers });
  expect((await polled.json()).job.status).toBe("Ready");
  return id;
}
async function companion(
  studio: Studio,
  jobId: string,
  suffix: string,
  owner?: string,
) {
  const job = studio.store.data.jobs.find((j) => j.id === jobId)!;
  const id = `${jobId}-audio-${suffix}`;
  const filePath = path.join(studio.store.directory, "media", `${id}.wav`);
  await writeFile(filePath, wav(1));
  studio.store.data.sources.push({
    id,
    sessionId: owner ?? job.sessionId,
    filePath,
    label: "Wet",
    url: `/api/clips/${id}`,
    mediaType: "audio",
    contentType: "audio/wav",
    width: 0,
    height: 0,
    duration: 1,
    origin: "generated",
  });
  (job.companions ??= []).push({
    assetId: id,
    label: "Wet",
    url: `/api/clips/${id}`,
    contentType: "audio/wav",
  });
  return id;
}
async function status(
  studio: Studio,
  id: string,
  headers: Record<string, string>,
) {
  const response = await fetch(`${studio.base}/api/clips/${id}`, { headers });
  await response.arrayBuffer();
  return response.status;
}

describe("companion media ownership", () => {
  it("extends an active picked-take grant only to its recorded owned outputs and revokes them on Stop", async () => {
    const studio = await setup();
    const person = await studio.fresh();
    const picked = await finished(studio, person);
    const unpicked = await finished(studio, person);
    const good = await companion(studio, picked, "1");
    const unpickedOutput = await companion(studio, unpicked, "1");
    const wrongOwner = await companion(studio, picked, "2", "another-owner");
    const prefixGuess = await companion(studio, picked, "3");
    studio.store.data.jobs.find((j) => j.id === picked)!.companions!.pop();
    const started = await studio.start(person, "grant hang", {
      context: {
        picks: [{ kind: "take", id: picked, media: "video", name: "Picked" }],
      },
    });
    const [, grant] = await studio.waitFor(
      person,
      started.body.id,
      /^grant ([0-9a-f]{24})$/,
    );
    const api = new GenobiApi(studioUrl(studio.base), fetch, true, grant);
    expect(await api.bytes(`/api/clips/${good}`, 20_000)).toEqual(wav(1));
    for (const id of [unpickedOutput, wrongOwner, prefixGuess])
      await expect(api.bytes(`/api/clips/${id}`, 20_000)).rejects.toMatchObject(
        { status: 404 },
      );
    await studio.call(person, `/sessions/${started.body.id}/stop`, {
      method: "POST",
    });
    await studio.settle(person, started.body.id);
    await expect(api.bytes(`/api/clips/${good}`, 20_000)).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("lets a local studio read a shared terminal take's audio without sharing unrelated or foreign sources", async () => {
    const studio = await setup();
    const person = await studio.fresh();
    const terminal = await studio.fresh();
    const id = await finished(studio, terminal, "cli");
    const good = await companion(studio, id, "1");
    const wrongOwner = await companion(studio, id, "2", "another-owner");
    const prefixGuess = await companion(studio, id, "3");
    studio.store.data.jobs.find((j) => j.id === id)!.companions!.pop();
    expect(await status(studio, good, { cookie: person })).toBe(200);
    for (const source of [wrongOwner, prefixGuess])
      expect(await status(studio, source, { cookie: person })).toBe(404);
    const history = await (
      await fetch(`${studio.base}/api/history`, { headers: { cookie: person } })
    ).json();
    expect(
      history.sources.map((source: { id: string }) => source.id),
    ).toContain(good);
    expect(
      history.sources.map((source: { id: string }) => source.id),
    ).not.toContain(wrongOwner);
    for (const marks of <Record<string, string>[]>[
      { "X-Genobi-Client": "cli" },
      { "X-Genobi-Client": "mcp" },
      { "X-Genobi-Agent-Session": "1" },
    ])
      expect(await status(studio, good, { cookie: person, ...marks })).toBe(
        404,
      );
    studio.store.data.jobs.find((j) => j.id === id)!.mediaAvailable = false;
    expect(await status(studio, good, { cookie: person })).toBe(404);
  });
});
