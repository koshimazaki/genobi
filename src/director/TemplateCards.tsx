import { mixTemplates } from "../../shared/templates/catalogue";

/** A card in the Director's template list. */
export interface TemplateCard {
  id: string;
  name: string;
  description: string;
  video: string;
  poster: string;
}

/**
 * The Director's template list: the mix templates first (finished cuts of
 * bundled media, `shared/templates/dimensions-mix.ts`). A card plays its muted preview on hover or focus.
 */
export const templateCards: readonly TemplateCard[] = [
  ...mixTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    video: t.examples[0].video,
    poster: t.examples[0].poster,
  })),
];

const motion = () => !matchMedia("(prefers-reduced-motion: reduce)").matches;
const play = (card: HTMLElement) => {
  if (motion())
    void card
      .querySelector("video")
      ?.play()
      .catch(() => {});
};
const pause = (card: HTMLElement) => card.querySelector("video")?.pause();

export default function TemplateCards({
  activeId,
  disabled,
  onChoose,
}: {
  activeId: string | undefined;
  disabled: boolean;
  onChoose: (id: string) => void;
}) {
  return (
    <div
      className="dir-template-cards"
      role="group"
      aria-label="Choose a template"
    >
      {templateCards.map((t) => (
        <button
          key={t.id}
          className="dir-template-card"
          aria-pressed={activeId === t.id}
          disabled={disabled}
          onPointerEnter={(e) => play(e.currentTarget)}
          onPointerLeave={(e) => pause(e.currentTarget)}
          onFocus={(e) => play(e.currentTarget)}
          onBlur={(e) => pause(e.currentTarget)}
          onClick={() => {
            if (t.id !== activeId) onChoose(t.id);
          }}
        >
          <video
            src={t.video}
            poster={t.poster}
            muted
            loop
            playsInline
            preload="none"
            aria-hidden="true"
          />
          <strong>{t.name}</strong>
          <span>{t.description}</span>
        </button>
      ))}
    </div>
  );
}
