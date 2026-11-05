import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { expect, it } from "vitest";
import { MemoryProjects } from "../server/memory-projects";
import { ProjectMediaStaging } from "../server/project-media-stage";
import type { Project } from "../shared/director/types";
import type { ProjectMediaCommand } from "../shared/project-media-command";
import { studio } from "./project-copy-harness";
import { wav } from "./audio-fixtures";

async function prepared() {
  const s = await studio();
  await s.upload(s.cookie);
  await s.push(s.cookie, null, 1);
  const agent = await s.fresh();
  const { code } = await s.send(s.cookie, `/${s.project.id}/link`, "POST");
  const linked = await s.send(agent, "/link", "POST", { code });
  const copyId = (linked.project as { copyId: string }).copyId;
  const stage = async (bytes: Buffer, contentType: string, cookie = agent) => {
    const sha = createHash("sha256").update(bytes).digest("hex");
    const response = await fetch(
      `${s.base}/api/projects/${copyId}/media/${sha}`,
      {
        method: "POST",
        headers: { cookie, "Content-Type": contentType },
        body: new Uint8Array(bytes),
      },
    );
    expect(response.status).toBe(201);
    return (await response.json()).receipt.receiptId as string;
  };
  const operation = (
    command: ProjectMediaCommand,
    baseRevision: number,
    requestId = randomUUID(),
    cookie = agent,
  ) =>
    s.send(cookie, `/${copyId}/media`, "POST", {
      baseRevision,
      requestId,
      command,
    });
  const project = async () =>
    (await s.send(s.cookie, `/${copyId}`)).project as Project;
  return { ...s, agent, copyId, stage, operation, project };
}

it("attaches inspected image/audio/video as uploaded assets, with readable exact bytes", async () => {
  const s = await prepared();
  let revision = 1;
  for (const [bytes, type, kind] of [
    [
      await readFile("docs/director-bundle/templates/poster-motion.png"),
      "image/png",
      "image",
    ],
    [Buffer.from(wav(2)), "audio/wav", "audio"],
    [await readFile("tests/fixtures/metadata.mp4"), "video/mp4", "video"],
  ] as const) {
    const receiptId = await s.stage(bytes, type);
    const result = await s.operation(
      { op: "attach", receiptId, use: "production" },
      revision++,
    );
    expect(result).toMatchObject({
      status: 200,
      revision,
      assetIds: [expect.any(String)],
      layerIds: [],
    });
    const project = await s.project();
    const asset = project.assets[(result.assetIds as string[])[0]];
    expect(asset).toMatchObject({
      kind,
      use: "production",
      origin: "uploaded",
      file: { sha256: receiptId },
    });
    expect(JSON.stringify(project)).not.toContain(s.directory);
    const response = await fetch(
      `${s.base}/api/projects/${s.copyId}/files/${receiptId}`,
      { headers: { cookie: s.cookie } },
    );
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  }
  expect(s.bfl.submissions).toBe(0);
});

it("replays a lost acknowledgement after human edits and restart, but refuses changed request bodies", async () => {
  const s = await prepared();
  const receiptId = await s.stage(Buffer.from(wav(2)), "audio/wav");
  const command = { op: "attach", receiptId, use: "production" } as const;
  const requestId = randomUUID();
  const first = await s.operation(command, 1, requestId);
  expect(first).toMatchObject({ status: 200, revision: 2, replayed: false });
  const human = await s.project();
  expect(
    await s.send(s.cookie, `/${human.id}`, "PUT", {
      baseRevision: 2,
      project: { ...human, revision: 3, name: "Human edit" },
      brief: null,
    }),
  ).toMatchObject({ status: 200 });
  const retry = await s.operation(command, 1, requestId);
  expect(retry).toMatchObject({
    status: 200,
    revision: 2,
    replayed: true,
    currentRevision: 3,
    assetIds: first.assetIds,
  });
  expect(
    await s.operation({ ...command, use: "reference" }, 1, requestId),
  ).toMatchObject({ status: 409, code: "media_request_conflict" });
  const restarted = new MemoryProjects(s.directory);
  await restarted.load();
  const recovered = await restarted.mediaOperation(
    s.copyId,
    s.agent.slice(15),
    { baseRevision: 1, requestId, command },
    new ProjectMediaStaging(restarted),
  );
  expect(recovered).toMatchObject({
    revision: 2,
    replayed: true,
    currentRevision: 3,
  });
  expect((await s.project()).name).toBe("Human edit");
});

