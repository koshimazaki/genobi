import { describe, expect, it } from "vitest";
import { runFailure } from "../server/comfy-run-failure";

describe("a failed Comfy Cloud run, in Genobi's words", () => {
  it("names a known cause and the failing node", () => {
    expect(
      runFailure({
        code: "execution_error",
        message: "Value not in list: unet_name: 'x.safetensors'",
        class_type: "UNETLoader",
      }),
    ).toBe(
      "Comfy Cloud could not find a model, node or file the workflow needs at the UNETLoader node.",
    );
    expect(runFailure({ message: "Prompt flagged by safety filter" })).toBe(
      "Comfy Cloud refused the request on content grounds.",
    );
  });

  it("names only the node when the cause is unknown", () => {
    expect(
      runFailure({ message: "Exception in worker", class_type: "KSampler" }),
    ).toBe(
      "Comfy Cloud stopped this run at the KSampler node. Nothing was saved.",
    );
  });

  it("never repeats provider text", () => {
    const secret = "private provider text /home/worker/secret";
    const line = runFailure({
      message: secret,
      class_type: "<img src=x onerror=alert(1)>",
    });
    expect(line).toBeUndefined();
    const named = runFailure({ message: secret, class_type: "LoadImage" });
    expect(named).not.toContain("private");
    expect(named).not.toContain("/home");
  });

  it("falls back to the generic line without detail", () => {
    expect(runFailure(null)).toBeUndefined();
    expect(runFailure(undefined)).toBeUndefined();
    expect(runFailure({ code: 7, message: null })).toBeUndefined();
  });
});
