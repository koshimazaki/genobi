import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { MAX_AUDIO_BYTES } from "../../shared/audio";
import { MAX_IMAGE_BYTES } from "../../shared/image";
import { readyEntry } from "../../shared/registry";
import {
  hasExample,
  readTemplateMedia,
  startingPicks,
  TEMPLATE_ACCEPT,
  type ReferencePicks,
  type ReferenceState,
} from "../../shared/templates/intake";
import type {
  HouseTemplate,
  TemplateReference,
} from "../../shared/templates/types";
import type {
  TemplateMedia,
  TemplateReferences,
} from "../director/house-template";
import type { TemplatePicks } from "./open-template";

/** What a zone shows for a file the person dropped. */
interface Dropped {
  media: TemplateMedia[];
  names: string[];
  /** Object URLs of dropped stills, revoked when replaced or closed. */
  urls: string[];
}

// Filenames are shown, never trusted: control characters become spaces.
const clean = (name: string) =>
  // eslint-disable-next-line no-control-regex
  name.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 80);
const seconds = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, "0")}`;

/** A refusal: the zone's few words, and the drawer's whole sentence. */
export interface Refusal {
  short: string;
  full: string;
}
class Refused extends Error {
  constructor(
    readonly short: string,
    full: string,
  ) {
    super(full);
  }
}
const LIMIT = { image: MAX_IMAGE_BYTES, audio: MAX_AUDIO_BYTES } as const;
const FORMATS = {
  image: "Use PNG, JPEG or WebP",
  audio: "Use WAV or MP3",
} as const;

/** One reference's file(s), proved by their bytes (`readTemplateMedia`). */
export async function readDropped(ref: TemplateReference, files: File[]) {
  if (!files.length)
    throw new Refused("Choose a file", `${ref.label}: choose a file.`);
  if (files.length > ref.max)
    throw new Refused(
      `Up to ${ref.max}`,
      `${ref.label}: add up to ${ref.max}.`,
    );
  // The size is checked before a byte is read.
  for (const file of files)
    if (file.size > LIMIT[ref.kind])
      throw new Refused(
        "Too large",
        `${ref.label}: ${clean(file.name)} is over ${ref.kind === "image" ? "5 MB" : "50 MB"}.`,
      );
  const out: Dropped = { media: [], names: [], urls: [] };
  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let facts;
      try {
        facts = await readTemplateMedia(ref, bytes);
      } catch (error) {
        throw new Refused(FORMATS[ref.kind], (error as Error).message);
      }
      out.media.push({ bytes, origin: "uploaded", ...facts });
      out.names.push(clean(file.name));
      if (ref.kind === "image")
        out.urls.push(URL.createObjectURL(new Blob([bytes])));
    }
  } catch (error) {
    out.urls.forEach((u) => URL.revokeObjectURL(u));
    throw error;
  }
  return out;
}

/**
 * The drawer's intake: one zone per reference, each at the template's
 * example, the person's own file, or left for Genobi to make. Returns the
 * picks the actions take and the zones to render.
 */
export function useTemplateIntake(template: HouseTemplate) {
  const [picks, setPicks] = useState<ReferencePicks>(() =>
    startingPicks(template),
  );
  const [dropped, setDropped] = useState<Record<string, Dropped>>({});
  const [errors, setErrors] = useState<Record<string, Refusal | undefined>>({});
  // The preview URLs live outside render state, so the cleanup that runs
  // when the drawer closes revokes the ones made since, not the first set.
  const urls = useRef<Record<string, string[]>>({});
  useEffect(() => {
    const live = urls.current;
    return () =>
      Object.values(live).forEach((list) =>
        list.forEach((u) => URL.revokeObjectURL(u)),
      );
  }, []);
  const set = (id: string, state: ReferenceState) =>
    setPicks((p) => ({ ...p, [id]: state }));
  async function add(ref: TemplateReference, files: File[]) {
    try {
      const next = await readDropped(ref, files);
      urls.current[ref.id]?.forEach((u) => URL.revokeObjectURL(u));
      urls.current[ref.id] = next.urls;
      setDropped((d) => ({ ...d, [ref.id]: next }));
      setErrors((e) => ({ ...e, [ref.id]: undefined }));
      set(ref.id, "yours");
    } catch (error) {
      const full = (error as Error).message;
      const short = error instanceof Refused ? error.short : "Not added";
      setErrors((e) => ({ ...e, [ref.id]: { short, full } }));
    }
  }
  /** The latest refusal's whole sentence, for the drawer's alert. */
  const refusal = Object.values(errors).find(Boolean)?.full;
  const chosen: TemplatePicks = useMemo(
    () => ({
      picks,
      dropped: Object.fromEntries(
        Object.entries(dropped).map(([id, d]) => [id, d.media]),
      ) as TemplateReferences,
    }),
    [picks, dropped],
  );
  return { chosen, picks, dropped, errors, refusal, set, add };
}

type Intake = ReturnType<typeof useTemplateIntake>;

function Preview({
  reference: ref,
  state,
  dropped,
}: {
  reference: TemplateReference;
  state: ReferenceState;
  dropped?: Dropped;
}) {
  if (state === "yours" && dropped) {
    if (ref.kind === "image")
      return <img src={dropped.urls[0]} alt="" draggable={false} />;
    const length = dropped.media[0].durationSeconds;
    return <span>{length ? seconds(length) : "Track"}</span>;
  }
  if (state === "example") {
    if (ref.example && ref.kind === "image")
      return <img src={ref.example} alt="" draggable={false} />;
    return (
      <span>{ref.kind === "audio" ? "120 BPM pulse" : "Sample still"}</span>
    );
  }
  return <span>{ref.madeWith ? "Genobi makes it" : "None"}</span>;
}

export function caption(
  ref: TemplateReference,
  state: ReferenceState,
  d?: Dropped,
) {
  if (state === "yours" && d)
    return d.names.length > 1
      ? `Yours · ${d.names.length} files`
      : `Yours · ${d.names[0]}`;
  if (state === "example") return "Example";
  const maker = ref.madeWith && readyEntry(ref.madeWith);
  if (!maker) return "None";
  // A licence's required name leads, as the composer foot shows it.
  const name = maker.credit ? `${maker.credit} · ${maker.label}` : maker.label;
  return `Generate · ${name}${ref.candidates ? ` ×${ref.candidates}` : ""}`;
}

/** The drop zones, one per reference, in a fixed-height row. */
export default function TemplateIntake({
  template,
  intake,
  disabled,
}: {
  template: HouseTemplate;
  intake: Intake;
  disabled: boolean;
}) {
  if (!template.references.length) return null;
  return (
    <section className="template-intake" aria-label="References">
      <h3>Assets it uses · drop yours to swap</h3>
      <div
        className="template-zones"
        style={{ "--zones": template.references.length } as CSSProperties}
      >
        {template.references.map((ref) => {
          const state = intake.picks[ref.id] ?? "missing";
          const d = intake.dropped[ref.id];
          const label = ref.label.toLowerCase();
          return (
            <div
              key={ref.id}
              className="template-zone"
              data-reference={ref.id}
              data-state={state}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!disabled) void intake.add(ref, [...e.dataTransfer.files]);
              }}
            >
              <div className="template-zone-preview" aria-hidden="true">
                <Preview reference={ref} state={state} dropped={d} />
              </div>
              <strong>{ref.label}</strong>
              {intake.errors[ref.id] ? (
                // A refusal takes the state line's place, in a few words, so
                // the zone keeps its size; the drawer's alert has the sentence.
                <span className="template-zone-state" data-refused="true">
                  {intake.errors[ref.id]!.short}
                </span>
              ) : (
                <span className="template-zone-state" title={ref.hint}>
                  {caption(ref, state, d)}
                </span>
              )}
              <div className="template-zone-actions">
                <label className="template-zone-drop">
                  Drop yours
                  <input
                    className="sr-only"
                    type="file"
                    aria-label={`Drop your ${label}`}
                    accept={TEMPLATE_ACCEPT[ref.kind]}
                    multiple={ref.max > 1}
                    disabled={disabled}
                    onChange={(e) => {
                      const files = [...(e.target.files ?? [])];
                      e.target.value = "";
                      if (files.length) void intake.add(ref, files);
                    }}
                  />
                </label>
                {ref.min === 0 && ref.madeWith && (
                  <button
                    type="button"
                    aria-label={`Generate the ${label}`}
                    aria-pressed={state === "missing"}
                    disabled={disabled}
                    onClick={() => intake.set(ref.id, "missing")}
                  >
                    Generate
                  </button>
                )}
                {state === "yours" &&
                  ref.min === 0 &&
                  !ref.madeWith &&
                  !hasExample(ref) && (
                    <button
                      type="button"
                      aria-label={`Remove your ${label}`}
                      disabled={disabled}
                      onClick={() => intake.set(ref.id, "missing")}
                    >
                      Clear
                    </button>
                  )}
                {state !== "example" && hasExample(ref) && (
                  <button
                    type="button"
                    aria-label={`Use the example ${label}`}
                    disabled={disabled}
                    onClick={() => intake.set(ref.id, "example")}
                  >
                    Example
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
