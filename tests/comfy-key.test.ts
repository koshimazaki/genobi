import { describe, expect, it, vi } from "vitest";
import { comfyKey } from "../scripts/lib/comfy-key.mjs";

// The scripts' key: COMFY_API_KEY wins, then the key the studio saved.
describe("scripts/lib/comfy-key.mjs", () => {
  it("takes COMFY_API_KEY first and never asks the Keychain then", async () => {
    const keychain = vi.fn(async () => "comfyui-from-keychain-0000");
    const found = await comfyKey(
      { COMFY_API_KEY: " comfyui-from-env-000000 " },
      keychain,
    );
    expect(found).toEqual({
      key: "comfyui-from-env-000000",
      source: "COMFY_API_KEY",
    });
    expect(keychain).not.toHaveBeenCalled();
  });
  it("falls back to the studio's Keychain item, and names only the source", async () => {
    const found = await comfyKey({}, async () => "comfyui-from-keychain-0000");
    expect(found.key).toBe("comfyui-from-keychain-0000");
    expect(found.source).not.toContain("comfyui-");
    expect(await comfyKey({}, async () => undefined)).toEqual({
      key: undefined,
      source: undefined,
    });
  });
});
