// The lock from the supplied dsgndept timeline.
/** A padlock, open or closed, drawn in currentColor. */
export default function LockGlyph({
  open,
  size = 14,
}: {
  open: boolean;
  size?: number;
}) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.5" y="11" width="15" height="9" rx="1.5" />
      {open ? (
        <path d="M8 11V7a4 4 0 0 1 7.5-2" />
      ) : (
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      )}
    </svg>
  );
}
