import path from "node:path";
import { readFile, writeFile, rename } from "node:fs/promises";
import type { VoiceConfig } from "./voice";

export async function savedVoiceConfig(directory: string) {
  try {
    const value = JSON.parse(
      await readFile(path.join(directory, "voice.json"), "utf8"),
    );
    if (
      value.schema !== 1 ||
      ![value.python, value.model].every(
        (p: unknown) =>
          typeof p === "string" && path.isAbsolute(p) && !/[\x00-\x1f]/.test(p),
      )
    )
      return {};
    return { python: value.python as string, model: value.model as string };
  } catch {
    return {};
  }
}
export async function saveVoiceConfig(directory: string, config: VoiceConfig) {
  const file = path.join(directory, "voice.json");
  const temporary = `${file}.tmp`;
  await writeFile(
    temporary,
    JSON.stringify({ schema: 1, python: config.python, model: config.model }),
    { mode: 0o600 },
  );
  await rename(temporary, file);
}
