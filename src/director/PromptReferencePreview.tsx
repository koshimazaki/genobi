import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ReferencePreview from "../components/ReferencePreview";
import type { Bundle } from "./bundle";
import type { PromptReference } from "./prompt-brief";

/** What a prompt reference opens large: its project file, if it has one. */
export function previewMedia(bundle: Bundle, reference: PromptReference) {
  const asset = reference.assetId
    ? bundle.project.assets[reference.assetId]
    : undefined;
  if (!asset || (asset.kind !== "image" && asset.kind !== "video")) return;
  const bytes = bundle.files.get(asset.file.path);
  return bytes ? { kind: asset.kind, bytes } : undefined;
}

/** The gallery's lightbox treatment for a prompt reference's image or video. */
export function PromptReferencePreview({
  bundle,
  reference,
  onClose,
}: {
  bundle: Bundle;
  reference: PromptReference;
  onClose: () => void;
}) {
  const media = previewMedia(bundle, reference);
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!media) return;
    const next = URL.createObjectURL(new Blob([media.bytes]));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [media?.bytes]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!media || !url) return null;
  // On the body, so the Director's small-image rules do not shrink it.
  return createPortal(
    <ReferencePreview
      url={url}
      label={reference.label}
      kind={media.kind}
      onClose={onClose}
    />,
    document.body,
  );
}
