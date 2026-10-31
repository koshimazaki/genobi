import { SPACE_PRESETS, type SpacePreset } from "../../shared/space";
import type { AddAsset, AddedAsset } from "../studio/project-assets";
import type { Recipe } from "./recipe";
import { roomSets, type RoomId } from "./room-presets";

/**
 * Apply room: the free, local route from a take's WAV to the room it was
 * captured in. The WAV is uploaded to this session, Space (`POST
 * /api/media/space`, ffmpeg convolution, `docs/media-space.md`) puts the
 * room's AKUSPACE preset on all of it, and the result is added to the
 * project's assets. The Comfy route, World Builder · Reverb on the geometry,
 * stays in Comfy (`workflows/world-builder-acoustics.api.json`).
 */
export interface RoomChoice {
  preset: SpacePreset;
  label: string;
}

/**
 * The take's room: the room preset whose floor and walls match the recipe's
 * `room-` set (the World Builder's four rooms build one), else the nearest
 * by volume. Open sky has no room to apply.
 */
export function recipeRoom(recipe: Recipe): RoomChoice | undefined {
  // Animated rooms use their evaluated acoustic schedule, not a static preset.
  if (recipe.motion) return undefined;
  const size = (id: string) => {
    const p = recipe.objects.find((o) => o.id === id);
    return p && [2 * p.scale * (p.scaleX ?? 1), 2 * p.scale * (p.scaleY ?? 1)];
  };
  const floor = size("room-floor"),
    wall = size("room-north");
  if (!floor || !wall) return undefined;
  const volume = floor[0] * floor[1] * wall[1];
  let best: { id: RoomId; off: number } | undefined;
  for (const id of Object.keys(roomSets) as RoomId[]) {
    const [w, l, h] = roomSets[id].size_m;
    const off = Math.abs(Math.log((w * l * h) / volume));
    if (!best || off < best.off) best = { id, off };
  }
  if (!best || !(SPACE_PRESETS as readonly string[]).includes(best.id))
    return undefined;
  return { preset: best.id as SpacePreset, label: roomSets[best.id].label };
}

async function answer<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok)
    throw new Error(
      body.error ?? "Apply room needs the local studio server (npm run dev).",
    );
  return body as T;
}

/** Uploads the WAV, runs Space over its whole length and adds the result. */
export async function applyRoom(
  wav: Blob,
  name: string,
  room: RoomChoice,
  onAsset: AddAsset,
  fetcher: typeof fetch = fetch,
): Promise<AddedAsset> {
  const query = new URLSearchParams({ filename: `${name}.wav` });
  const { source } = await answer<{
    source: { id: string; duration?: number };
  }>(
    await fetcher(`/api/uploads?${query}`, {
      method: "POST",
      headers: { "Content-Type": "audio/wav" },
      body: wav,
    }),
  );
  const seconds = source.duration ?? 0;
  if (!(seconds > 0.1)) throw new Error("The take's sound is too short.");
  const { source: spaced } = await answer<{ source: { id: string } }>(
    await fetcher("/api/media/space", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId: source.id,
        segments: [
          {
            start: 0,
            // Two decimals inside the measured length.
            end: Math.floor(seconds * 100) / 100,
            preset: room.preset,
            level: "mid",
          },
        ],
      }),
    }),
  );
  const clip = await fetcher(`/api/clips/${encodeURIComponent(spaced.id)}`);
  if (!clip.ok) throw new Error("The roomed sound could not be read back.");
  return onAsset({
    blob: new Blob([await clip.arrayBuffer()], { type: "audio/wav" }),
    filename: `${name}-${room.preset}.wav`,
    use: "production",
  });
}
