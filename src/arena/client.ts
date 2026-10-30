import {
  arenaRecord,
  type Arena,
  type ArenaDraft,
  type ArenaMedia,
} from "../../shared/arena";

export async function arenaRequest<T>(
  path = "",
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/arena${path}`, {
    ...init,
    cache: "no-store",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data)
    throw new Error(data?.error ?? "Arena needs the local studio server.");
  return data;
}
export const arenaPost = <T>(path: string, body: unknown) =>
  arenaRequest<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
/**
 * The comparison list from `GET /api/arena`. The reply itself must carry an
 * array — a body without one disables Arena — and each row must validate as a
 * whole comparison, because `Arena.tsx` renders `draft.slots.map` and
 * `arena.media.filter` the moment it adopts one. A malformed row is dropped
 * and the rest of Arena still loads, instead of `undefined.map` blanking the
 * studio (which is one React tree).
 */
export function arenaList(body: unknown): Arena[] {
  const arenas = (body as { arenas?: unknown } | null)?.arenas;
  if (!Array.isArray(arenas))
    throw new Error(
      "Arena is disabled: its comparison list could not be read.",
    );
  return arenas.flatMap((row) => {
    const parsed = arenaRecord.safeParse(row);
    return parsed.success ? [parsed.data as Arena] : [];
  });
}
export const saveArena = (arena: Arena, draft: ArenaDraft) =>
  arenaPost<{ arena: Arena }>(`/${arena.id}`, {
    revision: arena.revision,
    draft,
  });
export const uploadArena = (id: string, file: File) =>
  arenaRequest<{ arena: Arena; media: ArenaMedia }>(
    `/${id}/files?name=${encodeURIComponent(file.name)}`,
    {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    },
  );
