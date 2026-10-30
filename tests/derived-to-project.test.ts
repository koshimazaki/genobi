import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { commandTool, describeTool } from "../cli/commands";
import type { Project } from "../shared/director/types";
import { renderReport } from "../shared/licensing/render-report";
import { validateProject } from "../src/director/validate";
import { wav } from "./audio-fixtures";
import {
  agentOn,
  agentSession,
  linkedStudio,
  OUTPUT,
  type Owner,
} from "./derived-media-harness";
import { hasFfmpeg } from "./ffmpeg-harness";
import { base } from "./house-template-fixtures";
import { input } from "./server-harness";

// Box 2.3: an agent places its own cuts in the person's project. A trim,
// join, crossfade or room made by the local media tools in the agent's own
// session is handed in by its sourceId like a take: copied into the linked
// copy as a production asset, with a record of the operation and its inputs.
// Every step of its history must be the agent's own media or a library clip.
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const read = async (owner: Owner) =>
  (await owner.send(owner.cookie, `/${owner.project.id}`)).project as Project;

/** A finished take in the agent's own session, from the fake provider. */
async function take(
  agent: Awaited<ReturnType<typeof agentOn>>,
  owner: Owner,
  key: string,
) {
  owner.bfl.media = new Uint8Array(
    await readFile(path.resolve("tests/fixtures/metadata.mp4")),
  );
  owner.bfl.ready = true;
  const quote = await agent.json("genobi_quote", input);
  const job = await agent.json("genobi_submit", {
    ...input,
    quoteId: quote.quoteId,
    idempotencyKey: key,
  });
  expect((await agent.json("genobi_job", { id: job.id })).status).toBe("Ready");
  return job.id as string;
}