it("refuses stale, foreign and missing media before changing the project", async () => {
  const s = await prepared();
  const receiptId = await s.stage(Buffer.from(wav(2)), "audio/wav", s.cookie);
  expect(
    await s.operation({ op: "attach", receiptId, use: "production" }, 1),
  ).toMatchObject({ status: 404, code: "media_receipt_missing" });
  const own = await s.stage(Buffer.from(wav(3)), "audio/wav");
  expect(
    await s.operation({ op: "attach", receiptId: own, use: "production" }, 2),
  ).toMatchObject({ status: 409, code: "revision_conflict" });
  expect(
    await s.operation(
      { op: "relink", assetId: "missing", layerIds: ["photo-1"] },
      1,
    ),
  ).toMatchObject({ status: 422 });
  expect((await s.project()).revision).toBe(1);
});

it("replaces clips using browser rules, relinks Inspirations through aliases and protects used assets", async () => {
  const s = await prepared();
  const before = await s.project();
  const clip = before.layers.find(
    (layer) => layer.kind === "image" && !layer.locked,
  )!;
  const receiptId = await s.stage(
    await readFile("docs/director-bundle/templates/poster-motion.png"),
    "image/png",
  );
  const attached = await s.operation(
    { op: "attach", receiptId, use: "reference" },
    1,
  );
  const inspiration = (attached.assetIds as string[])[0];
  const relinked = await s.operation(
    { op: "relink", assetId: inspiration, layerIds: [clip.id] },
    2,
  );
  expect(relinked).toMatchObject({
    status: 200,
    layerIds: [clip.id],
    revision: 3,
  });
  const project = await s.project();
  const placed = project.layers.find((layer) => layer.id === clip.id)!;
  expect(placed).toMatchObject({
    startFrame: clip.startFrame,
    durationFrames: clip.durationFrames,
  });
  const production = (placed as { assetId: string }).assetId;
  expect(production).not.toBe(inspiration);
  expect(project.assets[inspiration].use).toBe("reference");
  expect(project.assets[production].use).toBe("production");
  expect(
    await s.operation({ op: "remove", assetId: production }, 3),
  ).toMatchObject({ status: 422, code: "media_operation_refused" });
  expect(
    await s.operation({ op: "replace", receiptId, layerIds: [clip.id] }, 3),
  ).toMatchObject({ status: 200, assetIds: [production], revision: 4 });
  expect(
    await s.operation({ op: "remove", assetId: inspiration }, 4),
  ).toMatchObject({ status: 200, revision: 5 });
});

it("keeps locked clips and brief references protected and refuses missing project files", async () => {
  const s = await prepared();
  const before = await s.project();
  const clip = before.layers.find(
    (layer) => layer.kind === "image" && !layer.locked,
  )!;
  const referenced =
    Object.keys(before.assets).find(
      (id) => before.assets[id].use === "reference",
    ) ?? Object.keys(before.assets)[0];
  const protectedProject = {
    ...before,
    revision: 2,
    layers: before.layers.map((layer) =>
      layer.id === clip.id ? { ...layer, locked: true } : layer,
    ),
  };
  const brief = {
    version: 1,
    text: "Keep [Image 1].",
    references: [
      { id: "reference-one", assetId: referenced, label: "Image 1" },
    ],
  };
  expect(
    await s.send(s.cookie, `/${before.id}`, "PUT", {
      baseRevision: 1,
      project: protectedProject,
      brief,
    }),
  ).toMatchObject({ status: 200 });
  expect(
    await s.operation({ op: "remove", assetId: referenced }, 2),
  ).toMatchObject({ status: 409, code: "asset_in_use" });
  const receiptId = await s.stage(
    await readFile("docs/director-bundle/templates/poster-motion.png"),
    "image/png",
  );
  expect(
    await s.operation({ op: "replace", receiptId, layerIds: [clip.id] }, 2),
  ).toMatchObject({ status: 422 });
  expect((await s.project()).revision).toBe(2);
  const asset = Object.values(before.assets)[0];
  await rm(
    s.projects.filePath(s.copyId, s.cookie.slice(15), asset.file.sha256),
  );
  expect(
    await s.operation({ op: "attach", receiptId, use: "production" }, 2),
  ).toMatchObject({ status: 409, code: "files_missing" });
  expect((await s.project()).revision).toBe(2);
});
