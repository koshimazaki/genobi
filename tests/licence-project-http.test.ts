import { expect, it } from "vitest";
import { studio } from "./project-copy-harness";
import { projectSummary } from "../mcp/director-tools";
it("persists project preferences through the owned HTTP command and exposes them to agents", async () => {
  const h = await studio();
  await h.upload(h.cookie);
  await h.push(h.cookie, null, 1);
  const preferences = {
    usage: { purpose: "commercial-video", policy: "mit-only" },
    selection: { family: "ltx", execution: "local" },
  };
  const changed = await h.send(h.cookie, `/${h.project.id}/commands`, "POST", {
    baseRevision: 1,
    command: { op: "set-preferences", preferences },
  });
  expect(changed.status).toBe(200);
  const read = await h.send(h.cookie, `/${h.project.id}`);
  expect(read.project).toMatchObject({ preferences });
  expect(
    projectSummary(read as unknown as Parameters<typeof projectSummary>[0]),
  ).toMatchObject({ preferences });
  const stranger = await h.fresh();
  expect(
    (
      await h.send(stranger, `/${h.project.id}/commands`, "POST", {
        baseRevision: 2,
        command: { op: "set-preferences", preferences: {} },
      })
    ).status,
  ).toBe(404);
});
