import { expect, it } from "vitest";
import { applyEvent, pushCopy, readCopy } from "../src/director/project-copy";
import { base } from "./house-template-fixtures";
import { setup } from "./server-harness";

it("revision-checks resolution on the server and replays the same edit live", async () => {
  const harness = await setup();
  const fetcher = ((input: string, init: RequestInit = {}) =>
    fetch(`${harness.base}${input}`, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        cookie: harness.cookie,
      },
    })) as typeof fetch;
  const bundle = base();
  await pushCopy(bundle, null, new Set(), fetcher);
  const command = { op: "set-resolution" as const, width: 1920, height: 1080 };
  const send = (baseRevision: number, edit = command) =>
    fetcher(`/api/projects/${bundle.project.id}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRevision, command: edit }),
    });
  expect((await send(1, { ...command, height: 1081 })).status).toBe(400);
  expect((await send(1)).status).toBe(200);
  expect((await send(1)).status).toBe(409);
  const event = {
    projectId: bundle.project.id,
    baseRevision: 1,
    revision: 2,
    source: "command" as const,
    command,
  };
  const next = applyEvent(bundle, event)!;
  expect(applyEvent(next, event)).toBeUndefined();
  const stored = await readCopy(bundle.project.id, bundle, fetcher);
  expect(next.project).toEqual(stored.project);
  expect(stored.project.composition).toMatchObject({
    width: 1920,
    height: 1080,
  });
});
