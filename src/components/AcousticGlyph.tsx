import { roomGlyph } from "./acoustic-room-glyph";

/** Small spatial diagrams, sharing the camera glyphs' frame and line weight. */
const speaker = (x: number, y: number) =>
  `M${x} ${y - 2}h3l4-3.5v11L${x + 3} ${y + 2}h-3z`;
const arcs = (x: number, y: number, count: number) =>
  Array.from({ length: count }, (_, index) => {
    const r = 3 + index * 3;
    return `M${x + r * 0.6} ${y - r * 0.8}a${r} ${r} 0 0 1 0 ${r * 1.6}`;
  }).join("");

const drawings: Record<string, string> = {
  outdoor_day: `M4 31h40${speaker(7, 22)}${arcs(14, 22, 2)}`,
  outdoor_night: `M4 31h40M37 6a6 6 0 1 0 5 10 5 5 0 0 1-5-10M27 8h.01M30 15h.01${speaker(7, 22)}${arcs(14, 22, 2)}`,
  dual_delay: `${speaker(5, 20)}M17 11v18m5-16v14m5-11v8m5-6v4m5-3v2M22 34h18`,
};

export default function AcousticGlyph({ preset }: { preset: string }) {
  const room = roomGlyph(preset);
  return (
    <svg
      width="3.25em"
      height="3.25em"
      viewBox="0 0 48 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {preset === "cathedral" ? (
        <g transform="translate(24 22) scale(1.1) translate(-24 -22)">
          <path
            d="M7 31V19l8-9 8 17v12Z"
            fill="currentColor"
            fillOpacity=".12"
          />
          <path d="M23 39V27l17-7v12Z" fill="currentColor" fillOpacity=".05" />
          <path
            d="m15 10 17-7 8 17-17 7Z"
            fill="currentColor"
            fillOpacity=".06"
          />
          <path d="M11 33v-6q0-4 4-5 4 5 4 9v6M28 32v-5l3-5 3 2v6" />
        </g>
      ) : room ? (
        <>
          <polygon
            points={room.floor}
            fill="currentColor"
            fillOpacity=".06"
            stroke="none"
          />
          <path d={room.backEdges} opacity=".3" />
          <polygon
            points={room.left}
            fill="currentColor"
            fillOpacity=".12"
            stroke="none"
          />
          <polygon
            points={room.right}
            fill="currentColor"
            fillOpacity=".05"
            stroke="none"
          />
          <path d={room.edges} />
          <circle
            cx={room.source[0]}
            cy={room.source[1]}
            r="1.4"
            fill="currentColor"
            stroke="none"
          />
        </>
      ) : (
        <>
          <path d={drawings[preset] ?? drawings.outdoor_day} />
          {preset === "outdoor_day" && (
            <g stroke="none" fill="currentColor">
              <path d="M32 8h6v2h2v6h-2v2h-6v-2h-2v-6h2Z" />
              <path d="M34 3h2v3h-2zM34 20h2v3h-2zM25 12h3v2h-3zM42 12h3v2h-3zM27 5h2v2h-2zM41 5h2v2h-2zM27 19h2v2h-2zM41 19h2v2h-2z" />
            </g>
          )}
        </>
      )}
    </svg>
  );
}
