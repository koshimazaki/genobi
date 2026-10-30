import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  call,
  input,
  newSession,
  routerRequests,
  submissions,
  useWorker,
} from "./worker-harness";

// The hosted adapter reads the same H3-on-Router contract as the local one:
// shared validation, the shared body and the shared price.
useWorker();

describe("Cloudflare adapter: H3 on Router", () => {
  it("quotes at the published rate and sends both references once, on a Comfy key", async () => {
    const image = `data:image/png;base64,${(
      await readFile("tests/fixtures/reference.png")
    ).toString("base64")}`;
    const request = {
      ...input,
      model: "minimax-h3-router",
      description: "Use the first image as the character sheet.",
      cameraEnabled: false,
      duration: 6,
      resolution: "fhd",
      aspectRatio: "9:16",
      imageReferences: [image, image],
    };
    const headers = {
      cookie: newSession(),
      "x-byo-key": "comfyui-test-key-0008",
      "content-type": "application/json",
    };
    const before = { bfl: submissions, router: routerRequests.length };
    const quoted = await call("/api/quotes", {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });
    expect(quoted.status).toBe(201);
    const { quote } = (await quoted.json()) as {
      quote: { id: string; estimateUsd: number; recipe: { id: string } };
    };
    expect(quote.recipe.id).toBe("minimax-h3-router");
    expect(quote.estimateUsd).toBeCloseTo((6 * 39.22) / 210, 9);
    const submitted = await call("/api/jobs", {
      method: "POST",
      headers: {
        ...headers,
        "idempotency-key": "worker-h3-router",
        "quote-id": quote.id,
      },
      body: JSON.stringify(request),
    });
    expect(submitted.status).toBe(202);
    expect(routerRequests.length).toBe(before.router + 1);
    const sent = routerRequests.at(-1)!;
    expect(sent).toMatchObject({
      path: "/v2/models/minimax/minimax-h3/requests",
      apiKey: true,
      idempotency: "worker-h3-router",
    });
    expect(sent.body).toEqual({
      content: [
        { type: "text", text: "Use the first image as the character sheet." },
        {
          type: "image_url",
          image_url: { url: image },
          role: "reference_image",
        },
        {
          type: "image_url",
          image_url: { url: image },
          role: "reference_image",
        },
      ],
      duration: 6,
      resolution: "2K",
      ratio: "9:16",
    });
    expect(submissions).toBe(before.bfl);
    // The stored run carries the count, not the images.
    const { job } = (await submitted.json()) as {
      job: { imageReferenceCount: number; imageReferences?: unknown };
    };
    expect(job.imageReferenceCount).toBe(2);
    expect(job.imageReferences).toBeUndefined();
  });

  it("writes the camera panel's H3 sentences in H3's order, and no hidden term", async () => {
    const image = `data:image/png;base64,${(
      await readFile("tests/fixtures/reference.png")
    ).toString("base64")}`;
    const request = {
      ...input,
      model: "minimax-h3-router",
      description: "Use the first image as the character sheet.",
      // Dutch angle is not on the H3 panel, so it is never written.
      camera: { "shot-sizes": "wide", angles: "dutch", movements: "crane" },
      duration: 6,
      resolution: "hd",
      aspectRatio: "16:9",
      imageReferences: [image, image],
    };
    const headers = {
      cookie: newSession(),
      "x-byo-key": "comfyui-test-key-0009",
      "content-type": "application/json",
    };
    const quoted = await call("/api/quotes", {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });
    expect(quoted.status).toBe(201);
    const { quote } = (await quoted.json()) as { quote: { id: string } };
    const submitted = await call("/api/jobs", {
      method: "POST",
      headers: {
        ...headers,
        "idempotency-key": "worker-h3-router-camera",
        "quote-id": quote.id,
      },
      body: JSON.stringify(request),
    });
    expect(submitted.status).toBe(202);
    const sent = routerRequests.at(-1)!.body as {
      content: { text?: string }[];
    };
    expect(sent.content[0].text).toBe(
      "A wide shot gives the subject room in its surroundings. Use the first image as the character sheet. The camera pedestals up, keeping the subject in view.",
    );
  });
});
