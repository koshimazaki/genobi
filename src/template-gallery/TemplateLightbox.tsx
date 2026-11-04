import { createPortal } from "react-dom";
import type { RefObject } from "react";
import type { HouseTemplate } from "../../shared/templates/types";
import VideoLightbox from "../components/VideoLightbox";
import { templateClip, templateSound } from "./template-clip";

/** Which template's full cut is open, and whether a card or the drawer asked. */
export interface Viewing {
  id: string;
  from: "card" | "drawer";
}

/**
 * The gallery's light view: Camera's lightbox on a template's full-resolution
 * cut. Opened from a card, the arrow keys step through the visible cards that
 * have a video and closing returns focus to the card's View icon; opened from
 * the drawer, it shows that template alone and focus goes back to the drawer.
 * It sits on the body, outside the cards and the drawer, so neither their
 * `inert` nor the drawer's Escape handler reaches it.
 */
export default function TemplateLightbox({
  viewing,
  shown,
  cards,
  onViewing,
}: {
  viewing: Viewing;
  shown: readonly HouseTemplate[];
  cards: RefObject<HTMLElement | null>;
  onViewing: (viewing: Viewing | undefined) => void;
}) {
  const items = shown.filter(
    (template) =>
      (viewing.from === "card" || template.id === viewing.id) &&
      templateClip(template),
  );
  const index = items.findIndex((template) => template.id === viewing.id);
  const template = items[index];
  if (!template) return null;
  function close() {
    onViewing(undefined);
    if (viewing.from !== "card") return;
    // After stepping, the icon to return to is the card now on show.
    requestAnimationFrame(() =>
      [...(cards.current?.querySelectorAll<HTMLElement>("[data-view]") ?? [])]
        .find((button) => button.dataset.view === viewing.id)
        ?.focus(),
    );
  }
  return createPortal(
    <VideoLightbox
      clip={templateClip(template)!}
      sound={templateSound(template)}
      onClose={close}
      nav={
        viewing.from === "card" && items.length > 1
          ? {
              position: `${index + 1} / ${items.length}`,
              onStep: (offset) =>
                onViewing({
                  id: items[(index + offset + items.length) % items.length].id,
                  from: "card",
                }),
            }
          : undefined
      }
    />,
    document.body,
  );
}
