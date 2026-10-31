import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import type { Project } from "../shared/director/types";
import { studio } from "./project-copy-harness";
import { mcpAgent } from "./mcp-agent-harness";
import { input } from "./server-harness";
import { wav } from "./audio-fixtures";

it("discovers and imports an explicitly selected take companion with both membership and source ownership checks", async () => {
  const owner = await studio();
  await owner.upload(owner.cookie);
  await owner.push(owner.cookie, null, 1);
  owner.bfl.media = new Uint8Array(
    await readFile("tests/fixtures/metadata.mp4"),
  );
  owner.bfl.ready = true;
  const agent = await mcpAgent(owner.base);
  const { code } = await owner.send(
    owner.cookie,
    `/${owner.project.id}/link`,
    "POST",
  );
  const { copyId } = await agent.json("genobi_link_project", { code });
  const quote = await agent.json("genobi_quote", input);
  const made = await agent.json("genobi_submit", {
    ...input,
    quoteId: quote.quoteId,
    idempotencyKey: "companion-source-0001",
  });
  expect(await agent.json("genobi_job", { id: made.id })).toMatchObject({
    status: "Ready",
  });
  const job = owner.store.data.jobs.find((j) => j.id === made.id)!;
  const filePath = path.join(owner.directory, "media", "companion.wav");
  await writeFile(filePath, wav(1));
  const id = `${job.id}-audio-10`;
  const foreign = `${job.id}-audio-11`;
  for (const [sourceId, sessionId] of [
    [id, job.sessionId],
    [foreign, "different-session"],
    ["unrelated-output", job.sessionId],
  ]) {
    owner.store.data.sources.push({
      id: sourceId,
      sessionId,
      filePath,
      label: "Wet",
      url: `/api/clips/${sourceId}`,
      mediaType: "audio",
      contentType: "audio/wav",
      origin: "generated",
      width: 0,
      height: 0,
      duration: 1,
    });
  }
  job.companions = [id, foreign].map((assetId) => ({
    assetId,
    label: "Wet",
    url: `/api/clips/${assetId}`,
    mediaType: "audio",
    contentType: "audio/wav",
  }));
  await owner.store.save();

  const take = await agent.json("genobi_take", { id: job.id });
  expect(take.outputs[0].assetId).toBe(job.id);
  expect(take.outputs[1]).toMatchObject({
    assetId: id,
    mediaType: "audio",
    contentType: "audio/wav",
    label: "Wet",
    available: true,
  });
  expect((await agent.json("genobi_job", { id: job.id })).outputs).toEqual(
    take.outputs,
  );
  for (const outputId of ["unrelated-output", foreign]) {
    const refused = await agent.call("genobi_take_to_project", {
      id: job.id,
      outputId,
      copyId,
      baseRevision: 1,
    });
    expect(refused.error).toBe(true);
    expect(refused.text).toContain("take_missing");
  }
  const primary = await agent.json("genobi_take_to_project", {
    id: job.id,
    copyId,
    baseRevision: 1,
  });
  expect(primary).toMatchObject({ kind: "video", revision: 2 });
  const audio = await agent.json("genobi_take_to_project", {
    id: job.id,
    outputId: id,
    copyId,
    baseRevision: 2,
  });
  expect(audio).toMatchObject({ kind: "audio", revision: 3, added: true });
  expect(audio.next).toContain("add-clip");
  expect(audio.next).toContain("audio track");
  expect(audio.assetId).not.toBe(primary.assetId);
  const again = await agent.json("genobi_take_to_project", {
    id: job.id,
    outputId: id,
    copyId,
    baseRevision: 1,
  });
  expect(again).toMatchObject({
    assetId: audio.assetId,
    kind: "audio",
    added: false,
  });
  const stored = (await owner.send(owner.cookie, `/${owner.project.id}`))
    .project as Project;
  expect(stored.assets[audio.assetId]).toMatchObject({
    kind: "audio",
    durationSeconds: 1,
  });
  expect(stored.assets[primary.assetId].kind).toBe("video");
});
