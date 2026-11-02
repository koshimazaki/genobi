// The World link's async lifecycle (src/world-builder/world-link.ts): a
// connection or grant still in flight when World leaves, the page unmounts
// or the run changes must not end in a live grant or an open session.
import { describe, expect, it } from "vitest";
import { WorldLink } from "../src/world-builder/world-link";

const RUN = "11111111-1111-4111-8111-111111111111";
const NEXT = "22222222-2222-4222-8222-222222222222";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** A bridge whose connect, and optionally grant, wait until released. */
function slow(options: { holdGrant?: boolean } = {}) {
  const connecting = deferred();
  const granting = deferred();
  const grants: string[] = [];
  const revokes: string[] = [];
  let open = 0;
  const connect = async (onDisconnect: (error?: string) => void) => {
    await connecting.promise;
    open++;
    return {
      id: "tab",
      code: "c".repeat(32),
      grant: async (run: string) => {
        if (options.holdGrant) await granting.promise;
        grants.push(run);
      },
      revoke: async (run: string) => {
        revokes.push(run);
      },
      disconnect: () => {
        open--;
        onDisconnect();
      },
    };
  };
  const link = new WorldLink(connect as never);
  /** Lets every queued continuation run. */
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return {
    link,
    grants,
    revokes,
    connecting,
    granting,
    settle,
    open: () => open,
  };
}

describe("WorldLink in flight", () => {
  it("leaving World while the connection opens grants nothing and closes it", async () => {
    const t = slow();
    const following = t.link.follow(RUN, true);
    void t.link.follow(RUN, false);
    t.connecting.resolve();
    await following;
    await t.settle();
    expect(t.grants).toEqual([]);
    expect(t.open()).toBe(0);
    expect(t.link.state().connected).toBe(false);
  });

  it("unmounting while the connection opens grants nothing and closes it", async () => {
    const t = slow();
    const following = t.link.follow(RUN, true);
    t.link.close();
    t.connecting.resolve();
    await following;
    await t.settle();
    expect(t.grants).toEqual([]);
    expect(t.open()).toBe(0);
  });

  it("unmounting while Connect agents opens leaves nothing open", async () => {
    const t = slow();
    const toggling = t.link.toggle();
    t.link.close();
    t.connecting.resolve();
    await toggling;
    await t.settle();
    expect(t.open()).toBe(0);
    expect(t.link.state()).toEqual({ connected: false, code: "" });
  });

  it("a run that changes while the connection opens: only the new run is granted", async () => {
    const t = slow();
    const first = t.link.follow(RUN, true);
    const second = t.link.follow(NEXT, true);
    t.connecting.resolve();
    await Promise.all([first, second]);
    await t.settle();
    expect(t.grants).toEqual([NEXT]);
    expect(t.open()).toBe(1);
    expect(t.link.state().granted).toBe(NEXT);
  });

  it("a grant that lands after World left closes the session, and with it the grant", async () => {
    const t = slow({ holdGrant: true });
    t.connecting.resolve();
    const following = t.link.follow(RUN, true);
    await t.settle();
    void t.link.follow(undefined, true);
    t.granting.resolve();
    await following;
    expect(t.open()).toBe(0);
  });

  it("a grant that lands after the run changed is taken back; the new run is granted", async () => {
    const t = slow({ holdGrant: true });
    t.connecting.resolve();
    const first = t.link.follow(RUN, true);
    await t.settle();
    const second = t.link.follow(NEXT, true);
    t.granting.resolve();
    await Promise.all([first, second]);
    expect(t.revokes).toEqual([RUN]);
    expect(t.grants).toEqual([RUN, NEXT]);
    expect(t.link.state().granted).toBe(NEXT);
    expect(t.open()).toBe(1);
  });
});

describe("WorldLink keep policy", () => {
  function recording() {
    const connects: boolean[] = [];
    const gates: (() => void)[] = [];
    const connect = (onDisconnect: () => void, keep: boolean) => {
      connects.push(keep);
      const n = connects.length;
      return new Promise((resolve) =>
        gates.push(() =>
          resolve({
            id: `tab-${n}`,
            code: "c".repeat(32),
            grant: async () => {},
            revoke: async () => {},
            disconnect: () => onDisconnect(),
          }),
        ),
      );
    };
    const link = new WorldLink(connect as never);
    const settle = () => new Promise((r) => setTimeout(r, 0));
    return { link, connects, gates, settle };
  }

  it("Connect agents during an automatic connect makes its own, replacing it", async () => {
    const t = recording();
    const following = t.link.follow(RUN, true);
    const toggling = t.link.toggle();
    await t.settle();
    expect(t.connects).toEqual([true]);
    t.gates[0]();
    await t.settle();
    expect(t.connects).toEqual([true, false]);
    t.gates[1]();
    await Promise.all([toggling, following]);
    await t.settle();
    expect(t.link.state()).toMatchObject({
      code: "c".repeat(32),
      granted: RUN,
    });
  });

  it("the automatic link during Connect agents shares the person's connect", async () => {
    const t = recording();
    const toggling = t.link.toggle();
    const following = t.link.follow(RUN, true);
    t.gates[0]();
    await Promise.all([toggling, following]);
    await t.settle();
    expect(t.connects).toEqual([false]);
    expect(t.link.state()).toMatchObject({
      code: "c".repeat(32),
      granted: RUN,
    });
  });
});
