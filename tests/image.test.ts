import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { validateInput } from "../server/validation";
import { BflClient } from "../server/bfl";
import { ComfyRouter } from "../shared/comfy/router";
import { createApp } from "../server/app";
import { publicJob } from "../server/store";
import {
  imageBody,
  imageReference,
  estimateImageUsd,
  inspectImage,
} from "../shared/image";

const media = readFileSync(
  new URL("./fixtures/reference.png", import.meta.url),
);
const reference = `data:image/png;base64,${media.toString("base64")}`;
const edit = () =>
  validateInput({
    generator: "edit",
    description: "Change image 1 to blue.",
    imageReferences: [reference],
    imageResolution: "2k",
    imageGrounding: false,
  });

describe("FLUX 3 image boundary", () => {
  it("accepts bounded image bytes and rejects missing edit input, URLs, mismatched types and unpriced resolution", () => {
    expect(imageReference(reference).metadata).toMatchObject({
      width: 256,
      height: 256,
      contentType: "image/png",
    });
    for (const value of [
      "https://example.com/input.png",
      reference.replace("image/png", "image/jpeg"),
      "data:image/png;base64,AAAA",
    ])
      expect(() =>
        validateInput({
          generator: "edit",
          description: "Edit.",
          imageReferences: [value],
        }),
      ).toThrow();
    expect(() =>
      validateInput({ generator: "edit", description: "Edit." }),
    ).toThrow();
    expect(() =>
      validateInput({
        generator: "image",
        description: "Image.",
        imageResolution: "1.5k",
      }),
    ).toThrow();
    expect(estimateImageUsd(edit())).toBe(0.1);
    expect(imageBody(edit())).toMatchObject({
      images: [media.toString("base64")],
      resolution: "2k",
      grounding: false,
    });
  });
  it.each(["image", "edit"] as const)(
    "routes %s to the image endpoint on both providers",
    async (generator) => {
      const bflFetch = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          id: "test",
          polling_url: "https://api.bfl.ai/v1/get_result?id=test",
        }),
      );
      await new BflClient(bflFetch).submit(
        generator,
        imageBody(edit()),
        "test-key",
      );
      expect(bflFetch.mock.calls[0][0]).toBe(
        "https://api.bfl.ai/v1/flux-3-image",
      );
      const routerFetch = vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            request_id: "test",
            status_url:
              "https://api.comfy.org/v2/models/bfl/flux-3-image/requests/test/status",
          },
          { status: 201 },
        ),
      );
      await new ComfyRouter(routerFetch).submit(
        generator,
        imageBody(edit()),
        "comfyui-test-key",
      );
      expect(routerFetch.mock.calls[0][0]).toBe(
        "https://api.comfy.org/v2/models/bfl/flux-3-image/requests",
      );
    },
  );
  it("reserves before submission, stores no reference bytes, preserves replay and saves owned image output", async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), "flux-image-test-"));
    try {
      let calls = 0;
      const bfl = new BflClient(async (url, init) => {
        if (init?.method === "POST") {
          calls++;
          const disk = await readFile(
            path.join(temporary, "jobs.json"),
            "utf8",
          );
          expect(disk).toContain('"submitting"');
          expect(disk).not.toContain("data:image");
          expect(disk).not.toContain(media.toString("base64"));
          return Response.json({
            id: "test",
            polling_url: "https://api.bfl.ai/v1/get_result?id=test",
          });
        }
        if (String(url).includes("get_result"))
          return Response.json({
            id: "test",
            status: "Ready",
            result: { sample: "https://delivery.bfl.ai/image.png" },
          });
        return new Response(media);
      });
      const { service, store } = await createApp({
        directory: temporary,
        publicDirectory: temporary,
        serverKey: "test-key",
        providers: { bfl },
      });
      const job = await service.submit(edit(), "session-a", "image-request");
      expect(
        (await service.submit(edit(), "session-a", "image-request")).id,
      ).toBe(job.id);
      expect(calls).toBe(1);
      await expect(
        service.submit(
          { ...edit(), description: "Different." },
          "session-a",
          "image-request",
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(publicJob(job)).not.toHaveProperty("imageReferences");
      expect(publicJob(job).imageReferenceCount).toBe(1);
      await expect(service.poll(job.id, "session-b")).rejects.toMatchObject({
        status: 404,
      });
      const ready = await service.poll(job.id, "session-a");
      expect(ready.job.status).toBe("Ready");
      expect(store.data.sources[0]).toMatchObject({
        mediaType: "image",
        contentType: "image/png",
        width: 256,
        height: 256,
        duration: 0,
      });
      expect(
        inspectImage(
          new Uint8Array(await readFile(store.data.sources[0].filePath)),
        ).contentType,
      ).toBe("image/png");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
