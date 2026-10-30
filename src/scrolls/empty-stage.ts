import type { Bundle } from "../director/bundle";
import { digest } from "../director/bundle";

/** Director v1 requires a layer. Reference-only imports get a muted transparent
 * fixture, never a character or storyboard sheet placed on screen implicitly. */
export async function withEmptyStage(bundle: Bundle): Promise<Bundle> {
  if (bundle.project.layers.length) return bundle;
  let assetId = "scroll-empty";
  while (
    bundle.project.assets[assetId] ||
    bundle.files.has(`media/${assetId}.png`)
  )
    assetId += "-";
  const bytes = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );
  const file = { path: `media/${assetId}.png`, sha256: await digest(bytes) };
  return {
    ...bundle,
    files: new Map(bundle.files).set(file.path, bytes),
    project: {
      ...bundle.project,
      assets: {
        ...bundle.project.assets,
        [assetId]: {
          kind: "image",
          use: "production",
          origin: "fixture",
          file,
        },
      },
      layers: [
        {
          id: "scroll-empty-stage",
          name: "Empty stage",
          kind: "image",
          assetId,
          startFrame: 0,
          durationFrames: bundle.project.composition.durationFrames,
          locked: false,
          muted: true,
          fit: "contain",
          opacity: 1,
          position: { x: 0, y: 0 },
          scale: 1,
          rotationDegrees: 0,
        },
      ],
    },
  };
}
