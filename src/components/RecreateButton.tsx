import Icon from "./Icon";

/**
 * The studio's one Recreate control: Camera's own label and `refresh` icon
 * (the gallery card's action, `ClipActions`). Camera, the gallery in the
 * Assets rail and the Director's template slots all draw it from here, so
 * Recreate looks the same everywhere (#57). It only calls `onClick`.
 */
export default function RecreateButton({
  onClick,
  label = "Recreate",
  title = "Recreate: load this run’s prompt, settings and saved input files",
  ariaLabel = label,
  disabled,
}: {
  onClick: () => void;
  label?: string;
  title?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="recreate-button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
    >
      <span className="clip-action-label">{label}</span>
      <Icon name="refresh" size={12} />
    </button>
  );
}
