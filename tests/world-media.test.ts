import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { studio } from "./project-copy-harness";

const expectedRevision = "00000000-0000-4000-8000-000000000001:0";
it("requires both World pairing and project ownership, serves only the tab, and deduplicates concurrent attachment requests", async () => {
  const s = await studio();
  await s.upload(s.cookie);
  await s.push(s.cookie, null, 1);
  const agent = await s.fresh(),
    foreign = await s.fresh();
  const call = async (cookie: string, route: string, body?: unknown) => {
    const response = await fetch(`${s.base}/api/world${route}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { cookie, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, ...(await response.json()) };
  };
  const world = await call(s.cookie, "/connect", {});
  await call(agent, "/link", { code: world.code });
  const copyId = s.projects.read(s.project.id, s.cookie.slice(15)).copyId;
  const assetId = Object.keys(s.project.assets).find(
    (id) => s.project.assets[id].kind === "audio",
  )!;
  const command = {
    op: "attach-media",
    copyId,
    assetId,
    target: "audio",
    expectedRevision,
    requestId: randomUUID(),
  };
  expect(await call(agent, `/${world.id}/commands`, command)).toMatchObject({
    status: 404,
  });
  const { code } = await s.send(s.cookie, `/${s.project.id}/link`, "POST");
  await s.send(agent, "/link", "POST", { code });
  expect(await call(foreign, `/${world.id}/commands`, command)).toMatchObject({
    status: 404,
  });
  const [first, retry] = await Promise.all([
    call(agent, `/${world.id}/commands`, command),
    call(agent, `/${world.id}/commands`, command),
  ]);
  expect(first).toMatchObject({ status: 202, state: "queued" });
  expect(retry.id).toBe(first.id);
  expect(
    await call(agent, `/${world.id}/commands`, {
      ...command,
      target: "screen/all",
    }),
  ).toMatchObject({ status: 409 });
  const mediaPath = `${s.base}/api/world/${world.id}/commands/${first.id}/media`;
  expect((await fetch(mediaPath, { headers: { cookie: agent } })).status).toBe(
    404,
  );
  const media = await fetch(mediaPath, { headers: { cookie: s.cookie } });
  expect(media.status).toBe(200);
  expect(media.headers.get("content-type")).toContain("audio/wav");
  expect(
    createHash("sha256")
      .update(Buffer.from(await media.arrayBuffer()))
      .digest("hex"),
  ).toBe(s.project.assets[assetId].file.sha256);
  expect(await call(s.cookie, `/${world.id}/next`)).toMatchObject({
    id: first.id,
    command,
  });
  await call(s.cookie, `/${world.id}/commands/${first.id}`, {
    state: "done",
    result: { revision: "applied" },
  });
  expect(await call(agent, `/${world.id}/commands`, command)).toMatchObject({
    id: first.id,
    state: "done",
  });
  expect(
    (await fetch(mediaPath, { headers: { cookie: s.cookie } })).status,
  ).toBe(404);
  expect(s.bfl.submissions).toBe(0);
});
