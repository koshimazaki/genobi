import { describe, expect, it } from "vitest";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
  DIRECTOR_PROJECT_BYTES,
  DIRECTOR_PROJECT_LIMIT,
  formatMegabytes,
} from "../shared/director/types";
import { checkAssetMedia } from "../shared/director/asset-media";
import { FILE_BYTES, PROJECT_BYTES } from "../server/projects";
import { tooLarge } from "../server/project-bundle";
import { TOO_LARGE } from "../src/world-builder/send-take";
import { ingestFile } from "../src/director/import-media";

describe("Editor media limits", () => {
  it("are 150 MiB per file and per project, read by the studio and its copy", () => {
    expect(DIRECTOR_MEDIA_BYTES).toBe(150 * 1024 * 1024);
    expect(DIRECTOR_PROJECT_BYTES).toBe(150 * 1024 * 1024);
    expect(FILE_BYTES).toBe(DIRECTOR_MEDIA_BYTES);
    expect(PROJECT_BYTES).toBe(DIRECTOR_PROJECT_BYTES);
    expect(formatMegabytes(DIRECTOR_MEDIA_BYTES)).toBe("150 MB");
    expect(formatMegabytes(50 * 1024 * 1024)).toBe("50 MB");
  });

  it("name the current limits in every refusal", async () => {
    expect(DIRECTOR_MEDIA_LIMIT).toBe(formatMegabytes(DIRECTOR_MEDIA_BYTES));
    expect(DIRECTOR_PROJECT_LIMIT).toBe(
      formatMegabytes(DIRECTOR_PROJECT_BYTES),
    );
    expect(() =>
      checkAssetMedia({
        filename: "x.mp4",
        contentType: "video/mp4",
        size: DIRECTOR_MEDIA_BYTES + 1,
      }),
    ).toThrow(`Project media must be under ${DIRECTOR_MEDIA_LIMIT}.`);
    expect(tooLarge().message).toBe(
      `Project media exceeds ${DIRECTOR_PROJECT_LIMIT}.`,
    );
    expect(TOO_LARGE).toContain(`(${DIRECTOR_MEDIA_LIMIT})`);
    const big = { size: DIRECTOR_MEDIA_BYTES + 1, type: "video/mp4" } as File;
    await expect(ingestFile(big)).rejects.toThrow(
      `Each media file must be under ${DIRECTOR_MEDIA_LIMIT}`,
    );
    for (const text of [TOO_LARGE, tooLarge().message])
      expect(text).not.toMatch(/\b(50|100) MB\b/);
  });
});
