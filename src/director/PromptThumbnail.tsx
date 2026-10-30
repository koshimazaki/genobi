import { useEffect, useState } from "react";
import AssetThumbnail from "./AssetThumbnail";
import type { Bundle } from "./bundle";
import type { PromptReference } from "./prompt-brief";

export function PromptThumbnail({
  bundle,
  reference,
}: {
  bundle: Bundle;
  reference: PromptReference;
}) {
  const asset = reference.assetId
    ? bundle.project.assets[reference.assetId]
    : undefined;
  const path = reference.font?.file.path ?? asset?.file.path;
  const bytes = path ? bundle.files.get(path) : undefined;
  const font = Boolean(reference.font);
  const [url, setUrl] = useState("");
  const [family, setFamily] = useState("");
  useEffect(() => {
    if (!bytes || (!font && asset?.kind !== "video")) return;
    const url = URL.createObjectURL(new Blob([bytes]));
    let active = true;
    let face: FontFace | undefined;
    if (font) {
      const name = `brief-${reference.id}`;
      face = new FontFace(name, `url("${url}")`);
      void face
        .load()
        .then((loaded) => {
          if (!active) return;
          document.fonts.add(loaded);
          setFamily(name);
        })
        .catch(() => {});
    } else setUrl(url);
    return () => {
      active = false;
      if (face) document.fonts.delete(face);
      URL.revokeObjectURL(url);
    };
  }, [bytes, font, reference.id, asset?.kind]);
  if (reference.font)
    return (
      <span
        className="prompt-font-sample"
        style={{ fontFamily: family || "inherit" }}
      >
        Aa
      </span>
    );
  if (!asset) return <span>Missing</span>;
  if (asset.kind === "video" && url)
    return (
      <video
        src={`${url}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
      />
    );
  return <AssetThumbnail asset={asset} bytes={bytes} />;
}
