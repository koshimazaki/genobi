import { describe, expect, it } from "vitest";
import { cloudReadiness, isObjectInfo } from "../shared/comfy/readiness";
import { kleinWorkflow } from "../shared/comfy/klein";
import { akuspaceWorkflow } from "../shared/comfy/akuspace";
import { deployTemplates } from "../shared/comfy/deploy-workflows";
import { infoFor } from "./comfy-readiness-fixture";

const at = "2026-10-31T12:00:00Z";
describe("workflow metadata readiness", () => {
  it("checks every actual graph node and every declared model slot", () => {
    const info = infoFor(kleinWorkflow.graph);
    const ready = cloudReadiness([kleinWorkflow], info, at);
    expect(ready.templates[kleinWorkflow.id].status).toBe("compatible");
    delete info.SaveImage;
    expect(
      cloudReadiness([kleinWorkflow], info, at).templates[kleinWorkflow.id],
    ).toMatchObject({ status: "blocked", missingNodes: ["SaveImage"] });
  });

  it("reports missing model slots without leaking the account's catalogue", () => {
    const info = infoFor(akuspaceWorkflow.graph);
    info.LoraLoaderModelOnly = {
      input: { required: { lora_name: [["private/user/lora.safetensors"]] } },
    };
    const result = cloudReadiness([akuspaceWorkflow], info, at);
    expect(result.templates[akuspaceWorkflow.id]).toMatchObject({
      status: "blocked",
      missingModels: ["lora_name"],
    });
    expect(JSON.stringify(result)).not.toContain("private/user");
  });

  it("understands optional COMBO inputs and keeps unenumerated models unknown", () => {
    const info = infoFor(akuspaceWorkflow.graph);
    info.LoraLoaderModelOnly = {
      input: {
        optional: {
          lora_name: [
            "COMBO",
            { options: ["akuspace-ltx25-v0.5.safetensors"] },
          ],
        },
      },
    };
    expect(
      cloudReadiness([akuspaceWorkflow], info, at).templates[
        akuspaceWorkflow.id
      ].status,
    ).toBe("compatible");
    info.LoraLoaderModelOnly.input!.optional!.lora_name = ["STRING", {}];
    expect(
      cloudReadiness([akuspaceWorkflow], info, at).templates[
        akuspaceWorkflow.id
      ],
    ).toMatchObject({
      status: "unknown",
      unknownModels: ["lora_name"],
      missingModels: [],
    });
  });

  it("never calls deployment-only graphs Cloud-compatible from matching metadata", () => {
    const template = deployTemplates[0];
    expect(
      cloudReadiness([template], infoFor(template.graph), at).templates[
        template.id
      ].status,
    ).toBe("deployment-required");
  });

  it("rejects non-catalogue envelopes and exposes malformed node definitions as unknown", () => {
    for (const value of [null, [], {}, { error: "private error" }])
      expect(isObjectInfo(value)).toBe(false);
    const info = infoFor(kleinWorkflow.graph);
    info.SaveImage = {};
    expect(
      cloudReadiness([kleinWorkflow], info, at).templates[kleinWorkflow.id],
    ).toMatchObject({
      status: "unknown",
      unknownNodes: ["SaveImage"],
    });
  });
});
