import type { AspectRatio } from "../../shared/types";
export default function AspectRatioIcon({ ratio }: { ratio: AspectRatio }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 17 / Math.max(w, h);
  const width = w * scale,
    height = h * scale;
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="aspect-ratio-icon"
    >
      <rect
        x={(20 - width) / 2}
        y={(20 - height) / 2}
        width={width}
        height={height}
        rx="1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  );
}
