import ThemedSelect from "../components/ThemedSelect";
import { useEffect, useRef, useState } from "react";
import { download } from "../director/bundle";
import {
  freeName,
  layoutsFile,
  MAX_LAYOUT_NAME,
  MAX_LAYOUTS_FILE_BYTES,
  parseLayoutsText,
  type RailChoices,
  type SavedLayout,
} from "../../shared/saved-layouts";
import type { NinjaLayout } from "../../shared/ninja-layout";
import {
  deleteSavedLayout,
  loadSavedLayouts,
  newLayoutId,
  putSavedLayout,
  type LayoutHome,
} from "./saved-layouts-client";

const WHERE: Record<LayoutHome, string> = {
  server: "Kept by the studio server on this machine, for every browser on it.",
  browser:
    "Kept in this browser. Export them to open the same layouts on another device.",
};

/**
 * Named layouts inside Ninja's configuration: save the current arrangement
 * under a name, open one, rename, delete, go back to the default, and move
 * them between devices as one JSON file.
 */
export function SavedLayouts({
  layout,
  rails,
  onApply,
  onMessage,
}: {
  layout: NinjaLayout;
  rails: RailChoices;
  /** Opens a layout; `undefined` opens the default arrangement. */
  onApply: (saved: SavedLayout | undefined) => boolean;
  onMessage: (message: string) => void;
}) {
  const [home, setHome] = useState<LayoutHome>();
  const [list, setList] = useState<SavedLayout[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadSavedLayouts(controller.signal).then((answer) => {
      if (controller.signal.aborted) return;
      setHome(answer.home);
      setList(answer.layouts);
    });
    return () => controller.abort();
  }, []);
  const current = list.find((l) => l.id === selected);

  async function run(work: (home: LayoutHome) => Promise<string>) {
    if (!home || busy) return;
    setBusy(true);
    try {
      onMessage(await work(home));
    } catch (error) {
      onMessage(
        error instanceof Error ? error.message : "Could not change layouts.",
      );
    } finally {
      setBusy(false);
    }
  }
  const saveAs = () =>
    run(async (where) => {
      const id = newLayoutId();
      const next = await putSavedLayout(where, id, { name, layout, rails });
      setList(next);
      setSelected(id);
      setName("");
      return `Saved as “${next.find((l) => l.id === id)?.name}”.`;
    });
  const update = () =>
    run(async (where) => {
      if (!current) return "Choose a saved layout to update.";
      setList(
        await putSavedLayout(where, current.id, {
          name: current.name,
          layout,
          rails,
        }),
      );
      return `“${current.name}” now holds this arrangement.`;
    });
  const rename = () =>
    run(async (where) => {
      if (!current) return "Choose a saved layout to rename.";
      setList(
        await putSavedLayout(where, current.id, {
          name,
          layout: current.layout,
          rails: current.rails,
        }),
      );
      setName("");
      return "Layout renamed.";
    });
  const remove = () =>
    run(async (where) => {
      if (!current) return "Choose a saved layout to delete.";
      setList(await deleteSavedLayout(where, current.id));
      setSelected("");
      return `Deleted “${current.name}”.`;
    });
  const importFile = (text: Promise<string>) =>
    run(async (where) => {
      let next = list;
      for (const entry of parseLayoutsText(await text)) {
        // The same id replaces that layout: the file came from this list.
        next = await putSavedLayout(where, entry.id, {
          name: freeName(next, entry.name, entry.id),
          layout: entry.layout,
          rails: entry.rails,
        });
        setList(next);
      }
      return "Layouts imported. Choose one to open it.";
    });

  return (
    <fieldset className="genobi-saved-layouts" disabled={!home || busy}>
      <legend>Saved layouts</legend>
      <div className="genobi-layout-actions">
        <ThemedSelect
          aria-label="Saved layout"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Default arrangement</option>
          {list.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </ThemedSelect>
        <button
          onClick={() => {
            const opened = current
              ? `Opened “${current.name}”.`
              : "Default arrangement opened.";
            onMessage(
              onApply(current)
                ? opened
                : `${opened} Browser storage is unavailable, so a reload will not keep it. Download the layout JSON to keep it.`,
            );
          }}
        >
          Open
        </button>
        <input
          aria-label="Layout name"
          placeholder="Layout name"
          maxLength={MAX_LAYOUT_NAME}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button disabled={!name.trim()} onClick={saveAs}>
          Save as
        </button>
        <button disabled={!current} onClick={update}>
          Update
        </button>
        <button disabled={!name.trim() || !current} onClick={rename}>
          Rename
        </button>
        <button disabled={!current} onClick={remove}>
          Delete
        </button>
        <button
          disabled={!list.length}
          onClick={() => {
            download(
              new Blob([JSON.stringify(layoutsFile(list), null, 2)], {
                type: "application/json",
              }),
              "genobi-layouts.json",
            );
            onMessage("Layouts exported. Import the file on another device.");
          }}
        >
          Export
        </button>
        <button onClick={() => file.current?.click()}>Import</button>
      </div>
      <p className="genobi-saved-where">{home ? WHERE[home] : "Reading…"}</p>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Import saved layouts JSON"
        onChange={(e) => {
          const chosen = e.target.files?.[0];
          e.target.value = "";
          if (!chosen) return;
          if (chosen.size > MAX_LAYOUTS_FILE_BYTES)
            onMessage("Layout files must be under 180 KB.");
          else importFile(chosen.text());
        }}
      />
    </fieldset>
  );
}