describe("genobi_take_to_project with a media tool's result", () => {
  it("hands in a trim, then a join of it, naming each input the project holds", async () => {
    const owner = await linkedStudio();
    const agent = await agentOn(owner.base);
    try {
      const { copyId } = await agent.json("genobi_link_project", {
        code: await owner.code(),
      });
      const jobId = await take(agent, owner, "derived-run-0001");
      const taken = await agent.json("genobi_take_to_project", {
        id: jobId,
        copyId,
        baseRevision: 1,
      });
      expect(taken).toMatchObject({ assetId: `take-${jobId}`, revision: 2 });
      expect(taken.derivation).toBeUndefined();

      const trim = await agent.json("genobi_media_trim", {
        sourceId: jobId,
        start: 0,
        duration: 1,
      });
      const cut = await agent.json("genobi_take_to_project", {
        sourceId: trim.sourceId,
        copyId,
        baseRevision: 2,
      });
      expect(cut).toEqual({
        assetId: `derived-${trim.sourceId}`,
        revision: 3,
        added: true,
        derivation: {
          operation: "trim",
          sources: [{ kind: "video", origin: "take", assetId: taken.assetId }],
        },
        next: expect.stringContaining("replace-plate"),
      });

      // The person's copy holds the cut's own bytes, measured, with a record.
      let project = await read(owner);
      const clip = await readFile(OUTPUT.trim);
      expect(project.assets[cut.assetId]).toMatchObject({
        kind: "video",
        use: "production",
        origin: "generated",
        file: { path: `media/${cut.assetId}.mp4`, sha256: sha(clip) },
      });
      expect(project.assets[cut.assetId].durationSeconds).toBeCloseTo(2, 1);
      expect(project.generations.at(-1)).toMatchObject({
        id: project.assets[cut.assetId].generationId,
        inputAssetIds: [taken.assetId],
        outputAssetIds: [cut.assetId],
        tool: "Genobi trim (local media tools), handed in by an agent",
        prompt: expect.stringMatching(/^Trim of /),
        derivation: cut.derivation,
      });
      const bytes = await fetch(
        `${owner.base}/api/projects/${owner.project.id}/files/${sha(clip)}`,
        { headers: { cookie: owner.cookie } },
      );
      expect(Buffer.from(await bytes.arrayBuffer()).equals(clip)).toBe(true);

      // A join of the cut and the take: both inputs are already there.
      const joined = await agent.json("genobi_media_concat", {
        sourceIds: [trim.sourceId, jobId],
      });
      const join = await agent.json("genobi_take_to_project", {
        sourceId: joined.sourceId,
        copyId,
        baseRevision: 3,
      });
      expect(join.derivation).toEqual({
        operation: "concat",
        sources: [
          { kind: "video", origin: "derived", assetId: cut.assetId },
          { kind: "video", origin: "take", assetId: taken.assetId },
        ],
      });
      project = await read(owner);
      expect(project.generations.at(-1)!.inputAssetIds).toEqual([
        cut.assetId,
        taken.assetId,
      ]);

      // The same result again names the same asset, with its record.
      expect(
        await agent.json("genobi_take_to_project", {
          sourceId: joined.sourceId,
          copyId,
          baseRevision: 4,
        }),
      ).toMatchObject({
        assetId: join.assetId,
        added: false,
        derivation: join.derivation,
      });

      // The Director takes it as any clip: on a new track, then in the render.
      const placed = await agent.call("genobi_director_command", {
        copyId,
        baseRevision: 4,
        command: {
          op: "add-clip",
          layerId: "joined",
          assetId: join.assetId,
          track: "new",
          startFrame: 30,
          durationFrames: 24,
        },
      });
      expect(placed.error, placed.text).toBe(false);
      project = await read(owner);
      expect(project.layers.find((l) => l.id === "joined")).toMatchObject({
        kind: "video",
        assetId: join.assetId,
      });
      // Every input is in the project, so nothing about the cut goes unrecorded.
      expect(renderReport(project).gaps.join(" ")).not.toMatch(/outside/);
      expect(owner.bfl.submissions).toBe(1);
    } finally {
      await agent.close();
    }
  });

  it("hands in an audio trim, which an audio track takes", async () => {
    const owner = await linkedStudio();
    const agent = await agentOn(owner.base);
    const folder = await mkdtemp(path.join(os.tmpdir(), "genobi-derived-"));
    try {
      const { copyId } = await agent.json("genobi_link_project", {
        code: await owner.code(),
      });
      const track = path.join(folder, "track.wav");
      await writeFile(track, wav(4));
      const { sourceId } = await agent.json("genobi_audio_upload", {
        filePath: track,
      });
      const trim = await agent.json("genobi_media_trim", {
        sourceId,
        start: 1,
        duration: 2,
      });
      expect(trim.kind).toBe("audio");
      const cut = await agent.json("genobi_take_to_project", {
        sourceId: trim.sourceId,
        copyId,
        baseRevision: 1,
      });
      // The upload is not in the project, so the input has no asset.
      expect(cut).toMatchObject({
        revision: 2,
        added: true,
        derivation: {
          operation: "trim",
          sources: [{ kind: "audio", origin: "upload" }],
        },
        next: expect.stringContaining("add-clip"),
      });
      let project = await read(owner);
      expect(project.assets[cut.assetId]).toMatchObject({
        kind: "audio",
        use: "production",
        file: { path: `media/${cut.assetId}.wav` },
        durationSeconds: OUTPUT.audioSeconds,
      });
      expect(project.generations.at(-1)!.inputAssetIds).toEqual([]);

      const placed = await agent.call("genobi_director_command", {
        copyId,
        baseRevision: 2,
        command: {
          op: "add-clip",
          layerId: "cut-audio",
          assetId: cut.assetId,
          track: "new",
          startFrame: 0,
          durationFrames: 30,
        },
      });
      expect(placed.error, placed.text).toBe(false);
      project = await read(owner);
      expect(project.layers.find((l) => l.id === "cut-audio")).toMatchObject({
        kind: "audio",
        assetId: cut.assetId,
      });
      expect(renderReport(project).gaps).toContain(
        "A trim was made from media outside this project; the models behind that media are not recorded here.",
      );
    } finally {
      await agent.close();
      await rm(folder, { recursive: true, force: true });
    }
  });

  it("refuses another session's result, one built from foreign media, and what is not a result", async () => {
    const owner = await linkedStudio();
    const agent = await agentSession(owner);
    const audio = "audio/wav";
    const trimOf = async (cookie: string, sourceId: string) => {
      const response = await fetch(`${owner.base}/api/media/trim`, {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, start: 0, duration: 1 }),
      });
      expect(response.status).toBe(201);
      return ((await response.json()) as { source: { id: string } }).source.id;
    };
    const refused = async (body: Record<string, unknown>) => {
      const response = await agent.handIn({ ...body, baseRevision: 1 });
      return {
        status: response.status,
        ...((await response.json()) as { code?: string; error?: string }),
      };
    };

    // The person's own upload and cut: not the agent's to hand in.
    const upload = await fetch(`${owner.base}/api/uploads`, {
      method: "POST",
      headers: { cookie: owner.cookie, "Content-Type": audio },
      body: wav(4),
    });
    const theirs = ((await upload.json()) as { source: { id: string } }).source
      .id;
    const theirCut = await trimOf(owner.cookie, theirs);
    expect(await refused({ sourceId: theirCut })).toMatchObject({
      status: 404,
    });

    // A result in the agent's session whose history names the person's media,
    // directly or one step down, is refused; so is one with no history.
    const ownCut = await trimOf(
      agent.cookie,
      await agent.upload(wav(4), audio),
    );
    const stored = owner.store.data.sources.find((s) => s.id === ownCut)!;
    const forged = (derivedFrom?: string[]) => {
      const id = randomUUID();
      owner.store.data.sources.push({
        ...stored,
        id,
        url: `/api/clips/${id}`,
        derivedFrom,
      });
      return id;
    };
    const direct = forged([theirs]);
    const nested = forged([forged([ownCut, theirCut])]);
    const orphan = forged(undefined);
    for (const sourceId of [direct, nested, orphan])
      expect(await refused({ sourceId }), sourceId).toMatchObject({
        status: 403,
        code: "derived_foreign",
      });

    // An upload is not a result; a frame is a still; one of id or sourceId.
    const video = new Uint8Array(await readFile(OUTPUT.trim));
    const clip = await agent.upload(video, "video/mp4");
    expect(await refused({ sourceId: clip })).toMatchObject({
      status: 400,
      code: "not_derived",
    });
    const frames = await agent.post("/api/media/frames", {
      sourceId: clip,
      times: [0.5],
    });
    const [frame] = ((await frames.json()) as { sources: { id: string }[] })
      .sources;
    expect(await refused({ sourceId: frame.id })).toMatchObject({
      status: 400,
      code: "derived_kind",
    });
    for (const body of [
      { jobId: "x", sourceId: ownCut },
      {},
      { sourceId: "../etc" },
    ])
      expect(await refused(body)).toMatchObject({
        status: 400,
        code: "invalid_take",
      });

    // The agent's own cut goes in, and nothing above changed the copy first.
    const fine = await agent.handIn({ sourceId: ownCut, baseRevision: 1 });
    expect(fine.status).toBe(200);
    expect(await fine.json()).toMatchObject({ revision: 2, added: true });
  });

  it("asks for exactly one of id and sourceId, in the tool and the CLI schema", async () => {
    const owner = await linkedStudio();
    const agent = await agentOn(owner.base);
    try {
      for (const args of [{ id: "a-job", sourceId: "a-source" }, {}]) {
        const answer = await agent.call("genobi_take_to_project", {
          ...args,
          copyId: `${owner.project.id}.abcdefghjk`,
          baseRevision: 1,
        });
        expect(answer.error, JSON.stringify(args)).toBe(true);
      }
    } finally {
      await agent.close();
    }
    const schema = describeTool(
      commandTool(["take-to-project"], true),
    ).inputSchema;
    expect(schema).toMatchObject({
      oneOf: [{ required: ["id"] }, { required: ["sourceId"] }],
      required: ["copyId", "baseRevision"],
    });
    expect(Object.keys(schema.properties ?? {})).toEqual([
      "id",
      "sourceId",
      "copyId",
      "baseRevision",
    ]);
  });
});

