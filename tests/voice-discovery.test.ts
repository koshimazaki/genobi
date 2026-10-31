// Looking for a Qwen3-ASR-0.6B already on the machine before any download:
// only verified copies are offered (sizes and SHA-256 of the pinned files,
// here a fake three-file model), links and shared-writable folders are
// refused, the search stays bounded, and "Use this one" links the copy into
// a new install with the download step skipped.
import {
  access,
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultVoiceFolder,
  discoverVoiceModels,
  searchVoiceModels,
  verifiedVoiceModel,
} from "../server/voice-discovery";
import { VOICE_MODEL } from "../server/voice-model";
import { FAKE_FILES, writeFakeModel } from "./voice-fake-model";
import {
  cleanInstallRoots,
  installFixture,
  settled,
} from "./voice-install-harness";

vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return { ...fs, access: vi.fn(fs.access) };
});

const roots: string[] = [];
afterEach(async () => {
  await cleanInstallRoots();
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const signal = new AbortController().signal;

/** A fake home folder. */
async function home() {
  const root = await mkdtemp(path.join(os.tmpdir(), "genobi-voice-home-"));
  roots.push(root);
  return root;
}
/** A fake model folder at `parts` under `root`; `except` leaves files out. */
async function model(root: string, parts: string[], wrongSize = false) {
  const folder = path.join(root, ...parts, VOICE_MODEL);
  await mkdir(folder, { recursive: true });
  await writeFakeModel(folder);
  if (wrongSize) await writeFile(path.join(folder, "vocab.json"), "short");
  return folder;
}
const linux = { platform: "linux" as const };

describe("finding an existing voice model", () => {
  it("offers only verified copies: wrong size, links and shared folders are refused", async () => {
    const root = await home();
    const good = await model(root, ["Documents", "asr"]);
    await model(root, ["Downloads"], true);
    // A folder that is a link to the good copy, and a file that is a link.
    await mkdir(path.join(root, "linked"));
    await symlink(good, path.join(root, "linked", VOICE_MODEL));
    const fileLink = await model(root, ["Music"]);
    await rm(path.join(fileLink, "config.json"));
    await symlink(
      path.join(good, "config.json"),
      path.join(fileLink, "config.json"),
    );
    const shared = await model(root, ["Shared"]);
    await chmod(shared, 0o777);
    const found = await discoverVoiceModels(signal, {
      home: root,
      env: {},
      files: FAKE_FILES,
      search: linux,
    });
    expect(found).toEqual([
      {
        folder: good,
        label: `~/Documents/asr/${VOICE_MODEL}`,
        source: "search",
      },
    ]);
    expect(
      await verifiedVoiceModel(
        path.join(root, "linked", VOICE_MODEL),
        signal,
        FAKE_FILES,
      ),
    ).toBe(false);
    expect(await verifiedVoiceModel(fileLink, signal, FAKE_FILES)).toBe(false);
    expect(await verifiedVoiceModel(shared, signal, FAKE_FILES)).toBe(false);
  });

  it("puts GENOBI_VOICE_MODEL and earlier installs first, without duplicates", async () => {
    const root = await home();
    const named = await model(root, ["Models"]);
    const parent = path.join(root, "genobi-models");
    const earlier = await model(parent, ["genobi-voice-abc"]);
    await chmod(path.dirname(earlier), 0o700);
    const found = await discoverVoiceModels(signal, {
      home: root,
      env: { GENOBI_VOICE_MODEL: named },
      parents: [parent],
      files: FAKE_FILES,
      search: linux,
    });
    expect(found.map((item) => [item.source, item.folder])).toEqual([
      ["configured", named],
      ["genobi", earlier],
    ]);
  });

  it("keeps the search bounded: depth, folder count, skipped folders, links", async () => {
    const root = await home();
    await model(root, ["node_modules", "pkg"]);
    await model(root, [".cache"]);
    await model(root, ["Library", "Caches"]);
    await model(root, ["a", "b", "c", "d", "e", "f", "g"]);
    const near = await model(root, ["work"]);
    await mkdir(path.join(root, "away"));
    await symlink(path.join(root, "work"), path.join(root, "away", "work"));
    expect(await searchVoiceModels({ home: root, ...linux })).toEqual([near]);
    expect(
      await searchVoiceModels({ home: root, ...linux, maxFolders: 1 }),
    ).toEqual([]);
    expect(
      await searchVoiceModels({ home: root, ...linux, maxResults: 0 }),
    ).toEqual([]);
  });

  it("uses Spotlight on macOS, keeps only exact folders under home, and walks when it fails", async () => {
    const root = await home();
    const near = await model(root, ["work"]);
    const spotlight = vi.fn(async () => [
      near,
      path.join(root, ".Trash", VOICE_MODEL),
      path.join(root, "node_modules", VOICE_MODEL),
      `${near}-copy`,
      `/elsewhere/${VOICE_MODEL}`,
      "relative/Qwen3-ASR-0.6B",
    ]);
    expect(
      await searchVoiceModels({ home: root, platform: "darwin", spotlight }),
    ).toEqual([near]);
    expect(spotlight).toHaveBeenCalledWith(root);
    const down = vi.fn(async () => undefined);
    expect(
      await searchVoiceModels({
        home: root,
        platform: "darwin",
        spotlight: down,
      }),
    ).toEqual([near]);
  });

  it("defaults new installs to a visible models folder, or Documents", async () => {
    const root = await home();
    const checkout = path.join(root, "checkout");
    await mkdir(checkout);
    expect(await defaultVoiceFolder(checkout, root)).toBe(
      path.join(checkout, "models"),
    );
    // chmod does not deny root's access(W_OK). Exercise the same EACCES
    // response on every CI/container user without changing production code.
    vi.mocked(access).mockRejectedValueOnce(
      Object.assign(new Error("Permission denied"), { code: "EACCES" }),
    );
    expect(await defaultVoiceFolder(checkout, root)).toBe(
      path.join(root, "Documents", "Genobi"),
    );
    expect(access).toHaveBeenLastCalledWith(checkout, 2);
  });
});

describe("Use this one", () => {
  async function fixture() {
    const root = await home();
    const found = await model(root, ["Documents", "asr"]);
    const setup = await installFixture({
      files: FAKE_FILES,
      discover: (abort) =>
        discoverVoiceModels(abort, {
          home: root,
          env: {},
          files: FAKE_FILES,
          search: linux,
        }),
    });
    return { ...setup, found, home: root };
  }

  it("links the verified copy into a new install and skips the download", async () => {
    const { root, installer, deps, found, voice } = await fixture();
    expect(await installer.found()).toEqual({
      models: [expect.objectContaining({ folder: found })],
    });
    const { token } = await installer.describe("studio");
    await installer.start("studio", {
      token,
      confirmed: true,
      folder: root,
      model: found,
    });
    expect(await settled(installer)).toMatchObject({
      phase: "ready",
      reused: true,
      // The temporary folder is outside the home folder, so shown in full.
      found,
      steps: {
        environment: "done",
        check: "done",
        download: "skipped",
        runtime: "done",
        verify: "done",
        activate: "done",
      },
    });
    expect(deps.download).not.toHaveBeenCalled();
    expect(voice.config.model).toContain(path.join(root, "genobi-voice-"));
    expect((await readdir(voice.config.model!)).sort()).toEqual(
      FAKE_FILES.map((file) => file.name).sort(),
    );
    // The copy it came from is left where it was.
    expect((await readdir(found)).length).toBe(FAKE_FILES.length);
  });

  it("adopts only a folder the last search verified", async () => {
    const { root, installer, deps, home: fakeHome } = await fixture();
    const { token } = await installer.describe("studio");
    const elsewhere = await model(fakeHome, ["not-searched"]);
    await expect(
      installer.start("studio", {
        token,
        confirmed: true,
        folder: root,
        model: elsewhere,
      }),
    ).rejects.toThrow("Look for the model again");
    expect(deps.run).not.toHaveBeenCalled();
  });
});
