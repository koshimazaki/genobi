import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Project } from "../shared/director/types";
import { mixBundle } from "./dimensions-mix-fixtures";
import { setup } from "./server-harness";

// The Dimensions mix's project copy on the local server: its new recipes are
// trusted by the server's own validator, so the copy saves and reads back.
describe("the Dimensions mix project copy", () => {
  it("round-trips through the project copy route", async () => {
    const { base: url } = await setup();
    const cookie = (await fetch(`${url}/api/health`)).headers
      .get("set-cookie")!
      .split(";")[0];
    const { project, files } = await mixBundle();
    for (const bytes of new Set(files.values())) {
      const sha = createHash("sha256").update(bytes).digest("hex");
      const put = await fetch(
        `${url}/api/projects/${project.id}/files/${sha}`,
        {
          method: "PUT",
          headers: { cookie, "Content-Type": "application/octet-stream" },
          body: bytes,
        },
      );
      expect([200, 201]).toContain(put.status);
    }
    const push = await fetch(`${url}/api/projects/${project.id}`, {
      method: "PUT",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ baseRevision: null, project, brief: null }),
    });
    expect(push.status, await push.clone().text()).toBe(200);
    const read = await fetch(`${url}/api/projects/${project.id}`, {
      headers: { cookie },
    });
    expect(read.status).toBe(200);
    const copy = (await read.json()) as { project: Project };
    expect(copy.project.layers).toEqual(project.layers);
    expect(copy.project.modules).toEqual(project.modules);
  }, 60000);
});