describe("a cut made by the real ffmpeg", () => {
  it.skipIf(!hasFfmpeg)(
    "goes in measured by the shared reader, its input named",
    { timeout: 60_000 },
    async () => {
      const owner = await linkedStudio("real ffmpeg");
      const agent = await agentSession(owner);
      const clip = new Uint8Array(
        await readFile(path.resolve("tests/fixtures/metadata.mp4")),
      );
      const sourceId = await agent.upload(clip, "video/mp4");
      const handed = await agent.post("/api/media/trim", {
        sourceId,
        start: 1,
        duration: 2,
      });
      expect(handed.status).toBe(201);
      const trim = ((await handed.json()) as { source: { id: string } }).source;
      const answer = await agent.handIn({ sourceId: trim.id, baseRevision: 1 });
      expect(answer.status).toBe(200);
      expect(await answer.json()).toMatchObject({
        revision: 2,
        derivation: {
          operation: "trim",
          sources: [{ kind: "video", origin: "upload" }],
        },
      });
      const project = await read(owner);
      const asset = Object.values(project.assets).find(
        (a) => a.file.path === `media/derived-${trim.id}.mp4`,
      )!;
      expect(asset.durationSeconds).toBeGreaterThan(1.9);
      expect(asset.durationSeconds).toBeLessThan(2.1);
    },
  );
});

describe("a derivation in a project", () => {
  const withCut = (derivation: unknown, inputAssetIds = ["video"]) => {
    const project = structuredClone(base().project) as Project;
    project.assets.cut = {
      ...project.assets.video,
      origin: "generated",
      generationId: "gen-cut",
    };
    project.generations.push({
      id: "gen-cut",
      inputAssetIds,
      referenceAssetIds: [],
      outputAssetIds: ["cut"],
      prompt: "Trim of a plate",
      tool: "Genobi trim (local media tools), handed in by an agent",
      derivation: derivation as Project["generations"][number]["derivation"],
    });
    return project;
  };
  const trim = (assetId?: string) => ({
    operation: "trim",
    sources: [
      { kind: "video", origin: "take", ...(assetId ? { assetId } : {}) },
    ],
  });

  it("names only inputs of its own record, in the bundle's own words", () => {
    expect(() => validateProject(withCut(trim("video")))).not.toThrow();
    expect(() => validateProject(withCut(trim(), []))).not.toThrow();
    expect(() => validateProject(withCut(trim("video"), []))).toThrow(
      /Derivation source video is not an input/,
    );
    for (const bad of [
      { ...trim(), operation: "frames" },
      { ...trim(), sources: [] },
      { ...trim(), jobId: "a-job" },
      { operation: "trim", sources: [{ kind: "image", origin: "take" }] },
    ])
      expect(
        () => validateProject(withCut(bad, [])),
        JSON.stringify(bad),
      ).toThrow(/Invalid bundle/);
  });
});
