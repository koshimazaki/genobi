import { useSpinnerFrame, type SpinnerName } from "../spinner";

/**
 * A cli-spinners frame as text. Decorative: the words beside it (or a
 * `role="status"` around it) say what is happening.
 */
export default function Spinner({
  name = "dots12",
  on = true,
  className,
}: {
  name?: SpinnerName;
  on?: boolean;
  className?: string;
}) {
  const frame = useSpinnerFrame(name, on);
  return (
    <span
      className={className ? `cli-spinner ${className}` : "cli-spinner"}
      aria-hidden="true"
    >
      {frame}
    </span>
  );
}
