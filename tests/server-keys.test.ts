import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { macKeychain } from "../server/keychain";
import { jobKeyKind, runCredential, ServerKeys } from "../server/keys";
import type { StoredJob } from "../server/store";
import { chooseKey } from "../shared/provider";
import {
  BFL,
  COMFY,
  FakeKeychain,
  fakeComfy,
  startKeyServer as start,
} from "./keys-harness";
import { input, setup } from "./server-harness";

// Comfy routes plus BFL overrides; saved keys never return to the page.

describe("which server key a run uses", () => {
  const both = { comfy: COMFY, bfl: BFL };
  it("uses BFL for compatible models and keeps Comfy-only models on Comfy", () => {
    expect(chooseKey("video", "flux-3", both)).toBe(BFL);
    expect(chooseKey("video", "ltx-2.5", both)).toBe(COMFY);
    expect(chooseKey("image", "flux-3-klein", both)).toBe(COMFY);
    expect(chooseKey("image", "flux-3", both)).toBe(BFL);
    expect(chooseKey("upscale", "flux-3", both)).toBe(BFL);
  });
  it("also uses BFL for its exclusive Klein API", () => {
    expect(chooseKey("image", "flux-3-klein-api", both)).toBe(BFL);
  });
  it("returns the one key held, so the route check can explain a refusal", () => {
    expect(chooseKey("upscale", "flux-3", { comfy: COMFY })).toBe(COMFY);
    expect(chooseKey("upscale", "flux-3", { bfl: BFL })).toBe(BFL);
    expect(chooseKey("video", "ltx-2.5", { bfl: BFL })).toBe(BFL);
    expect(chooseKey("video", "flux-3", {})).toBeUndefined();
  });
});

describe("the refusal with no key names the route's own key", () => {
  // With no key set, a Router LTX or Cloud Klein quote was
  // refused with "Enter a valid BFL API key.", though both routes need Comfy.
  const none = ServerKeys.single();
  it("asks for Comfy on Router LTX and the Klein workflow", () => {
    for (const model of ["ltx-2.5", "ltx-2.5-pro", "flux-3-klein"] as const)
      expect(() => runCredential(none, "video", model)).toThrow(
        "Connect a Comfy key first.",
      );
  });
  it("asks for a BFL key only on Klein's API", () => {
    expect(() => runCredential(none, "image", "flux-3-klein-api")).toThrow(
      "Connect a BFL key first.",
    );
  });
  it("asks for either key on FLUX 3 and the upscale", () => {
    expect(() => runCredential(none, "video", "flux-3")).toThrow(
      "Connect your Comfy or BFL key first.",
    );
    expect(() => runCredential(none, "upscale", "flux-3")).toThrow(
      "Connect your Comfy or BFL key first.",
    );
  });
  it("never names BFL for a route that does not use it", () => {
    for (const model of ["ltx-2.5", "flux-3-klein"] as const)
      expect(() => runCredential(none, "video", model)).not.toThrow(/BFL/);
  });
  it("refuses a malformed key generically, not as a BFL key", () => {
    expect(() => runCredential(none, "video", "ltx-2.5", "short")).toThrow(
      "Enter a valid API key.",
    );
    expect(() => runCredential(none, "video", "ltx-2.5", "short")).not.toThrow(
      /BFL/,
    );
  });
});

describe("the server's key slots", () => {
  it("loads saved keys, lets the environment win, and reports only status", async () => {
    const keychain = new FakeKeychain();
    keychain.items.set("comfy", "comfyui-saved-key-1234");
    keychain.items.set("bfl", BFL);
    const keys = ServerKeys.fromEnvironment(
      { COMFY_API_KEY: COMFY, BFL_API_KEY: "" },
      keychain,
    );
    await keys.load();
    expect(keys.key("comfy")).toBe(COMFY);
    expect(keys.key("bfl")).toBe(BFL);
    const status = keys.status();
    expect(status).toEqual({
      keychain: true,
      comfy: { connected: true, source: "environment", revision: 0 },
      bfl: { connected: true, source: "keychain", revision: 0 },
    });
    expect(JSON.stringify(status)).not.toMatch(/comfyui-|bfl-/);
  });
  it("refuses to save over an environment key, a wrong slot or an odd key", async () => {
    const keys = ServerKeys.fromEnvironment(
      { COMFY_API_KEY: COMFY },
      new FakeKeychain(),
    );
    await expect(keys.save("comfy", "comfyui-other-key")).rejects.toMatchObject(
      { status: 409, code: "key_from_environment" },
    );
    await expect(keys.save("bfl", COMFY)).rejects.toMatchObject({
      status: 400,
    });
    await expect(keys.save("bfl", 'bfl-key"quoted')).rejects.toMatchObject({
      status: 400,
    });
  });
  it("cannot save without a Keychain", async () => {
    await expect(new ServerKeys().save("comfy", COMFY)).rejects.toMatchObject({
      status: 501,
      code: "keychain_unavailable",
    });
  });
  it("polls a job with the key of the provider it was sent to", () => {
    const job = (fields: Partial<StoredJob>) => fields as StoredJob;
    const take = (route: "bfl" | "router" | "workflow") => ({
      recipe: { id: "x", version: 1, route },
      inputs: [],
    });
    expect(jobKeyKind(job({ take: take("bfl") }))).toBe("bfl");
    expect(jobKeyKind(job({ take: take("router") }))).toBe("comfy");
    expect(jobKeyKind(job({ take: take("workflow") }))).toBe("comfy");
    expect(jobKeyKind(job({ generator: "upscale" }))).toBe("bfl");
    expect(
      jobKeyKind(
        job({
          generator: "video",
          pollingUrl: "https://api.us1.bfl.ai/v1/get_result?id=1",
        }),
      ),
    ).toBe("bfl");
  });
});

