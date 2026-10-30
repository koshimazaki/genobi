import Icon from "../components/Icon";
import { ShurikenIcon } from "./ShurikenIcon";
import { DualSwordsIcon } from "./DualSwordsIcon";
import { ScrollIcon } from "./ScrollIcon";

const shapes: Record<string, React.ReactNode> = {
  wrench: (
    <path d="M14.5 6.5 18 3a6 6 0 0 0-7 8L3.5 18.5a2 2 0 0 0 3 3L14 14a6 6 0 0 0 8-7l-3.5 3.5-4-4Z" />
  ),
  camera: (
    <>
      <rect x="3" y="6" width="18" height="14" rx="3" />
      <path d="m8 6 2-3h4l2 3" />
      <circle cx="12" cy="13" r="4" />
    </>
  ),
  play: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="m10 8 6 4-6 4Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <path d="M8 3v6M16 9v6M10 15v6" />
    </>
  ),
  cube: (
    <>
      <path d="m12 2 9 5v10l-9 5-9-5V7Zm0 10L3 7m9 5 9-5m-9 5v10" />
    </>
  ),
};
export function PresetIcon({ name }: { name: string }) {
  if (name === "grid") return <Icon name="grid" size={16} />;
  if (name === "ninja") return <ShurikenIcon />;
  if (name === "swords") return <DualSwordsIcon />;
  if (name === "scroll") return <ScrollIcon />;

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[name]}
    </svg>
  );
}
