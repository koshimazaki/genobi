import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, vi } from "vitest";
import { VoiceService } from "../server/voice";
import { VoiceInstaller, type InstallDeps } from "../server/voice-install";
import { MODEL_BYTES } from "../server/voice-model";

/**
 * A fake installer: every process step and the worker load succeed unless a
 * test says otherwise, and the model download is a mock or a fake-model run.
 */
const roots: string[] = [];
export async function cleanInstallRoots() {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
}
export async function installFixture(extra: Partial<InstallDeps> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-install-test-"));
  roots.push(root);
  const worker = {
    ready: Promise.resolve({ model: "test", loadSeconds: 0, warmSeconds: 0 }),
    run: vi.fn(),
    kill: vi.fn(),
  };
  const voice = new VoiceService({
    config: { script: "/worker/voice_worker.py", ffmpeg: "ffmpeg" },
    start: () => worker,
  });
  const deps = {
    run: vi.fn().mockResolvedValue(undefined),
    download: vi
      .fn()
      .mockImplementation(async (_folder, _signal, progress, _sources) => {
        progress(MODEL_BYTES);
        return MODEL_BYTES;
      }),
    probe: vi.fn().mockResolvedValue(true),
    // The default parent is the test's own folder, never the checkout.
    folder: async () => root,
    discover: vi.fn().mockResolvedValue([]),
  };
  const installer = new VoiceInstaller(voice, root, { ...deps, ...extra });
  return { root, voice, deps, installer, worker };
}
export async function settled(installer: VoiceInstaller, owner = "studio") {
  await vi.waitFor(() => expect(installer.status(owner).busy).toBe(false));
  return installer.status(owner);
}
