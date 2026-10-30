import type { Take } from "../shared/take";

/** Finished takes as `/api/takes/:id` returns them, for provenance tests. */
export const SHA = (n: number) => n.toString(16).padStart(64, "0");

export function take(
  id: string,
  entry: string,
  route: Take["recipe"]["route"],
  options: {
    estimateUsd?: number;
    actualUsd?: number;
    credits?: number;
    mediaType?: "video" | "image";
    createdAt?: string;
    available?: boolean;
  } = {},
): Take {
  const mediaType = options.mediaType ?? "video";
  return {
    version: 1,
    operationId: id,
    recipe: { id: entry, version: 1, route },
    inputs: [{ role: "settings", sha256: SHA(id.length + 1) }],
    outputs: [
      {
        assetId: id,
        mediaType,
        contentType: mediaType === "video" ? "video/mp4" : "image/png",
        available: options.available ?? true,
      },
    ],
    receipt: {
      estimateUsd: options.estimateUsd ?? 0.5,
      ...(options.actualUsd === undefined
        ? {}
        : { actualUsd: options.actualUsd }),
      ...(options.credits === undefined ? {} : { credits: options.credits }),
    },
    createdAt: options.createdAt ?? "2026-10-21T10:00:00.000Z",
  };
}

export const hermes = {
  harness: "hermes",
  model: "deepseek/deepseek-v4.1-flash",
  provider: "nous",
} as const;