describe("the macOS Keychain adapter", () => {
  it("passes the key on standard input, never as an argument", async () => {
    const runs: { args: string[]; input?: string }[] = [];
    let stored = "";
    const keychain = macKeychain(async (args, input) => {
      runs.push({ args, input });
      if (args[0] === "-i") {
        stored = /-w (\S+)/.exec(input ?? "")?.[1] ?? "";
        return { code: 0, stdout: "" };
      }
      if (args[0] === "find-generic-password")
        return stored
          ? { code: 0, stdout: `${stored}\n` }
          : { code: 44, stdout: "" };
      stored = "";
      return { code: 0, stdout: "" };
    });
    expect(await keychain.read("comfy")).toBeUndefined();
    await keychain.write("comfy", COMFY);
    expect(await keychain.read("comfy")).toBe(COMFY);
    await keychain.remove("comfy");
    for (const run of runs) expect(run.args.join(" ")).not.toContain(COMFY);
    expect(runs[1]).toEqual({
      args: ["-i"],
      input: `add-generic-password -U -s Genobi -a comfy -w ${COMFY}\n`,
    });
  });
  it("fails a write it cannot read back", async () => {
    const keychain = macKeychain(async (args) =>
      args[0] === "-i" ? { code: 0, stdout: "" } : { code: 51, stdout: "" },
    );
    await expect(keychain.write("bfl", BFL)).rejects.toThrow(
      "keychain_unavailable",
    );
  });
});

describe("local key and agent routes", () => {
  it("saves a key to the Keychain and answers only with its status", async () => {
    const keychain = new FakeKeychain();
    const { base } = await start(new ServerKeys({}, keychain));
    expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({
      hasServerKey: false,
    });
    const saved = await fetch(`${base}/api/keys/comfy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: COMFY }),
    });
    const body = await saved.text();
    expect(saved.status).toBe(200);
    expect(body).not.toContain(COMFY);
    expect(JSON.parse(body).keys.comfy).toEqual({
      connected: true,
      source: "keychain",
      revision: 1,
    });
    expect(keychain.items.get("comfy")).toBe(COMFY);
    expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({
      hasServerKey: true,
    });
    const removed = await fetch(`${base}/api/keys/comfy`, {
      method: "DELETE",
    });
    expect((await removed.json()).keys.comfy).toEqual({
      connected: false,
      revision: 2,
    });
    expect(keychain.items.has("comfy")).toBe(false);
    expect(
      (await fetch(`${base}/api/keys/openai`, { method: "DELETE" })).status,
    ).toBe(404);
    // The removed Runware slot is no route, and its Keychain item is left as is.
    keychain.items.set("runware" as never, "rw-left-alone-0000");
    for (const method of ["PUT", "DELETE"])
      expect((await fetch(`${base}/api/keys/runware`, { method })).status).toBe(
        404,
      );
    expect(keychain.items.get("runware" as never)).toBe("rw-left-alone-0000");
    expect(
      Object.keys((await (await fetch(`${base}/api/keys`)).json()).keys),
    ).not.toContain("runware");
  });

  it("reports whether each agent runner is set up, and nothing else", async () => {
    const { base } = await start(new ServerKeys());
    const { runners } = await (await fetch(`${base}/api/agent/runners`)).json();
    expect(runners).toEqual([
      expect.objectContaining({ id: "claude-code", installed: false }),
      expect.objectContaining({ id: "hermes", installed: true }),
      expect.objectContaining({ id: "codex", installed: false }),
    ]);
  });

  it("sends a video run on BFL when both slots are set, without storing either key", async () => {
    const { provider: comfy, calls } = fakeComfy();
    const sent = calls.submit;
    const { base, directory, bfl } = await setup(
      undefined,
      undefined,
      undefined,
      new ServerKeys({ comfy: COMFY, bfl: BFL }),
      undefined,
      comfy,
    );
    const health = await fetch(`${base}/api/health`);
    const cookie = health.headers.get("set-cookie")!.split(";")[0];
    const response = await fetch(`${base}/api/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "8f2ad7f4-6f3b-4c55-9b4e-6a2f7c3b1d01",
        Cookie: cookie,
      },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(202);
    expect(sent).toEqual([]);
    expect(bfl.submissions).toBe(1);
    const stored = await readFile(path.join(directory, "jobs.json"), "utf8");
    expect(stored).not.toContain(COMFY);
    expect(stored).not.toContain(BFL);
  });
});
