import { createHash } from "node:crypto";
import { expect } from "vitest";
import { base } from "./house-template-fixtures";

/** Publish the fixture project as its owner and issue one scoped link code. */
export async function linkAgentProject(url: string, cookie: string) {
  const bundle = base();
  const route = `${url}/api/projects/${bundle.project.id}`;
  for (const bytes of new Set(bundle.files.values())) {
    const sha = createHash("sha256").update(bytes).digest("hex");
    const response = await fetch(`${route}/files/${sha}`, {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/octet-stream" },
      body: bytes,
    });
    expect([200, 201]).toContain(response.status);
  }
  const pushed = await fetch(route, {
    method: "PUT",
    headers: { cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      baseRevision: null,
      project: bundle.project,
      brief: null,
    }),
  });
  expect(pushed.status).toBe(200);
  const linked = await fetch(`${route}/link`, {
    method: "POST",
    headers: { cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  expect(linked.status).toBe(201);
  return {
    project: bundle.project,
    code: (await linked.json()).code as string,
  };
}
