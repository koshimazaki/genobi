import { randomUUID } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_LINEAGE } from "../server/project-derived";
import { agentSession, linkedStudio, OUTPUT } from "./derived-media-harness";

// The history check of a handed-in media result (server/project-derived.ts):
// a library clip is public and may be in it, an older result without a
// recorded operation is read from its label, and a history longer than
// MAX_LINEAGE sources is refused rather than walked.
describe("a media result's history at hand-in", () => {
  it("accepts a library clip, reads an older result's label, and caps the walk", async () => {
    const owner = await linkedStudio();
    const agent = await agentSession(owner);
    // The studio's own catalogue, served from this server's public folder.
    const [entry] = JSON.parse(
      await readFile("public/media/gallery.json", "utf8"),
    );
    await writeFile(
      path.join(owner.directory, "media/gallery.json"),
      JSON.stringify([entry]),
    );
    await copyFile(
      path.resolve("public", `.${entry.url}`),
      path.join(owner.directory, `.${entry.url}`),
    );

    const clip = await agent.upload(
      new Uint8Array(await readFile(OUTPUT.trim)),
      "video/mp4",
    );
    const trimmed = await agent.post("/api/media/trim", {
      sourceId: clip,
      start: 0,
      duration: 1,
    });
    expect(trimmed.status).toBe(201);
    const { source } = (await trimmed.json()) as { source: { id: string } };
    const stored = owner.store.data.sources.find((s) => s.id === source.id)!;
    expect(stored.operation).toBe("trim");
    /** A result in the agent's own session with the history given. */
    const forged = (derivedFrom: string[]) => {
      const id = randomUUID();
      owner.store.data.sources.push({
        ...stored,
        id,
        url: `/api/clips/${id}`,
        derivedFrom,
      });
      return id;
    };
    const handIn = async (sourceId: string, baseRevision: number) => {
      const response = await agent.handIn({ sourceId, baseRevision });
      return { status: response.status, ...(await response.json()) };
    };

    // A cut of a library clip goes in; the clip is named as a library input.
    expect(await handIn(forged([entry.id]), 1)).toMatchObject({
      status: 200,
      revision: 2,
      derivation: {
        operation: "trim",
        sources: [{ kind: "video", origin: "library" }],
      },
    });

    // An older result has no recorded operation: its label names it.
    const { operation: _operation, ...older } = stored;
    const id = randomUUID();
    owner.store.data.sources.push({
      ...older,
      id,
      url: `/api/clips/${id}`,
      label: "Joined of Uploaded clip",
      derivedFrom: [clip, clip],
    });
    expect(await handIn(id, 2)).toMatchObject({
      status: 200,
      revision: 3,
      derivation: {
        operation: "concat",
        sources: [
          { kind: "video", origin: "upload" },
          { kind: "video", origin: "upload" },
        ],
      },
    });

    // A chain whose history is the upload plus 64 results is at the cap; one
    // more result in it is refused before anything is read.
    let chain = forged([clip]);
    const links = [chain];
    for (let i = 1; i <= MAX_LINEAGE; i++)
      links.push((chain = forged([chain])));
    expect(MAX_LINEAGE).toBe(64);
    expect(await handIn(links[MAX_LINEAGE], 3)).toMatchObject({
      status: 422,
      code: "take_refused",
      error: expect.stringMatching(/history is too long/),
    });
    expect(await handIn(links[MAX_LINEAGE - 1], 3)).toMatchObject({
      status: 200,
      revision: 4,
    });
  });
});
