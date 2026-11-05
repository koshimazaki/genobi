import { writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, it } from "vitest";
import { GenobiApi, studioUrl } from "../mcp/api";
import { profileConnection } from "../mcp/connection";
import { ProfileStore } from "../mcp/profile-store";
import { run } from "../cli/run";
import { commandTool, commandSchema } from "../cli/commands";
import { mcpAgent } from "./mcp-agent-harness";
import { studio } from "./project-copy-harness";
import { wav } from "./audio-fixtures";

it("stages over the real MCP transport, reads the same receipt from CLI, and keeps paths out of HTTP", async () => {
  const owner = await studio();
  await owner.upload(owner.cookie);
  await owner.push(owner.cookie, null, 1);
  const { code } = await owner.send(
    owner.cookie,
    `/${owner.project.id}/link`,
    "POST",
  );
  const observed: string[] = [];
  const options = {
    env: { GENOBI_PROFILE: "default", GENOBI_URL: owner.base },
    store: new ProfileStore(path.join(owner.directory, "profiles")),
    fetcher: (async (url, init) => {
      observed.push(String(url), JSON.stringify(init?.headers));
      if (typeof init?.body === "string") observed.push(init.body);
      return fetch(url, init);
    }) as typeof fetch,
  };
  const { api } = await profileConnection(options);
  const agent = await mcpAgent(api);
  const { copyId } = await agent.json("genobi_link_project", { code });
  const filePath = path.join(owner.directory, "private-source.wav");
  await writeFile(filePath, wav(2));
  const staged = await agent.json("genobi_project_media_stage", {
    copyId,
    filePath,
    contentType: "audio/wav",
  });
  expect(staged).toMatchObject({
    stored: true,
    receipt: { copyId, kind: "audio", duration: 2 },
  });
  const read = await run(
    [
      "project-media-receipt",
      "--input",
      JSON.stringify({ copyId, receiptId: staged.receipt.receiptId }),
    ],
    options,
  );
  expect(read).toEqual({ receipt: staged.receipt });
  const retry = await run(
    [
      "project-media-stage",
      "--input",
      JSON.stringify({ copyId, filePath, contentType: "audio/wav" }),
    ],
    options,
  );
  expect(retry).toEqual({ receipt: staged.receipt, stored: false });
  expect(observed.join("\n")).not.toContain(filePath);
  expect(JSON.stringify(staged)).not.toContain(filePath);
  expect(owner.bfl.submissions).toBe(0);
  expect(
    owner.projects.read(owner.project.id, owner.cookie.slice(15)).revision,
  ).toBe(1);
  const operation = {
    copyId,
    requestId: randomUUID(),
    baseRevision: 1,
    command: {
      op: "attach",
      receiptId: staged.receipt.receiptId,
      use: "production",
    },
  };
  const attached = await agent.json("genobi_project_media", operation);
  expect(attached).toMatchObject({
    revision: 2,
    assetIds: [expect.any(String)],
    replayed: false,
  });
  expect(
    await run(["project-media", "--input", JSON.stringify(operation)], options),
  ).toEqual({ ...attached, replayed: true });
  expect(
    owner.projects.read(owner.project.id, owner.cookie.slice(15)).revision,
  ).toBe(2);
});

it("exposes the same bounded schema in CLI and refuses arbitrary local reads for studio agents", async () => {
  const tool = commandTool(["project-media-stage"], false);
  const schema = commandSchema(tool);
  expect(
    schema.safeParse({
      copyId: "studio-house.abcdefghjk",
      filePath: "/fixture.wav",
      contentType: "text/plain",
    }).success,
  ).toBe(false);
  const api = new GenobiApi(
    studioUrl(),
    async () => {
      throw new Error("No HTTP call should happen");
    },
    true,
  );
  await expect(
    tool.run(api, {
      copyId: "studio-house.abcdefghjk",
      filePath: "/fixture.wav",
      contentType: "audio/wav",
    }),
  ).rejects.toThrow("studio-started agent cannot read");
  expect(() => commandTool(["project-media-stage"], true)).toThrow();
});
