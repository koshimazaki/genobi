import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { ProjectMediaStaging } from "../server/project-media-stage";
import { PROJECT_MEDIA_STAGE_MS } from "../shared/project-media";
import { studio } from "./project-copy-harness";
import { wav } from "./audio-fixtures";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function prepared() {
  const s = await studio();
  await s.upload(s.cookie);
  await s.push(s.cookie, null, 1);
  const copyId = s.projects.read(s.project.id, s.cookie.slice(15)).copyId;
  const stage = async (
    bytes: Buffer,
    contentType: string,
    cookie = s.cookie,
    hash = sha(bytes),
    copy = copyId,
  ) => {
    const response = await fetch(
      `${s.base}/api/projects/${copy}/media/${hash}`,
      {
        method: "POST",
        headers: { cookie, "Content-Type": contentType },
        body: new Uint8Array(bytes),
      },
    );
    return { status: response.status, ...(await response.json()) };
  };
  const receipt = async (id: string, cookie = s.cookie, copy = copyId) => {
    const response = await fetch(`${s.base}/api/projects/${copy}/media/${id}`, {
      headers: { cookie },
    });
    return { status: response.status, ...(await response.json()) };
  };
  return { ...s, copyId, stage, receipt };
}

it("stages inspected image, audio and video without changing the project, with stable retry/read receipts", async () => {
  const s = await prepared();
  const fixtures = [
    [
      await readFile("docs/director-bundle/templates/poster-motion.png"),
      "image/png",
      "image",
    ],
    [Buffer.from(wav(2)), "audio/wav", "audio"],
    [await readFile("tests/fixtures/metadata.mp4"), "video/mp4", "video"],
  ] as const;
  for (const [bytes, type, kind] of fixtures) {
    const first = await s.stage(bytes, type);
    expect(first).toMatchObject({
      status: 201,
      stored: true,
      receipt: {
        copyId: s.copyId,
        receiptId: sha(bytes),
        sha256: sha(bytes),
        byteLength: bytes.length,
        kind,
        contentType: type,
      },
    });
    expect(await s.stage(bytes, type)).toEqual({
      ...first,
      status: 200,
      stored: false,
    });
    expect(await s.receipt(sha(bytes))).toEqual({
      status: 200,
      receipt: first.receipt,
    });
    expect(JSON.stringify(first)).not.toContain(s.directory);
    expect(first.receipt.duration).toEqual(
      kind === "image" ? 0 : expect.any(Number),
    );
  }
  expect((await s.send(s.cookie, `/${s.copyId}`)).revision).toBe(1);
  expect(s.bfl.submissions).toBe(0);
});

