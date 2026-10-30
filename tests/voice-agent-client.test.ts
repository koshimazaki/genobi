// The project prompt's client (issue #23): the agent status check, the open
// project's copy handle and the session request, against stand-in fetches.
import { describe, expect, it, vi } from "vitest";
vi.mock("../src/hosted-studio", () => ({
  readHostedStudio: async () => false,
}));
import {
  AGENT_HEADER,
  agentStatus,
  NOT_SET_UP,
  openCopyId,
  unavailableText,
} from "../src/voice/agent-client";

const answer = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );

describe("agent status", () => {
  it("reads a missing route, a page or a network failure as not set up", async () => {
    for (const fetcher of [
      answer(404, { error: "API route not found." }),
      answer(200, "<!doctype html>"),
      vi.fn().mockRejectedValue(new TypeError("offline")),
    ])
      expect(await agentStatus(fetcher)).toEqual({ available: false });
    expect(unavailableText({ available: false })).toBe(NOT_SET_UP);
  });

  it("keeps the runner and the message, and sends the studio header", async () => {
    const fetcher = answer(200, {
      available: false,
      runner: "claude",
      message: "Install Claude Code\nor Hermes.",
      path: "/Users/someone/bin/claude",
    });
    const status = await agentStatus(fetcher);
    expect(status).toEqual({
      available: false,
      runner: "claude",
      message: "Install Claude Code or Hermes.",
    });
    expect(unavailableText(status)).toBe(
      `${NOT_SET_UP} Install Claude Code or Hermes.`,
    );
    expect(fetcher).toHaveBeenCalledWith("/api/agent/status", {
      headers: AGENT_HEADER,
    });
    expect(AGENT_HEADER).toEqual({ "X-Genobi-Agent": "1" });
  });

  it("drops a runner it does not know", async () => {
    expect(
      await agentStatus(answer(200, { available: true, runner: "shell" })),
    ).toEqual({ available: true });
  });
});

describe("the open project's copy", () => {
  const projects = answer(200, {
    projects: [
      { id: "shared-cut", copyId: "shared-cut.k7qm2xrpab", access: "linked" },
      {
        id: "product-video",
        copyId: "product-video.k7qm2xrpab",
        access: "owner",
      },
      { id: "odd", copyId: "odd/../x", access: "owner" },
    ],
  });

  it("is this session's own copy of the open project, by its handle", async () => {
    expect(await openCopyId("product-video", projects)).toBe(
      "product-video.k7qm2xrpab",
    );
    // Linked to someone else's copy is not the open project.
    expect(await openCopyId("shared-cut", projects)).toBeUndefined();
    expect(await openCopyId("odd", projects)).toBeUndefined();
  });

  it("is none with no project open, no copy or no copy route", async () => {
    expect(await openCopyId(undefined, projects)).toBeUndefined();
    expect(await openCopyId("other", projects)).toBeUndefined();
    expect(
      await openCopyId("product-video", answer(404, { error: "no" })),
    ).toBeUndefined();
  });
});
