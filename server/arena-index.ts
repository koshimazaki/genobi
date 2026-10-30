import { z } from "zod";
import { arenaRecord } from "../shared/arena";

const record = z.strictObject({
  owner: z.string().uuid(),
  arena: arenaRecord,
});
export function parseArenaIndex(value: unknown) {
  const rows = z.array(record).max(200).parse(value);
  if (new Set(rows.map((r) => r.arena.id)).size !== rows.length)
    throw new Error("Duplicate Arena records.");
  return rows;
}
