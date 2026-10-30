import { afterEach, describe, expect, it, vi } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { savedVoiceConfig } from "../server/voice-settings";
import { MODEL_BYTES } from "../server/voice-model";
import {
  cleanInstallRoots,
  installFixture as fixture,
  settled,
} from "./voice-install-harness";
afterEach(cleanInstallRoots);
describe("confirmed local voice installation", () => {
  it("requires a session-bound unexpired confirmation before running anything", async () => {
    const { root, installer, deps } = await fixture();
    const info = await installer.describe("studio");
    await expect(
      installer.start("other", {
        token: info.token,
        confirmed: true,
        folder: root,
      }),
    ).rejects.toThrow("confirm again");
    await expect(
      installer.start("studio", {
        token: info.token,
        confirmed: false,
        folder: root,
      }),
    ).rejects.toThrow("Confirm");
    await expect(
      installer.start("studio", {
        token: info.token,
        confirmed: true,
        folder: "relative",
      }),
    ).rejects.toThrow("absolute");
    expect(deps.run).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });
  it("installs into a fresh child, checks the real worker and persists configuration before Ready", async () => {
    const { root, installer, deps, voice, worker } = await fixture();
    const { token } = await installer.describe("studio");
    await installer.start("studio", { token, confirmed: true, folder: root });
    expect((await settled(installer)).phase).toBe("ready");
    expect(deps.run.mock.calls.map((c) => c[1].slice(0, 3))).toEqual([
      ["-m", "venv", voice.config.python!.split("/bin/")[0]],
      ["-I", "-m", "pip"],
      ["-I", "/worker/voice_worker.py", "--check"],
    ]);
    expect(worker.kill).toHaveBeenCalled();
    expect(await savedVoiceConfig(root)).toMatchObject({
      python: voice.config.python,
      model: voice.config.model,
    });
    expect(installer.status("studio").bytes).toBe(MODEL_BYTES);
    expect(await readFile(path.join(root, "voice.json"), "utf8")).not.toContain(
      "token",
    );
    await expect(
      installer.start("studio", { token, confirmed: true, folder: root }),
    ).rejects.toThrow("confirm again");
  });
  it("cancels only the owner's job and removes partial installation without changing configuration", async () => {
    const { root, installer, deps, voice } = await fixture();
    deps.download.mockImplementation(
      (_folder, signal: AbortSignal) =>
        new Promise((_, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          ),
        ),
    );
    const { token } = await installer.describe("studio");
    await installer.start("studio", { token, confirmed: true, folder: root });
    await vi.waitFor(() => expect(deps.download).toHaveBeenCalled());
    await expect(installer.cancel("other")).rejects.toThrow("another studio");
    await expect(installer.cancel("studio")).resolves.toMatchObject({
      phase: "cancelled",
      busy: false,
    });
    expect(await readdir(root)).toEqual([]);
    expect(voice.config.model).toBeUndefined();
  });
  it("never advertises Ready or keeps files when model loading fails", async () => {
    const { root, installer, voice } = await fixture();
    vi.spyOn(voice, "checkConfiguration").mockRejectedValue(
      new Error("The model could not load on this machine."),
    );
    const { token } = await installer.describe("studio");
    await installer.start("studio", { token, confirmed: true, folder: root });
    expect(await settled(installer)).toMatchObject({
      phase: "error",
      error: "The model could not load on this machine.",
    });
    expect(await readdir(root)).toEqual([]);
    expect(await savedVoiceConfig(root)).toEqual({});
  });
});
