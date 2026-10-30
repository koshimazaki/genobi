import type { CSSProperties } from "react";
const paths: Record<string, string> = {
  // Lucide microphone and link (ISC licence, lucide.dev).
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8",
  link: "M10 13a5 5 0 0 0 7 .54l3-3a5 5 0 0 0-7.07-7.07L11.21 5.2M14 11a5 5 0 0 0-7-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  image: "M3 3h18v18H3zM3 17l6-7 5 5 3-3 4 5M16 7h.01",
  book: "M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z",
  help: "M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  palette:
    "M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.6-3.2c-.9-1.2-.1-2.8 1.4-2.8h2a3 3 0 0 0 3-3 9 9 0 0 0-9-9ZM7 10h.01M10 6.5h.01M15 7.5h.01M6.5 14h.01",
  camera:
    "M4 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Zm12 4 6-4v12l-6-4M6 8V4h6v4M5 12h3",
  chevron: "m8 10 4 4 4-4",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
  // Lucide "scaling" (ISC licence; docs/licences/lucide-scroll.txt).
  scaling:
    "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M14 15H9v-5M16 3h5v5M21 3 9 15",
  // Lucide key-round (ISC licence; docs/licences/lucide-scroll.txt).
  key: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z",
  copy: "M8 8h12v13H8zM4 16H2V2h13v3",
  close: "m6 6 12 12M6 18 18 6",
  play: "m9 5 11 7-11 7z",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  eyeOff:
    "M3 3l18 18M9 5.5Q16 3 22 12q-2 3-4 4M6 6Q3 8 2 12s4 7 10 7q2 0 4-1M10 10a3 3 0 0 0 4 4",
  film: "M3 3h18v18H3ZM7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4",
  graphics: "M12 2l10 10-10 10L2 12ZM12 6v12M6 12h12",
  filter: "M4 5h16M4 12h16M4 19h16M8 2v6M16 9v6M10 16v6",
  fold: "m14 6-6 6 6 6",
  // Lucide "repeat" (ISC licence, lucide.dev).
  loop: "m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3",
  cut: "M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 12a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM8 8l13 13M8 16 21 3",
  pause: "M8 5v14M16 5v14",
  rewind: "M5 5v14M19 5 7 12l12 7Z",
  mute: "M3 9h4l5-4v14l-5-4H3ZM16 9l5 6M21 9l-5 6",
  sound: "M3 9h4l5-4v14l-5-4H3ZM16 8q4 4 0 8M19 5q7 7 0 14",
  check: "m5 12 4 4L19 6",
  // Lucide history and trash-2 (ISC licence, lucide.dev).
  history:
    "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 3v5h5M12 7v5l4 2",
  trash:
    "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
  upload: "M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5",
  refresh: "M20 9a8 8 0 1 0 0 7M20 3v6h-6",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  // Sound radiating through a perspective cube: acoustics in a space.
  acoustic:
    "M12 2 22 7v10l-10 5-10-5V7ZM2 7l10 4 10-4M12 19v3M7 14.5h.01M10.5 12.5q2 2 0 4M14 10.5q4 4 0 8",
};
export default function Icon({
  name,
  size = 18,
  style,
}: {
  name: string;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        width: `calc(${size} * var(--unit))`,
        height: `calc(${size} * var(--unit))`,
        ...style,
      }}
    >
      <path d={paths[name] || paths.camera} />
      {name === "key" && (
        <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
      )}
    </svg>
  );
}
