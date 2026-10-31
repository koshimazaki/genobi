import type { SceneAdapter } from "./useBuilderSession";
import { RECIPE_BYTES, worldCommand } from "../../shared/world-control";
import { takeFacts, takeFiles } from "./agent-capture";
import type { Take } from "./export-take";
/** A recipe as a command result: what getRecipe gives, within its 64 KB. */
export function boundedRecipe(recipe: unknown) {
  if (JSON.stringify(recipe).length > RECIPE_BYTES)
    throw new Error("Recipe exceeds 64 KB.");
  return recipe;
}

/** The library methods exist once the World Builder view has mounted. */
function library<T>(method: T | undefined): T {
  if (!method) throw new Error("Open World Builder to use its library.");
  return method;
}
export async function connectWorld(
  adapter: SceneAdapter,
  onDisconnect: (error?: string) => void,
) {
  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`/api/world${path}`, init);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        body.error ??
          "Local World connection unavailable. Start the local studio server.",
      );
    }
    return response.json();
  }
  const send = (path: string, body: unknown) =>
    request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  /** Replaces the session's files with this take's, for the agent's download. */
  async function upload(take: Take) {
    await request(`/${connected.id}/files`, { method: "DELETE" });
    const files: Record<string, unknown> = {};
    for (const [name, blob] of takeFiles(take))
      files[name] = await request(`/${connected.id}/files/${name}`, {
        method: "POST",
        headers: { "Content-Type": blob.type || "application/octet-stream" },
        body: blob,
      });
    return files;
  }
  const connected = await send("/connect", {});
  if (typeof connected.id !== "string" || typeof connected.code !== "string")
    throw new Error("World agent connection needs the local studio server.");
  let stopped = false,
    timer: ReturnType<typeof setTimeout>;
  async function poll() {
    try {
      const job = await request(`/${connected.id}/next`);
      if (stopped) return;
      if (job) {
        let state = "done",
          result: unknown;
        try {
          const command = worldCommand.parse(job.command);
          switch (command.op) {
            case "status":
              result = adapter.live.status();
              break;
            case "control":
              result = await adapter.live.control(command.input);
              break;
            case "stop":
              result = adapter.live.stop();
              break;
            case "presets":
              result = library(adapter.listPresets)();
              break;
            case "load-preset": {
              const recipe = await library(adapter.loadPreset)(command.name);
              result = {
                name: command.name,
                scene: recipe.scene,
                frames: recipe.frames,
                seconds: recipe.frames / recipe.fps,
                recipe: boundedRecipe(recipe),
              };
              break;
            }
            case "takes":
              result = library(adapter.listTakes)();
              break;
            case "recipe":
              result = {
                recipe: boundedRecipe(adapter.getRecipe()),
                revision: adapter.getRecipeRevision(),
              };
              break;
            case "send-to-project":
              result = await library(adapter.sendTake)(command.take);
              break;
            case "record-start":
              result = await adapter.live.startRecording();
              break;
            case "record-stop": {
              const take = await adapter.live.stopRecording();
              result = { name: take.name, files: await upload(take) };
              break;
            }
            case "capture": {
              const take = await library(adapter.captureTake)(command.name);
              result = {
                ...(await takeFacts(take)),
                files: await upload(take),
              };
              break;
            }
          }
        } catch (e) {
          state = "error";
          result = {
            error: e instanceof Error ? e.message : "World command failed.",
          };
        }
        await send(`/${connected.id}/commands/${job.id}`, { state, result });
      }
      if (!stopped) timer = setTimeout(() => void poll(), 250);
    } catch (e) {
      if (!stopped) {
        stopped = true;
        adapter.live.stop();
        onDisconnect(e instanceof Error ? e.message : "World disconnected.");
      }
    }
  }
  void poll();
  return {
    ...(connected as { id: string; code: string }),
    disconnect() {
      stopped = true;
      clearTimeout(timer);
      adapter.live.stop();
      void request(`/${connected.id}`, { method: "DELETE" }).catch(() => {});
      onDisconnect();
    },
  };
}
