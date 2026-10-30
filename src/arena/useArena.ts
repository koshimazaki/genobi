import { validateArenaFile } from "./upload-validation";
import { useEffect, useRef, useState } from "react";
import {
  draftOf,
  newArena,
  type Arena,
  type ArenaDraft,
} from "../../shared/arena";
import {
  arenaPost,
  arenaRequest,
  arenaList,
  saveArena,
  uploadArena,
} from "./client";

export function useArena(active: boolean) {
  const [items, setItems] = useState<Arena[]>([]);
  const [arena, setArena] = useState<Arena>();
  const [draft, setDraft] = useState<ArenaDraft>(newArena);
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const current = useRef({ arena, draft, dirty, busy });
  current.current = { arena, draft, dirty, busy };
  const lock = useRef(false);
  function adopt(next: Arena) {
    setArena(next);
    setDraft(draftOf(next));
    setDirty(false);
    setItems((items) => [next, ...items.filter((a) => a.id !== next.id)]);
    current.current = {
      ...current.current,
      arena: next,
      draft: draftOf(next),
      dirty: false,
    };
  }
  function edit(next: ArenaDraft) {
    setDraft(next);
    setDirty(true);
    current.current = { ...current.current, draft: next, dirty: true };
  }
  async function save() {
    const state = current.current;
    if (!state.arena) throw new Error("Create a comparison first.");
    if (!state.dirty) return state.arena;
    const { arena: next } = await saveArena(state.arena, state.draft);
    if (current.current.draft !== state.draft) {
      setArena(next);
      current.current = { ...current.current, arena: next };
      throw new Error(
        "Earlier edits saved. Save your latest changes before continuing.",
      );
    }
    adopt(next);
    return next;
  }
  async function act(task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    // A surprise body disables Arena; writing it into `items` would render
    // `undefined.length` and blank the whole studio, which is one React tree.
    const arenas = arenaList(await arenaRequest<unknown>());
    setItems(arenas);
    const state = current.current;
    const kept = arenas.find((a) => a.id === state.arena?.id);
    const cleared = !!state.arena && !kept && !state.busy;
    if (cleared) {
      // Deleted elsewhere: saving it again could only answer 404.
      setArena(undefined);
      setDraft(newArena());
      setDirty(false);
      current.current = {
        ...current.current,
        arena: undefined,
        draft: newArena(),
        dirty: false,
      };
      setError("That comparison was deleted elsewhere.");
    }
    const next = kept ?? (!state.arena || cleared ? arenas[0] : undefined);
    if (
      next &&
      (cleared || !state.dirty) &&
      !state.busy &&
      next.revision !== state.arena?.revision
    )
      adopt(next);
  }
  useEffect(() => {
    if (!active) return;
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden && !lock.current) void refresh().catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
    // All live state is read from current; the polling interval is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  async function upload(file: File, slotId?: string) {
    validateArenaFile(file);
    const saved = await save();
    const result = await uploadArena(saved.id, file);
    adopt(result.arena);
    if (slotId) {
      const next = {
        ...draftOf(result.arena),
        slots: result.arena.slots.map((s) =>
          s.id === slotId
            ? { ...s, media: result.media.hash, status: "ready" as const }
            : s,
        ),
      };
      adopt((await saveArena(result.arena, next)).arena);
    }
  }
  return {
    adopt,
    items,
    arena,
    draft,
    dirty,
    busy,
    error,
    edit,
    act,
    save,
    upload,
    refresh,
    remove: () =>
      act(async () => {
        const selected = current.current.arena;
        if (!selected) return;
        await arenaRequest(`/${selected.id}`, { method: "DELETE" });
        setArena(undefined);
        setDraft(newArena());
        setDirty(false);
        current.current = {
          ...current.current,
          arena: undefined,
          draft: newArena(),
          dirty: false,
        };
        await refresh();
      }),
    create: () =>
      act(async () => {
        if (current.current.arena) await save();
        adopt((await arenaPost<{ arena: Arena }>("", newArena())).arena);
      }),
    select: (id: string) =>
      act(async () => {
        await save();
        adopt((await arenaRequest<{ arena: Arena }>(`/${id}`)).arena);
      }),
    link: (code: string) =>
      act(async () => {
        if (current.current.arena) await save();
        adopt((await arenaPost<{ arena: Arena }>("/link", { code })).arena);
      }),
    reload: () =>
      act(async () => {
        if (arena)
          adopt((await arenaRequest<{ arena: Arena }>(`/${arena.id}`)).arena);
      }),
  };
}
