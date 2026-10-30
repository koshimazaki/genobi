import { describe, expect, it } from "vitest";
import { openModal } from "../src/components/useModalDialog";

/**
 * A stand-in for the browser: an open modal makes the rest of the page inert,
 * so nothing outside it can take focus until it closes.
 */
function page() {
  const state = {
    active: null as unknown,
    modalOpen: false,
    focused: [] as string[],
  };
  const element = (name: string, insideDialog = false) => ({
    name,
    isConnected: true,
    focus() {
      if (state.modalOpen && !insideDialog) return;
      state.active = this;
      state.focused.push(name);
    },
  });
  const opener = element("opener");
  const close = element("close", true);
  const dialog = {
    open: false,
    showModal() {
      this.open = state.modalOpen = true;
      close.focus();
    },
    close() {
      this.open = state.modalOpen = false;
    },
  };
  opener.focus();
  return { state, opener, dialog, active: () => state.active as Element };
}

describe("openModal", () => {
  it("returns focus to the opener after closing", () => {
    const p = page();
    const cleanup = openModal(p.dialog, p.active);
    expect(p.dialog.open).toBe(true);
    expect(p.state.active).not.toBe(p.opener);
    cleanup();
    expect(p.dialog.open).toBe(false);
    expect(p.state.active).toBe(p.opener);
  });

  it("survives a development double mount", () => {
    const p = page();
    openModal(p.dialog, p.active)();
    const cleanup = openModal(p.dialog, p.active);
    expect(p.dialog.open).toBe(true);
    cleanup();
    expect(p.state.active).toBe(p.opener);
  });

  it("does not reopen an open dialog or focus a removed opener", () => {
    const p = page();
    p.dialog.open = true;
    let shown = 0;
    p.dialog.showModal = () => void shown++;
    p.opener.isConnected = false;
    const before = p.state.focused.length;
    openModal(p.dialog, p.active)();
    expect(shown).toBe(0);
    expect(p.state.focused.length).toBe(before);
  });
});
