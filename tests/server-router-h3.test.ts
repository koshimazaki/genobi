import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { ComfyRouter } from "../shared/comfy/router";
import { CREDITS_PER_USD } from "../shared/comfy/ltx";
import { input, setup } from "./server-harness";

// The local server's H3 on Router, on a fake fetcher: quote, approval by
// Quote-Id, one submission, poll, the MP4 copied from task.content.url, Ready.
const comfyKey = { "x-byo-key": "comfyui-test-key-0007" };
const base = "https://api.comfy.org/v2/models/minimax/minimax-h3/requests";
const statusUrl = `${base}/req_h3/status`;
const mp4Url = "https://media.comfy.org/router/h3-result.mp4?sig=1";

async function h3Setup(
  download: () => Promise<Response>,
  extra: Record<string, unknown> = {},
) {
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const href = String(url);
    if (init?.method === "POST")
      return Response.json(
        { request_id: "req_h3", status: "IN_QUEUE", status_url: statusUrl },
        { status: 201 },
      );
    if (href === statusUrl) return Response.json({ status: "COMPLETED" });
    if (href === `${base}/req_h3`)
      return new Response(
        JSON.stringify({
          task: {
            status: "succeeded",
            content: { url: mp4Url },
            usage: { output_seconds: 10 },
          },
        }),
        { headers: { "X-Comfy-Credits-Used": "271.6" } },
      );
    if (href === mp4Url) return download();
    throw new Error(`unexpected ${href}`);
  });
  const app = await setup(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new ComfyRouter(fetcher),
  );
  const image = `data:image/png;base64,${(
    await readFile("tests/fixtures/reference.png")
  ).toString("base64")}`;
  const request = {
    ...input,
    model: "minimax-h3-router",
    description:
      "Use the first image as the character sheet and the second as the storyboard.",
    cameraEnabled: false,
    duration: 10,
    aspectRatio: "16:9",
    imageReferences: [image, image],
    ...extra,
  };
  const quoteAndSubmit = async () => {
    const quoted = await fetch(`${app.base}/api/quotes`, {
      method: "POST",
      headers: {
        cookie: app.cookie,
        "Content-Type": "application/json",
        ...comfyKey,
      },
      body: JSON.stringify(request),
    });
    expect(quoted.status).toBe(201);
    const { quote } = await quoted.json();
    const submitted = await app.post("h3-router-1", request, {
      ...comfyKey,
      "Quote-Id": quote.id,
    });
    expect(submitted.status).toBe(202);
    return { quote, job: (await submitted.json()).job };
  };
  const poll = async (id: string) =>
    (
      await (
        await fetch(`${app.base}/api/jobs/${id}`, {
          headers: { cookie: app.cookie, ...comfyKey },
        })
      ).json()
    ).job;
  return { ...app, fetcher, image, quoteAndSubmit, poll };
}

describe("local H3 through Comfy Router", () => {
  it("writes the camera panel's H3 sentences around the text, in H3's order", async () => {
    const { fetcher, quoteAndSubmit } = await h3Setup(
      async () => new Response(),
      {
        cameraEnabled: true,
        camera: {
          "shot-sizes": "close-up",
          angles: "low-angle",
          movements: "pan-left",
        },
      },
    );
    const { job } = await quoteAndSubmit();
    expect(job.cameraEnabled).toBe(true);
    const [, init] = fetcher.mock.calls.find(([, i]) => i?.method === "POST")!;
    expect(JSON.parse(String(init?.body)).content[0].text).toBe(
      "A close-up frames the upper part of the subject. The camera looks up at the subject from a low angle. Use the first image as the character sheet and the second as the storyboard. The camera pans left across the subject.",
    );
  });

  it("quotes, sends both references once, copies the MP4 and records the credits", async () => {
    const mp4 = new Uint8Array(await readFile("tests/fixtures/metadata.mp4"));
    const { fetcher, store, image, quoteAndSubmit, poll, bfl } = await h3Setup(
      async () => new Response(mp4),
    );
    const { quote, job } = await quoteAndSubmit();
    expect(quote.recipe).toMatchObject({
      id: "minimax-h3-router",
      route: "router",
    });
    expect(quote.estimateUsd).toBeCloseTo(271.6 / CREDITS_PER_USD, 9);
    expect(job).toMatchObject({
      status: "Pending",
      imageReferenceCount: 2,
      costEstimateUsd: quote.estimateUsd,
    });
    // Reserved before it was sent; the stored run holds hashes, not images.
    expect(JSON.stringify(store.data)).not.toContain(image.slice(30, 90));
    const posts = fetcher.mock.calls.filter(([, i]) => i?.method === "POST");
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe(base);
    expect(posts[0][1]?.headers).toMatchObject({
      "Idempotency-Key": "h3-router-1",
    });
    expect(JSON.parse(String(posts[0][1]?.body))).toEqual({
      content: [
        {
          type: "text",
          text: "Use the first image as the character sheet and the second as the storyboard.",
        },
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
      duration: 10,
      resolution: "768P",
      ratio: "16:9",
    });
    expect(bfl.submissions).toBe(0);
    const ready = await poll(job.id);
    expect(ready).toMatchObject({
      status: "Ready",
      resultUrl: `/api/clips/${job.id}`,
      costCredits: 271.6,
    });
    expect(ready.costActualUsd).toBeCloseTo(271.6 / CREDITS_PER_USD, 9);
    expect(fetcher.mock.calls.some(([url]) => String(url) === mp4Url)).toBe(
      true,
    );
    // Still one paid request after the whole lifecycle.
    expect(
      fetcher.mock.calls.filter(([, i]) => i?.method === "POST"),
    ).toHaveLength(1);
  });

  it("marks the run expired when its result link has aged out, without resubmitting", async () => {
    const { fetcher, quoteAndSubmit, poll } = await h3Setup(
      async () => new Response("expired", { status: 403 }),
    );
    const { job } = await quoteAndSubmit();
    const after = await poll(job.id);
    expect(after.status).toBe("expired");
    expect(after.error).toMatch(/expired before it could be saved/);
    expect(after.costCredits).toBe(271.6);
    expect(
      fetcher.mock.calls.filter(([, i]) => i?.method === "POST"),
    ).toHaveLength(1);
  });

  it("refuses a BFL key before quoting", async () => {
    const {
      base: server,
      cookie,
      fetcher,
      image,
    } = await h3Setup(async () => new Response());
    const response = await fetch(`${server}/api/quotes`, {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        "x-byo-key": "bfl-test-key-0007",
      },
      body: JSON.stringify({
        ...input,
        model: "minimax-h3-router",
        cameraEnabled: false,
        imageReferences: [image, image],
      }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Comfy Router/);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
