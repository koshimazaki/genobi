import { useCallback, useEffect, useRef, useState } from "react";
import type { BuilderSession } from "./useBuilderSession";
import type { WorldEditor } from "./useWorldEditor";
import type { BuilderAssets } from "./useBuilderAssets";
import type { Take } from "./export-take";
import { keepOnce } from "./take-channel";
import { agentCapture } from "./agent-capture";
import type { Recipe } from "./recipe";
import { addedMessage, type AddAsset } from "../studio/project-assets";
import { findLibraryTake, sendLibraryTake } from "./send-take";
import {
  asTake,
  createTakeLibrary,
  indexedDbBackend,
  type LibraryTake,
} from "./take-library";
import {
  builtInPresets,
  findPreset,
  loadSaved,
  storeSaved,
  withSaved,
  type ScenePreset,
} from "./world-presets";
import type { PresetSummary, TakeSummary } from "./scene-adapter";
import { noteWorldPreset } from "../agent/world-context";

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** What an agent reads about the library: names and lengths, no bytes. */
export const presetSummary = ({
  name,
  source,
  summary,
  file,
}: ScenePreset): PresetSummary => ({
  name,
  source,
  summary,
  ...(file ? { file } : {}),
});
export const takeSummary = (t: LibraryTake): TakeSummary => ({
  id: t.id,
  name: t.name,
  mode: t.mode,
  seconds: Math.round(t.seconds * 100) / 100,
  frames: t.frames,
  bytes: t.bytes,
  createdAt: new Date(t.createdAt).toISOString(),
});

/**
 * Loads a preset the way the Scene menu does: Play stops, Build returns to
 * Shot, and the current sound stays with the scene. Walk is refused.
 */
export async function applyPreset(
  s: Pick<BuilderSession, "setPlaying" | "api">,
  e: Pick<WorldEditor, "mode" | "chooseMode" | "select">,
  recipe: Recipe,
) {
  // Leaving Walk saves the walked position through its own configure, which
  // would race this one; Walk is left by hand first, as the Scene menu asks.
  if (e.mode === "walk")
    throw new Error("Return to Shot camera before loading a preset.");
  s.setPlaying(false);
  if (e.mode !== "shot") e.chooseMode("shot");
  const adapter = s.api.current;
  if (!adapter) throw new Error("The scene is still starting.");
  const current = adapter.getRecipe();
  const next = await adapter.configure({
    ...recipe,
    envelope: current.envelope,
    bandEnvelopes: current.bandEnvelopes,
  });
  e.select("");
  return next;
}

/**
 * The scene library below the viewport: every take of this browser (the
 * button, an agent's `capture()`, a live recording) and the presets. A take
 * is appended when the session publishes it, as the capture resolves, so a
 * configure straight after `await capture()` cannot clear it first; each take
 * is kept once however often it is published.
 */
