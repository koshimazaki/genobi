import { useEffect, type RefObject } from "react";

type Modal = Pick<HTMLDialogElement, "open" | "showModal" | "close">;
type Focusable = { focus: () => void; isConnected: boolean };

/**
 * Opens a native modal and returns the cleanup that closes it and gives focus
 * back to the control that opened it. Closing first matters: while the modal
 * is open the rest of the page is inert, so the opener cannot take focus. That
 * also keeps React's development double-mount from losing the opener.
 */
export function openModal(
  dialog: Modal | null | undefined,
  activeElement: () => Element | null = () => document.activeElement,
) {
  const previous = activeElement() as Partial<Focusable> | null;
  if (dialog && !dialog.open) dialog.showModal();
  return () => {
    if (dialog?.open) dialog.close();
    if (previous?.isConnected && typeof previous.focus === "function")
      previous.focus();
  };
}

/** A dialog shown while its component is mounted; see `openModal`. */
export function useModalDialog(dialog: RefObject<HTMLDialogElement | null>) {
  useEffect(() => openModal(dialog.current), [dialog]);
}
