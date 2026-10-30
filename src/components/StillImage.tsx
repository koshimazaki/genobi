export default function StillImage({
  url,
  label,
  onOpen,
  onReady,
  onError,
}: {
  url: string;
  label: string;
  onOpen?: () => void;
  onReady?: () => void;
  onError?: () => void;
}) {
  const image = (
    <img
      className="still-image"
      src={url}
      alt={label}
      onLoad={onReady}
      onError={onError}
    />
  );
  return onOpen ? (
    <button
      className="still-open"
      onClick={onOpen}
      aria-label={`Enlarge ${label}`}
    >
      {image}
    </button>
  ) : (
    image
  );
}
