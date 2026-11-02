// The World tab's side of the grant (src/world-builder/world-link.ts): it
// grants the studio's running session while World Builder is on screen,
// closes a connection made only for that, and keeps Connect agents as it was.
import { describe, expect, it, vi } from "vitest";
import { WorldLink } from "../src/world-builder/world-link";

const RUN = "11111111-1111-4111-8111-111111111111";
const NEXT = "22222222-2222-4222-8222-222222222222";

function fake() {
  const grants: string[] = [];
  let opened = 0;
  let closed = 0;
  const connect = vi.fn(async (onDisconnect: (error?: string) => void) => {
    opened++;
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
  });
  const link = new WorldLink(connect as never);
  return { link, grants, connect, counts: () => ({ opened, closed }) };
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

  it("gives up on a run whose grant is refused, closing what it opened", async () => {
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
    await link.follow(RUN, true);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(counts().opened).toBe(0);
  });
});
