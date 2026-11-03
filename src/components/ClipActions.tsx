import Icon from "./Icon";
import AddToProject from "./AddToProject";
import RecreateButton from "./RecreateButton";

export default function ClipActions({
  url,
  filename,
  onRecreate,
  onUpscale,
  onEdit,
}: {
  url: string;
  filename: string;
  onRecreate?: () => void;
  onUpscale?: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="clip-actions">
      <AddToProject url={url} filename={filename} />
      {onRecreate && <RecreateButton onClick={onRecreate} />}
      <a
        className="download-clip"
        href={url}
        download={filename}
        aria-label="Download"
        title="Download this result"
      >
        <span className="clip-action-label">Download</span>
        <span aria-hidden="true">↓</span>
      </a>
      {onEdit && (
        <button
          onClick={onEdit}
          aria-label="Edit image"
          title="Edit image: use this result as the source"
        >
          <span className="clip-action-label">Edit image</span>
          <Icon name="image" size={12} />
        </button>
      )}
      {onUpscale && (
        <button
          onClick={onUpscale}
          aria-label="Upscale"
          title="Use this clip in Upscale"
        >
          <span className="clip-action-label">Upscale</span>
          <Icon name="expand" size={12} />
        </button>
      )}
    </div>
  );
}