it("refuses malformed bytes, MIME mismatch, hash mismatch and over-limit images", async () => {
  const s = await prepared();
  const audio = Buffer.from(wav(1));
  expect(await s.stage(Buffer.from("not-media"), "video/mp4")).toMatchObject({
    status: 422,
    code: "invalid_media",
  });
  expect(await s.stage(audio, "image/png")).toMatchObject({
    status: 422,
    code: "invalid_media",
  });
  expect(
    await s.stage(audio, "audio/wav", s.cookie, "0".repeat(64)),
  ).toMatchObject({ status: 400, code: "media_hash_mismatch" });
  expect(
    await s.stage(Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"),
  ).toMatchObject({ status: 400, code: "invalid_media" });
  expect(await s.receipt(sha(audio))).toMatchObject({ status: 404 });
});

it("binds receipts to the uploader and exact project even for another linked session", async () => {
  const s = await prepared();
  const bytes = Buffer.from(wav(1));
  await s.stage(bytes, "audio/wav");
  const agent = await s.fresh();
  expect(await s.stage(bytes, "audio/wav", agent)).toMatchObject({
    status: 404,
    code: "project_missing",
  });
  const { code } = await s.send(s.cookie, `/${s.project.id}/link`, "POST");
  await s.send(agent, "/link", "POST", { code });
  expect(await s.receipt(sha(bytes), agent)).toMatchObject({
    status: 404,
    code: "media_receipt_missing",
  });
  expect(await s.stage(bytes, "audio/wav", agent)).toMatchObject({
    status: 201,
  });
  expect(await s.receipt(sha(bytes), agent)).toMatchObject({ status: 200 });
  const otherOwner = await s.fresh();
  await s.upload(otherOwner);
  await s.push(otherOwner, null, 1);
  const otherLink = await s.send(otherOwner, `/${s.project.id}/link`, "POST");
  const other = await s.send(agent, "/link", "POST", { code: otherLink.code });
  const otherId = (other.project as { copyId: string }).copyId;
  expect(await s.receipt(sha(bytes), agent, otherId)).toMatchObject({
    status: 404,
    code: "media_receipt_missing",
  });
  expect(await s.receipt(sha(bytes), agent, s.project.id)).toMatchObject({
    status: 404,
    code: "project_missing",
  });
});

it("an interrupted request issues no receipt; retrying the complete file succeeds once", async () => {
  const s = await prepared();
  const bytes = Buffer.from(wav(1));
  await new Promise<void>((resolve) => {
    const req = httpRequest(
      `${s.base}/api/projects/${s.copyId}/media/${sha(bytes)}`,
      {
        method: "POST",
        headers: {
          cookie: s.cookie,
          "Content-Type": "audio/wav",
          "Content-Length": bytes.length,
        },
      },
    );
    req.on("error", () => resolve());
    req.on("socket", (socket) =>
      socket.on("connect", () => {
        req.write(bytes.subarray(0, 50), () => req.destroy());
      }),
    );
  });
  expect(await s.receipt(sha(bytes))).toMatchObject({ status: 404 });
  expect(await s.stage(bytes, "audio/wav")).toMatchObject({
    status: 201,
    stored: true,
  });
  expect(await s.stage(bytes, "audio/wav")).toMatchObject({
    status: 200,
    stored: false,
  });
});

it("preserves receipts across service restarts, expires them, and bounds cumulative staging", async () => {
  const s = await prepared();
  let now = Date.now();
  const bytes = Buffer.from(wav(1));
  const session = s.cookie.slice(15);
  const first = new ProjectMediaStaging(
    s.projects,
    () => now,
    bytes.length + 1,
  );
  const staged = await first.stage(
    s.copyId,
    session,
    sha(bytes),
    bytes,
    "audio/wav",
  );
  const next = new ProjectMediaStaging(s.projects, () => now, bytes.length + 1);
  await next.sweep();
  expect((await next.read(s.copyId, session, sha(bytes))).receipt).toEqual(
    staged.receipt,
  );
  const other = Buffer.from(wav(2));
  await expect(
    next.stage(s.copyId, session, sha(other), other, "audio/wav"),
  ).rejects.toMatchObject({ code: "media_stage_full" });
  now += PROJECT_MEDIA_STAGE_MS + 1;
  await next.sweep();
  await expect(next.read(s.copyId, session, sha(bytes))).rejects.toMatchObject({
    code: "media_receipt_missing",
  });
  expect(
    (await next.stage(s.copyId, session, sha(bytes), bytes, "audio/wav"))
      .stored,
  ).toBe(true);
});

it("rejects corrupt bytes and incomplete disk writes, then permits a clean restage", async () => {
  const s = await prepared();
  const bytes = Buffer.from(wav(1));
  const { receipt } = await s.stage(bytes, "audio/wav");
  const root = path.join(
    s.directory,
    "project-media-staging",
    createHash("sha256").update(s.cookie.slice(15)).digest("hex"),
    s.copyId,
  );
  await writeFile(path.join(root, receipt.receiptId, "media"), "broken");
  expect(await s.receipt(receipt.receiptId)).toMatchObject({ status: 404 });
  const pending = path.join(root, "pending-interrupted");
  await mkdir(pending);
  await writeFile(path.join(pending, "media"), bytes);
  expect(await s.stage(bytes, "audio/wav")).toMatchObject({
    status: 201,
    stored: true,
  });
});
