import type { GraphicsModule } from "../../shared/director/types";
import effects from "../../docs/director-bundle/effects/project.json";

/**
 * The motion effects' trusted catalogue entries (hash, engine, mode and
 * parameter schema), from their worked example. JSON only, so the local
 * server's validator can read it under plain Node; the sources and their
 * `?raw` imports stay in the browser-only `effects.ts`.
 */
export const effectModules = effects.modules as Record<string, GraphicsModule>;