export function useSceneLibrary(
  s: BuilderSession,
  e: WorldEditor,
  a: BuilderAssets,
  onAsset?: AddAsset,
) {
  const library = useRef(createTakeLibrary(indexedDbBackend()));
  const [takes, setTakes] = useState<LibraryTake[]>([]);
  const [saved, setSaved] = useState<ScenePreset[]>(loadSaved);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState("");
  const latest = useRef({ s, e, a, saved, takes, working, onAsset });
  latest.current = { s, e, a, saved, takes, working, onAsset };
  /** Each take's append to the library, which an agent's capture awaits. */
  const appended = useRef(new WeakMap<Take, Promise<unknown>>());

  useEffect(() => {
    let alive = true;
    void library.current.load().then((list) => {
      if (alive) setTakes([...list]);
    });
    return () => {
      alive = false;
    };
  }, []);

  const keep = useRef(
    keepOnce((take: Take) => {
      const append = library.current.append(take).then(({ takes, evicted }) => {
        setTakes([...takes]);
        setMessage(
          [
            `${take.name} kept in the library${
              library.current.persisted() ? "" : " for this tab only"
            }.`,
            evicted.length
              ? `${evicted.length} older take${evicted.length > 1 ? "s" : ""} removed to stay within 20 takes and 500 MB.`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
      });
      appended.current.set(take, append);
      return append;
    }),
  );
  // Subscribed for the session's life, so no take produced while mounted is missed.
  const { onTake } = s;
  useEffect(() => onTake((take) => void keep.current(take)), [onTake]);

  const presets = [...builtInPresets(), ...saved];

  // The agent's half: attached to the adapter the session already exposes as
  // `window.directorScene`, and taken away again when the view unmounts.
  useEffect(() => {
    const adapter = s.api.current;
    if (!s.ready || !adapter) return;
    adapter.listPresets = () =>
      [...builtInPresets(), ...latest.current.saved].map(presetSummary);
    adapter.loadPreset = async (name: string) => {
      if (typeof name !== "string") throw new Error("Name a preset.");
      const { s, e, saved } = latest.current;
      const preset = findPreset(name, saved);
      const recipe = await applyPreset(s, e, preset.recipe);
      noteWorldPreset(preset.name);
      return recipe;
    };
    adapter.listTakes = () => latest.current.takes.map(takeSummary);
    adapter.captureTake = (name: string) => {
      const { s, e, a } = latest.current;
      return agentCapture(
        {
          mode: () => s.runtime.current?.editor?.mode ?? e.mode,
          recording: () => adapter.live.status().recording,
          busy: () => s.busy || s.capturing,
          saving: () => a.saving === "take",
        },
        // As the Capture button: Play stops first, then the take is made.
        (name) => s.stopping(() => adapter.capture({ name }))(),
        (take) => appended.current.get(take) ?? Promise.resolve(),
        name,
      );
    };
    // The card's Send to Director for a take named by the paired agent.
    adapter.sendTake = async (key: string) => {
      const { a, takes, working, onAsset } = latest.current;
      const take = findLibraryTake(takes, key);
      if (a.saving || working)
        throw new Error("Wait for the take being added to assets.");
      return sendLibraryTake(take, onAsset, a.addTake);
    };
    return () => {
      delete adapter.sendTake;
      delete adapter.listPresets;
      delete adapter.loadPreset;
      delete adapter.listTakes;
      delete adapter.captureTake;
    };
  }, [s.ready, s.api]);

  const act = useCallback(
    (label: string, work: () => Promise<string | void>) => {
      setWorking(label);
      setMessage("");
      void work()
        .then((text) => text && setMessage(text))
        .catch((err) => setMessage(errorText(err)))
        .finally(() => setWorking(""));
    },
    [],
  );

  return {
    takes,
    presets,
    message,
    working,
    persisted: () => library.current.persisted(),
    toAssets: Boolean(onAsset),
    loadPreset: (preset: ScenePreset) =>
      act("preset", async () => {
        await applyPreset(s, e, preset.recipe);
        noteWorldPreset(preset.name);
        return `Loaded ${preset.name}. The sound stays; reattach any screen or surface media.`;
      }),
    savePreset: (name: string) =>
      act("save", async () => {
        const next = withSaved(saved, name, s.api.current!.getRecipe());
        setSaved(next);
        return storeSaved(next)
          ? `Saved ${next[0].name} in this browser.`
          : `Saved ${next[0].name} for this tab only; this browser keeps no site data.`;
      }),
    removePreset: (name: string) => {
      const next = saved.filter((p) => p.name !== name);
      setSaved(next);
      storeSaved(next);
    },
    loadTake: (take: LibraryTake) =>
      act("load", async () => {
        if (!take.recipe) throw new Error("This take's receipt has no recipe.");
        await applyPreset(s, e, take.recipe);
        noteWorldPreset(undefined);
        return `Loaded the recipe of ${take.name}.`;
      }),
    /** The take as MP4 (and WAV) under Project, as Capture's own add does. */
    addTake: (take: LibraryTake) =>
      act("add", async () => {
        await a.addTake(asTake(take), take);
        return "";
      }),
    /**
     * Send to Director: the first frame under Inspirations, where the
     * Director's prompt takes references, and the take under Project as
     * media to place (the `directorUse` split of Scrolls).
     */
    sendTake: (take: LibraryTake) =>
      act("send", async () => {
        const { frame } = await sendLibraryTake(take, onAsset, a.addTake);
        return addedMessage(frame);
      }),
    removeTake: (take: LibraryTake) =>
      act("remove", async () => {
        setTakes([...(await library.current.remove(take.id))]);
        return `${take.name} removed from the library.`;
      }),
  };
}
export type SceneLibraryState = ReturnType<typeof useSceneLibrary>;
