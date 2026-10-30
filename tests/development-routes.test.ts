import { describe, expect, it } from "vitest";
import { setup } from "./server-harness";
import { savedDevelopRunner } from "../server/development-develop";
import {
  AGENT_MARK_HEADER,
  AGENT_REQUEST_HEADER,
} from "../shared/agent-session-events";

describe("Development route boundary", () => {
  it("refuses cross-site, missing-header and agent requests before launching anything", async () => {
    const studio = await setup();
    const url = `${studio.base}/api/development`;
    expect((await fetch(url)).status).toBe(403);
    const headers = { [AGENT_REQUEST_HEADER]: "1" };
    expect(
      (
        await fetch(url, {
          headers: { ...headers, Origin: "https://elsewhere.example" },
        })
      ).status,
    ).toBe(403);
    expect(
      (await fetch(url, { headers: { ...headers, [AGENT_MARK_HEADER]: "1" } }))
        .status,
    ).toBe(403);
    const good = await fetch(url, { headers });
    expect(good.status).toBe(200);
    expect((await good.json()).sessions).toEqual([]);
    expect(
      (
        await fetch(url, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            runner: "arbitrary",
            mode: "fresh",
            prompt: "Hi",
          }),
        })
      ).status,
    ).toBe(400);
  });
  it("opens the Developer route only to a running agent session's grant", async () => {
    const studio = await setup();
    const url = `${studio.base}/api/development/agent`;
    const body = JSON.stringify({
      role: "developer",
      task: "Hi",
      mode: "change",
    });
    const json = { "Content-Type": "application/json" };
    const marked = await fetch(url, {
      method: "POST",
      headers: { ...json, [AGENT_MARK_HEADER]: "1" },
      body,
    });
    expect(marked.status).toBe(403);
    expect((await marked.json()).code).toBe("agent_nested");
    const person = await fetch(url, {
      method: "POST",
      headers: { ...json, [AGENT_REQUEST_HEADER]: "1" },
      body,
    });
    expect((await person.json()).code).toBe("develop_agent_only");
  });
  it("takes the Developer's runner from the person's setup, never the agent", () => {
    expect(savedDevelopRunner({ runner: "hermes" }, {})).toBe("hermes");
    expect(savedDevelopRunner({ unsupportedRunner: "codex" }, {})).toBe(
      "codex",
    );
    expect(
      savedDevelopRunner(
        { runner: "hermes" },
        { GENOBI_DEVELOP_RUNNER: "claude" },
      ),
    ).toBe("claude");
    expect(
      savedDevelopRunner(
        { runner: "hermes" },
        { GENOBI_DEVELOP_RUNNER: "other" },
      ),
    ).toBeUndefined();
    expect(savedDevelopRunner({}, {})).toBeUndefined();
  });
});
