import {
  layoutsFile,
  LayoutError,
  parseLayoutInput,
  readSavedLayouts,
  removeLayout,
  upsertLayout,
  type RailChoices,
  type SavedLayout,
} from "../../shared/saved-layouts";
import type { NinjaLayout } from "../../shared/ninja-layout";

/**
 * Where saved layouts live for this page: the local server's machine-wide
 * list, or, on the hosted studio (which has no layouts route) or when no
 * server answers, this browser's storage.
 */
export type LayoutHome = "server" | "browser";
export const SAVED_LAYOUTS_KEY = "genobi.saved-layouts.v1";

export interface LayoutDraft {
  name: string;
  layout: NinjaLayout;
  rails: RailChoices;
}

function readBrowser(): SavedLayout[] {
  try {
    const text = localStorage.getItem(SAVED_LAYOUTS_KEY);
    return text ? readSavedLayouts(JSON.parse(text)) : [];
  } catch {
    return [];
  }
}

function writeBrowser(layouts: SavedLayout[]) {
  try {
    localStorage.setItem(
      SAVED_LAYOUTS_KEY,
      JSON.stringify(layoutsFile(layouts)),
    );
  } catch {
    throw new LayoutError(
      "Browser storage is unavailable. Export your layouts to keep them.",
    );
  }
  return layouts;
}

async function call(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new LayoutError(data.error || "The layout could not be saved.");
  // Only what passes the shared rule reaches the shell.
  return readSavedLayouts(layoutsFile(data.layouts ?? []));
}

/** The saved layouts and where they are kept. Never throws. */
export async function loadSavedLayouts(
  signal?: AbortSignal,
): Promise<{ home: LayoutHome; layouts: SavedLayout[] }> {
  try {
    const response = await fetch("/api/layouts", { cache: "no-store", signal });
    // The hosted Worker has no layouts route; a dev server may answer HTML.
    if (response.status !== 404) {
      const data = await response.json();
      return {
        home: "server",
        layouts: response.ok
          ? readSavedLayouts(layoutsFile(data.layouts ?? []))
          : [],
      };
    }
  } catch {
    // No server answered: keep layouts in this browser.
  }
  return { home: "browser", layouts: readBrowser() };
}

export const newLayoutId = () => crypto.randomUUID();

/** Saves under `id`, replacing that layout or adding it; answers the new list. */
export async function putSavedLayout(
  home: LayoutHome,
  id: string,
  draft: LayoutDraft,
): Promise<SavedLayout[]> {
  if (home === "server")
    return call(`/api/layouts/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
  const saved = parseLayoutInput(id, draft, new Date().toISOString());
  return writeBrowser(upsertLayout(readBrowser(), saved));
}

export async function deleteSavedLayout(
  home: LayoutHome,
  id: string,
): Promise<SavedLayout[]> {
  if (home === "server")
    return call(`/api/layouts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  return writeBrowser(removeLayout(readBrowser(), id));
}
