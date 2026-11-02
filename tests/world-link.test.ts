// The World tab's side of the grant (src/world-builder/world-link.ts): it
// grants the studio's running session while World Builder is on screen,
// closes a connection made only for that, and keeps Connect agents as it was.
import { describe, expect, it, vi } from "vitest";
import { WorldLink } from "../src/world-builder/world-link";
import { connectWorld } from "../src/world-builder/agent-bridge";

const RUN = "11111111-1111-4111-8111-111111111111";
const NEXT = "22222222-2222-4222-8222-222222222222";

function fake() {
  const grants: string[] = [];
  const keeps: boolean[] = [];
  const drops: ((error?: string) => void)[] = [];
  let opened = 0;
  let closed = 0;
  const connect = vi.fn(
    async (onDisconnect: (error?: string) => void, keep: boolean) => {
      opened++;
      keeps.push(keep);
      drops.push(onDisconnect);
      return {
        id: `tab-${opened}`,
        code: "c".repeat(32),
        grant: async (run: string) => {
          grants.push(run);
        },
        disconnect: () => {
          closed++;
          onDisconnect();
        },
      };
    },
  );
  const errors: string[] = [];
  const link = new WorldLink(connect as never, (e) => errors.push(e));
  /** The bridge's poll failed: the last connection drops with an error. */
  const drop = (error = "World session not found.") => drops.at(-1)!(error);
  return {
    link,
    grants,
    keeps,
    errors,
    drop,
    connect,
    counts: () => ({ opened, closed }),
  };
}

describe("WorldLink", () => {
  it("grants the running session while on screen, once, without showing a code", async () => {
    const { link, grants, counts } = fake();
    await link.follow(RUN, true);
    await link.follow(RUN, true);
    expect(grants).toEqual([RUN]);
    expect(counts()).toEqual({ opened: 1, closed: 0 });
    expect(link.state()).toEqual({ connected: true, code: "", granted: RUN });
    // A new run is granted on the same connection.
    await link.follow(NEXT, true);
    expect(grants).toEqual([RUN, NEXT]);
    expect(counts().opened).toBe(1);
  });

  it("closes a grant-only connection when World leaves or the run ends", async () => {
    const { link, counts } = fake();
    await link.follow(RUN, true);
    await link.follow(RUN, false);
    expect(counts()).toEqual({ opened: 1, closed: 1 });
    expect(link.state().connected).toBe(false);
    await link.follow(RUN, true);
    await link.follow(undefined, true);
    expect(counts()).toEqual({ opened: 2, closed: 2 });
  });

  it("does nothing with no running session", async () => {
    const { link, connect } = fake();
    await link.follow(undefined, true);
    await link.follow(RUN, false);
    expect(connect).not.toHaveBeenCalled();
  });

  it("keeps Connect agents' connection and code when World leaves", async () => {
    const { link, grants, counts } = fake();
    await link.toggle();
    expect(link.state()).toEqual({ connected: true, code: "c".repeat(32) });
    await link.follow(RUN, true);
    expect(grants).toEqual([RUN]);
    await link.follow(RUN, false);
    expect(counts().closed).toBe(0);
    expect(link.state().code).toBe("c".repeat(32));
  });

  it("does not grant a run again after Disconnect agents", async () => {
    const { link, grants, counts } = fake();
    await link.follow(RUN, true);
    await link.toggle();
    expect(counts().closed).toBe(1);
    await link.follow(RUN, true);
    expect(grants).toEqual([RUN]);
    expect(counts().opened).toBe(1);
    // The next session is granted again.
    await link.follow(NEXT, true);
    expect(grants).toEqual([RUN, NEXT]);
  });

  it("closes what it opened when a grant is refused, and tries again later", async () => {
    const { link, connect, counts } = fake();
    connect.mockImplementationOnce(async (onDisconnect) => ({
      id: "tab",
      code: "c".repeat(32),
      grant: async () => {
        throw new Error("That agent session is not running.");
      },
      disconnect: () => onDisconnect(),
    }));
    await link.follow(RUN, true);
    expect(link.state().connected).toBe(false);
    // Not a decline: the next follow (remount, shown, run change) retries.
    await link.follow(RUN, true);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(counts().opened).toBe(1);
    expect(link.state().granted).toBe(RUN);
  });

  it("a failed connect (a full server) is retried, not declined", async () => {
    const { link, connect, grants } = fake();
    connect.mockRejectedValueOnce(
      new Error("Four World tabs are already connected."),
    );
    await link.follow(RUN, true);
    expect(link.state().connected).toBe(false);
    link.shown();
    await vi.waitFor(() => expect(grants).toEqual([RUN]));
  });

  it("links automatically with keep, and Connect agents without", async () => {
    const auto = fake();
    await auto.link.follow(RUN, true);
    expect(auto.keeps).toEqual([true]);
    const manual = fake();
    await manual.link.toggle();
    expect(manual.keeps).toEqual([false]);
  });

  it("reconnects a dropped automatic link once, then again when shown", async () => {
    const { link, grants, errors, drop, counts } = fake();
    await link.follow(RUN, true);
    drop();
    await vi.waitFor(() => expect(grants).toEqual([RUN, RUN]));
    expect(link.state()).toMatchObject({ connected: true, granted: RUN });
    expect(errors).toEqual([]);
    // A second drop is reported and not retried at once.
    drop();
    await Promise.resolve();
    expect(link.state().connected).toBe(false);
    expect(errors).toEqual(["World session not found."]);
    expect(counts().opened).toBe(2);
    // Shown again, it reconnects and grants the run.
    link.shown();
    await vi.waitFor(() => expect(grants).toEqual([RUN, RUN, RUN]));
    expect(counts().opened).toBe(3);
  });
});

describe("connectWorld", () => {
  it("ends its server session before reporting a dropped poll", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push(`${method} ${url}`);
        const json = (status: number, body: unknown) =>
          new Response(JSON.stringify(body), { status });
        if (url === "/api/world/connect")
          return json(200, { id: "tab", code: "c".repeat(32) });
        if (url === "/api/world/tab/next")
          return json(404, { error: "World session not found." });
        return json(200, {});
      }),
    );
    try {
      const dropped = new Promise<string | undefined>((resolve) =>
        connectWorld({ live: { stop: () => {} } } as never, (error) => {
          calls.push(`dropped ${error}`);
          resolve(error);
        }),
      );
      expect(await dropped).toBe("World session not found.");
      expect(calls).toEqual([
        "POST /api/world/connect",
        "GET /api/world/tab/next",
        "DELETE /api/world/tab",
        "dropped World session not found.",
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
