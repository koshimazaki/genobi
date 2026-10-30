import { describe, expect, it } from "vitest";
import {
  checkAssetMedia,
  assetContentType,
  assetMediaName,
} from "../shared/director/asset-media";
import {
  DIRECTOR_MEDIA_BYTES,
  DIRECTOR_MEDIA_LIMIT,
} from "../shared/director/types";

// The one rule every output passes before it joins a project's assets, in
// the studio and in the project copy's route alike.
describe("project asset media", () => {
  it("accepts the project's image, video and audio types, aliases included", () => {
    expect(assetContentType("image/png; charset=binary")).toBe("image/png");
    expect(assetContentType("audio/x-wav")).toBe("audio/wav");
    expect(assetContentType("audio/mp3")).toBe("audio/mpeg");
    for (const refused of ["video/webm", "text/html", "image/svg+xml", "", 4])
      expect(assetContentType(refused)).toBeUndefined();
  });

  it("strips control characters and folders and fixes the extension", () => {
    expect(assetMediaName("../../evil\x00\x1f\x7fname.png", "image/png")).toBe(
      "evil   name.png",
    );
    expect(assetMediaName("C:\\takes\\shot.webm", "video/mp4")).toBe(
      "shot.mp4",
    );
    expect(assetMediaName("frame", "image/jpeg")).toBe("frame.jpg");
    expect(assetMediaName(".mp4", "video/mp4")).toBe("media.mp4");
    expect(assetMediaName("take.v2.mp4", "video/mp4")).toBe("take.v2.mp4");
    expect(assetMediaName("\x07\x07", "image/png")).toBe("media.png");
    expect(assetMediaName(undefined, "audio/wav")).toBe("media.wav");
    const long = assetMediaName(`${"a".repeat(300)}.png`, "image/png");
    expect(long).toHaveLength(100);
    expect(long.endsWith(".png")).toBe(true);
  });

  it("checks type, size and use before a byte is kept", () => {
    expect(
      checkAssetMedia({
        filename: "take.mp4",
        contentType: "video/mp4",
        size: 10,
      }),
    ).toEqual({
      kind: "video",
      contentType: "video/mp4",
      filename: "take.mp4",
      use: "production",
    });
    expect(
      checkAssetMedia({
        filename: "first",
        contentType: "image/png",
        size: 1,
        use: "reference",
      }).use,
    ).toBe("reference");
    const refused = (input: Partial<Parameters<typeof checkAssetMedia>[0]>) =>
      expect(() =>
        checkAssetMedia({
          filename: "x.png",
          contentType: "image/png",
          size: 1,
          ...input,
        }),
      );
    refused({ contentType: "video/webm" }).toThrow(/PNG, JPEG or WebP/);
    refused({ size: 0 }).toThrow("empty");
    refused({ size: 1.5 }).toThrow("empty");
    refused({ size: DIRECTOR_MEDIA_BYTES }).not.toThrow();
    refused({ size: DIRECTOR_MEDIA_BYTES + 1 }).toThrow(
      `under ${DIRECTOR_MEDIA_LIMIT}`,
    );
    refused({ use: "timeline" }).toThrow("production or reference");
  });
});
