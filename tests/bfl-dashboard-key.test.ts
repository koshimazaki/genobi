import { describe, expect, it } from "vitest";
import { macKeychain } from "../server/keychain";
import { ServerKeys } from "../server/keys";
import { BFL, COMFY, FakeKeychain, startKeyServer } from "./keys-harness";
import { setup } from "./server-harness";

class DashboardKeychain extends FakeKeychain {
  dashboard: string | undefined = BFL;
  secretReads = 0;
  async hasBflDashboardKey() {
    return Boolean(this.dashboard);
  }
  async readBflDashboardKey() {
    this.secretReads++;
    return this.dashboard;
  }
}

describe("explicit BFL Dashboard key reuse", () => {
  it("discovers metadata without fetching the secret, then copies only on the owner action", async () => {
    const keychain = new DashboardKeychain();
    const { base } = await startKeyServer(new ServerKeys({}, keychain));
    expect(
      await (await fetch(`${base}/api/keys/bfl/dashboard`)).json(),
    ).toEqual({ available: true });
    expect(keychain.secretReads).toBe(0);
    expect(keychain.items.has("bfl")).toBe(false);
    const response = await fetch(`${base}/api/keys/bfl/dashboard`, {
      method: "PUT",
    });
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).not.toContain(BFL);
    expect(JSON.parse(body).keys.bfl).toEqual({
      connected: true,
      source: "keychain",
      revision: 1,
    });
    expect(keychain.items.get("bfl")).toBe(BFL);
    expect(keychain.secretReads).toBe(1);
    await fetch(`${base}/api/keys/bfl`, { method: "DELETE" });
    expect(keychain.items.has("bfl")).toBe(false);
    expect(keychain.dashboard).toBe(BFL);
    expect(
      (await (await fetch(`${base}/api/keys`)).json()).keys.bfl.connected,
    ).toBe(false);
  });

  it("does not read the dashboard secret for agents or when an environment key wins", async () => {
    const keychain = new DashboardKeychain();
    const { base } = await startKeyServer(
      new ServerKeys({ bfl: BFL }, keychain),
    );
    const agent = await fetch(`${base}/api/keys/bfl/dashboard`, {
      method: "PUT",
      headers: { "X-Genobi-Agent-Session": "1" },
    });
    expect(agent.status).toBe(403);
    const env = await fetch(`${base}/api/keys/bfl/dashboard`, {
      method: "PUT",
    });
    expect(env.status).toBe(409);
    expect((await env.json()).code).toBe("key_from_environment");
    expect(keychain.secretReads).toBe(0);
  });

  it("refuses a missing or malformed dashboard key without changing the saved key", async () => {
    const keychain = new DashboardKeychain();
    keychain.items.set("bfl", BFL);
    const { base } = await startKeyServer(new ServerKeys({}, keychain));
    for (const [value, status] of [
      [undefined, 404],
      [COMFY, 400],
      ['bad"key-value', 400],
    ] as const) {
      keychain.dashboard = value;
      const response = await fetch(`${base}/api/keys/bfl/dashboard`, {
        method: "PUT",
      });
      expect(response.status).toBe(status);
      expect(keychain.items.get("bfl")).toBe(BFL);
      const text = await response.text();
      expect(text).not.toContain(BFL);
      expect(text).not.toContain(COMFY);
    }
  });

  it("keeps a finishing BFL run on its original key and accepts the same key", async () => {
    const keychain = new DashboardKeychain();
    keychain.items.set("bfl", BFL);
    const { base, post } = await setup(
      undefined,
      undefined,
      undefined,
      new ServerKeys({}, keychain),
    );
    expect((await post("dashboard-key-guard")).status).toBe(202);
    keychain.dashboard = "bfl-another-key-123456";
    const refused = await fetch(`${base}/api/keys/bfl/dashboard`, {
      method: "PUT",
    });
    expect(refused.status).toBe(409);
    expect((await refused.json()).code).toBe("key_in_use");
    expect(keychain.items.get("bfl")).toBe(BFL);
    keychain.dashboard = BFL;
    expect(
      (await fetch(`${base}/api/keys/bfl/dashboard`, { method: "PUT" })).status,
    ).toBe(200);
  });

  it("holds the same slot lock while reading and saving the imported key", async () => {
    const keychain = new DashboardKeychain();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    keychain.readBflDashboardKey = async () => {
      entered();
      await held;
      return BFL;
    };
    const keys = new ServerKeys({}, keychain);
    const { base } = await startKeyServer(keys);
    const imported = fetch(`${base}/api/keys/bfl/dashboard`, { method: "PUT" });
    await started;
    let selected = false;
    const reservation = keys.reserving(async () => {
      selected = true;
      return keys.key("bfl");
    });
    await Promise.resolve();
    expect(selected).toBe(false);
    release();
    expect((await imported).status).toBe(200);
    expect(await reservation).toBe(BFL);
  });

  it("uses Dashboard selectors without requesting a secret during discovery", async () => {
    const calls: string[][] = [];
    const keychain = macKeychain(
      async (args) => {
        calls.push(args);
        return { code: 0, stdout: args.includes("-w") ? BFL : "metadata" };
      },
      { USER: "fixture-user" },
    );
    expect(await keychain.hasBflDashboardKey!()).toBe(true);
    expect(calls[0]).toEqual([
      "find-generic-password",
      "-s",
      "BFL Dashboard FLUX API Key",
      "-a",
      "fixture-user",
    ]);
    expect(await keychain.readBflDashboardKey!()).toBe(BFL);
    expect(calls[1]).toEqual([...calls[0], "-w"]);
    expect(calls.flat().join(" ")).not.toContain(BFL);
  });
});
