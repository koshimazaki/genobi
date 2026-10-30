import { useRef, useState, type CSSProperties } from "react";
import {
  cameraClauses,
  isLtxModel,
  type CameraSelection,
  type CameraEdits,
} from "../../shared/camera";
import { acousticCaption, type AcousticSetting } from "../../shared/acoustic";
import {
  emptyLight,
  lightSentences,
  type LightEdits,
  type LightSelection,
} from "../../shared/light";
import {
  composesLtx,
  DESCRIPTION_LIMIT,
  emptySlots,
  fitSegments,
  ltxSegments,
  ltxSlots,
  promptParts,
  SLOT_LIMIT,
  type LtxSlots,
  type SlotId,
} from "../../shared/ltx-prompt";
import { acousticSwitch, entryFor } from "../../shared/registry";
import type { VideoModel } from "../../shared/types";
import { gapFieldId, ltxState } from "../ltx-composer";
import PromptField from "./PromptField";
import SlotChips from "./SlotChips";

type Tab = "main" | SlotId;
const number = (value: number) => value.toLocaleString("en-GB");

export default function PromptInput({
  description,
  onChange,
  cameraEnabled,
  camera,
  cameraEdits,
  model,
  onOpenCamera,
  acoustic = null,
  onOpenAcoustic = () => {},
  slots = emptySlots,
  onSlotsChange,
  light = emptyLight,
  lightEdits = {},
  resizable = false,
}: {
  description: string;
  onChange: (description: string) => void;
  cameraEnabled: boolean;
  camera: CameraSelection;
  cameraEdits: CameraEdits;
  model: VideoModel;
  onOpenCamera: () => void;
  /** The AKUSPACE treatment the prompt closes with, or null. */
  acoustic?: AcousticSetting | null;
  onOpenAcoustic?: () => void;
  /** LTX's gaps; without `onSlotsChange` the field is the one prompt. */
  slots?: LtxSlots;
  onSlotsChange?: (slots: LtxSlots) => void;
  light?: LightSelection;
  lightEdits?: LightEdits;
  resizable?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("main");
  // The main text changed while a gap was open, so it came from elsewhere (a
  // spoken request, a Recreate): show the Prompt tab that now holds it.
  const [shown, setShown] = useState(description);
  if (shown !== description) {
    setShown(description);
    if (tab !== "main") setTab("main");
  }
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const ltx = isLtxModel(model) && Boolean(onSlotsChange);
  const active: Tab = ltx ? tab : "main";
  const fields = {
    generator: "video" as const,
    model,
    description,
    cameraEnabled,
    camera,
    cameraEdits,
    acoustic,
    slots,
    light,
    lightEdits,
  };
  const state = ltxState(fields);
  const composed = ltx && composesLtx(state);
  const fitted = fitSegments(ltxSegments(state));
  const count = composed ? fitted.length : description.length;
  const clauses = cameraEnabled
    ? cameraClauses(camera, cameraEdits, model)
    : [];
  const lights = ltx ? lightSentences(light, lightEdits) : [];
  const sentences = [
    ...clauses
      .filter(({ section }) => section.id !== "movements")
      .map(({ section, term, text }) => ({
        key: term.id,
        color: section.color,
        text,
      })),
    ...lights.map(({ term, text }) => ({
      key: term.id,
      color: "--camera-light",
      text,
    })),
    ...clauses
      .filter(({ section }) => section.id === "movements")
      .map(({ section, term, text }) => ({
        key: term.id,
        color: section.color,
        text,
      })),
  ];
  const order: Tab[] = ["main", ...ltxSlots.map(({ id }) => id)];
  const info = ltxSlots.find(({ id }) => id === active);
  const switchable = acousticSwitch(entryFor("video", model));
  const field = (
    <PromptField
      id={info ? gapFieldId(info.id) : "description"}
      label={info ? `${info.label} for the LTX prompt` : "Describe your scene"}
      value={info ? slots[info.id] : description}
      onChange={(value) =>
        info ? onSlotsChange!({ ...slots, [info.id]: value }) : onChange(value)
      }
      maxLength={info ? SLOT_LIMIT : 1200}
      placeholder={info ? `${info.label}…` : "Describe a scene…"}
      resizable={resizable}
    />
  );
  return (
    <div
      className={`prompt-editor${ltx ? " prompt-editor--ltx" : ""}`}
      role="group"
      aria-label="Video prompt"
    >
      {ltx && (
        <div className="prompt-parts">
          <div
            className="prompt-parts__tabs"
            role="tablist"
            aria-label="Prompt parts"
          >
            {order.map((id, index) => {
              const part =
                id === "main"
                  ? promptParts.main
                  : ltxSlots.find((s) => s.id === id)!;
              const filled =
                id === "main" ? description.trim() : slots[id].trim();
              return (
                <button
                  key={id}
                  ref={(element) => {
                    tabs.current[index] = element;
                  }}
                  type="button"
                  role="tab"
                  id={`prompt-tab-${id}`}
                  aria-selected={active === id}
                  aria-controls="prompt-part-panel"
                  aria-label={`${part.label}${filled ? ", filled" : ""}`}
                  tabIndex={active === id ? 0 : -1}
                  className={`prompt-part-tab${filled ? " is-filled" : ""}`}
                  style={
                    { "--part-color": `var(${part.color})` } as CSSProperties
                  }
                  onClick={() => setTab(id)}
                  onKeyDown={(event) => {
                    const step =
                      event.key === "ArrowRight"
                        ? 1
                        : event.key === "ArrowLeft"
                          ? -1
                          : 0;
                    if (!step) return;
                    event.preventDefault();
                    const next = (index + step + order.length) % order.length;
                    setTab(order[next]);
                    tabs.current[next]?.focus();
                  }}
                >
                  {part.label}
                  {filled && (
                    <span className="prompt-part-tab__mark" aria-hidden="true">
                      ●
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <span
            className={`prompt-count${fitted.over && composed ? " is-over" : ""}`}
            aria-label={`${number(count)} of ${number(DESCRIPTION_LIMIT)} characters`}
          >
            {number(count)} / {number(DESCRIPTION_LIMIT)}
          </span>
        </div>
      )}
      {!ltx && field}
      {ltx && (
        <div
          id="prompt-part-panel"
          role="tabpanel"
          aria-labelledby={`prompt-tab-${active}`}
          style={
            info
              ? ({ "--part-color": `var(${info.color})` } as CSSProperties)
              : undefined
          }
          className={info ? "prompt-part-panel is-gap" : "prompt-part-panel"}
        >
          {field}
          {info && (
            <SlotChips
              slot={info.id}
              text={slots[info.id]}
              onInsert={(value) =>
                onSlotsChange!({ ...slots, [info.id]: value })
              }
              acoustic={
                info.id === "audio" && switchable ? acoustic : undefined
              }
              onOpenAcoustic={onOpenAcoustic}
            />
          )}
        </div>
      )}
      {!info && sentences.length > 0 && (
        <button
          className="camera-sentences"
          onClick={onOpenCamera}
          aria-label="Edit camera direction"
          title={sentences.map(({ text }) => text).join(" ")}
        >
          {sentences.map(({ key, color, text }) => (
            <span key={key} style={{ color: `var(${color})` }}>
              {text}{" "}
            </span>
          ))}
        </button>
      )}
      {!info && acoustic && (
        <button
          className="acoustic-sentence"
          onClick={onOpenAcoustic}
          aria-label="Edit acoustic space"
        >
          {acousticCaption(acoustic)}
        </button>
      )}
      {composed && fitted.over > 0 && (
        <p className="prompt-cut" role="status">
          {fitted.blocked
            ? `Over by ${number(fitted.over)} characters. Shorten the text: the Acoustic Space caption has to arrive whole.`
            : `Over by ${number(fitted.over)} characters. The end of ${fitted.cut
                .map((part) => promptParts[part].label)
                .join(", ")} will be cut.`}
        </p>
      )}
    </div>
  );
}
