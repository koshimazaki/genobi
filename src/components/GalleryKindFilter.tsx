import {
  GALLERY_KINDS,
  type GalleryKind,
  type GalleryKindChoice,
} from "../gallery-kind";

/**
 * The gallery's quiet kind filter: plain names, one per kind the gallery
 * holds. Nothing is shown while it holds a single kind, since there is
 * nothing to choose between. The choice is not persisted.
 */
export default function GalleryKindFilter({
  kinds,
  value,
  onChange,
}: {
  kinds: GalleryKind[];
  value: GalleryKindChoice;
  onChange: (value: GalleryKindChoice) => void;
}) {
  if (kinds.length < 2) return null;
  const options = [
    { id: "all" as const, label: "All" },
    ...GALLERY_KINDS.filter((k) => kinds.includes(k.id)),
  ];
  return (
    <div className="gallery-kinds" role="group" aria-label="Media kind">
      {options.map((option) => (
        <button
          key={option.id}
          className={value === option.id ? "active" : ""}
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
