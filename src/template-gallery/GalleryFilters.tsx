import ThemedSelect from "../components/ThemedSelect";
import { useEffect, useRef, useState } from "react";
import {
  galleryTemplates,
  emptyFilters,
  KIND_LABEL,
  type GalleryFilters as Filters,
} from "../../shared/gallery/catalogue";
import { templateEntries } from "../../shared/templates/plan";
import { TIER_LABEL } from "../../shared/gallery/badges";
import { registry } from "../../shared/registry";
import Icon from "../components/Icon";

export default function GalleryFilters({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (filters: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  // "Open only" is the gallery's own toggle, so the panel's count leaves it out.
  const count = Object.entries(value).filter(
    ([key, v]) => key !== "open" && v,
  ).length;
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (e.target instanceof Node && !root.current?.contains(e.target))
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  const unique = (values: string[]) => [...new Set(values)].map((v) => [v, v]);
  const fields: [Exclude<keyof Filters, "open">, string, string[][]][] = [
    ["kind", "Kind", Object.entries(KIND_LABEL)],
    ["tool", "Tool", unique(["Director", "Camera", "3D"])],
    [
      "style",
      "Style",
      // A generation has no house style to filter by.
      unique(
        galleryTemplates.filter((t) => !t.generation).map((t) => t.style.name),
      ),
    ],
    [
      "format",
      "Format",
      unique(galleryTemplates.flatMap((t) => [...t.inputs.aspects])),
    ],
    [
      "length",
      "Template length",
      [
        ["short", "Up to 10 seconds"],
        ["long", "Over 10 seconds"],
      ],
    ],
    [
      "model",
      "Model",
      unique(galleryTemplates.flatMap(templateEntries)).map(([id]) => [
        id,
        registry.find((e) => e.id === id)?.label ?? id,
      ]),
    ],
    ["tier", "Tier", Object.entries(TIER_LABEL)],
  ];
  return (
    <div
      className="template-filters"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        className="gallery-filter-trigger"
        aria-expanded={open}
        aria-controls="template-filter-panel"
        onClick={() => setOpen(!open)}
      >
        Filters{count > 0 && <span>{count}</span>}
        <Icon name="chevron" size={12} />
      </button>
      {open && (
        <div
          className="template-filter-panel"
          id="template-filter-panel"
          role="region"
          aria-label="Filter templates"
        >
          {fields.map(([key, label, options]) => (
            <label key={key}>
              {label}
              <ThemedSelect
                value={value[key]}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              >
                <option value="">All</option>
                {options.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </ThemedSelect>
            </label>
          ))}
          <button
            onClick={() => onChange({ ...emptyFilters, open: value.open })}
          >
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
