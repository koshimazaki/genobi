import {
  chmod,
  mkdir,
  readdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { previousVoiceModels } from "../server/voice-discovery";
import { downloadVoiceModel, VOICE_MODEL } from "../server/voice-model";
import { savedVoiceConfig } from "../server/voice-settings";
import {
  FAKE_FILES,
  FAKE_NAMES,
  FAKE_TOTAL,
  fakeBytes,
  fakeHub,
  writeFakeModel,
} from "./voice-fake-model";
import {
  cleanInstallRoots,
  installFixture,
  settled,
} from "./voice-install-harness";

afterEach(async () => {
  vi.unstubAllGlobals();
  await cleanInstallRoots();
});

/** The installer with the real download logic over the fake model. */
async function fixture() {
  const setup = await installFixture({ files: FAKE_FILES });
  setup.deps.download.mockImplementation(
    (folder: string, signal: AbortSignal, progress, sources: string[]) =>
      downloadVoiceModel(folder, signal, progress, sources, FAKE_FILES),
  );
  return setup;
}
/** An earlier install in the chosen folder, as the installer leaves one. */
async function earlierInstall(root: string, name = "genobi-voice-earlier") {
  const model = path.join(root, name, VOICE_MODEL);
  await mkdir(model, { recursive: true });
  await chmod(path.join(root, name), 0o700);
  await writeFakeModel(model);
  return model;
}
async function confirmAndStart(
  installer: Awaited<ReturnType<typeof fixture>>["installer"],
  root: string,
) {
  const { token } = await installer.describe("studio");
  return installer.start("studio", { token, confirmed: true, folder: root });
}

describe("voice install with the model already on disk", () => {
  it("model present: verifies only, never downloads, and ends Ready", async () => {
    const { root, installer, voice } = await fixture();
    await earlierInstall(root);
    const { fetcher } = fakeHub();
    await confirmAndStart(installer, root);
    expect(await settled(installer)).toMatchObject({
      phase: "ready",
      reused: true,
      bytes: FAKE_TOTAL,
      // The check comes first and finds it, so the download is skipped.
      steps: { check: "done", download: "skipped", runtime: "done" },
      found: expect.stringContaining("genobi-voice-earlier"),
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(voice.config.model).not.toContain("genobi-voice-earlier");
    for (const name of FAKE_NAMES)
      expect(await readFile(path.join(voice.config.model!, name))).toEqual(
        fakeBytes[name],
      );
    expect(await savedVoiceConfig(root)).toMatchObject({
      model: voice.config.model,
    });
  });

  it("model absent: downloads it and ends Ready", async () => {
    const { root, installer } = await fixture();
    const { fetched } = fakeHub();
    await confirmAndStart(installer, root);
    expect(await settled(installer)).toMatchObject({
      phase: "ready",
      reused: false,
      steps: { check: "done", download: "done" },
    });
    expect(installer.status("studio")).not.toHaveProperty("found");
    expect(fetched()).toEqual(FAKE_NAMES);
  });

  it("wrong-size file: downloads that file again and keeps the verified rest", async () => {
    const { root, installer } = await fixture();
    const earlier = await earlierInstall(root);
    await chmod(path.join(earlier, "model.safetensors"), 0o600);
    await writeFile(path.join(earlier, "model.safetensors"), "w".repeat(10));
    const { fetched } = fakeHub();
    await confirmAndStart(installer, root);
    expect(await settled(installer)).toMatchObject({
      phase: "ready",
      reused: false,
    });
    expect(fetched()).toEqual(["model.safetensors"]);
  });

  it("cancel mid-download removes this attempt, and the next one is clean", async () => {
    const { root, installer, deps, voice } = await fixture();
    deps.download.mockImplementationOnce(
      (_folder: string, signal: AbortSignal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("stop")), {
            once: true,
          }),
        ),
    );
    await confirmAndStart(installer, root);
    await vi.waitFor(() => expect(deps.download).toHaveBeenCalledTimes(1));
    await expect(installer.cancel("studio")).resolves.toMatchObject({
      phase: "cancelled",
      busy: false,
    });
    expect(await readdir(root)).toEqual([]);
    expect(voice.config.model).toBeUndefined();
    // The used grant is gone; a new confirmation starts a fresh install.
    fakeHub();
    await confirmAndStart(installer, root);
    expect(await settled(installer)).toMatchObject({ phase: "ready" });
    expect(
      (await readdir(root)).filter((n) => n.startsWith("genobi-voice-")),
    ).toHaveLength(1);
  });

  it("only offers our own private earlier installs as sources", async () => {
    const { root } = await installFixture();
    const own = await earlierInstall(root, "genobi-voice-own");
    await earlierInstall(root, "genobi-voice-shared");
    await chmod(path.join(root, "genobi-voice-shared"), 0o777);
    await earlierInstall(root, "someone-else");
    await symlink(
      path.join(root, "genobi-voice-own"),
      path.join(root, "genobi-voice-link"),
    );
    // A private install whose model folder is a link elsewhere is not offered.
    await mkdir(path.join(root, "genobi-voice-inner-link"), { mode: 0o700 });
    await symlink(own, path.join(root, "genobi-voice-inner-link", VOICE_MODEL));
    // Nor one whose model folder others may write.
    const open = await earlierInstall(root, "genobi-voice-open-model");
    await chmod(open, 0o777);
    const current = path.join(root, "genobi-voice-current");
    await mkdir(current, { mode: 0o700 });
    expect(await previousVoiceModels(root, current)).toEqual([own]);
  });
});
