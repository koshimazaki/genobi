import { describe, expect, it, vi } from "vitest";
import {
  micPanel,
  onVoiceReady,
  VOICE_READY,
} from "../src/voice/install-store";
import type { VoiceStatus } from "../src/voice/api";

/**
 * The header mic (VoiceButton) wires these two: a finished install re-reads
 * status only while its panel is closed, and the recorder, which asks for the
 * microphone, mounts only once a status read says voice is available.
 */
const UNSET: VoiceStatus = { available: false, maxSeconds: 180 };
const READY: VoiceStatus = { available: true, maxSeconds: 180 };

describe("the mic when an install finishes", () => {
  it("panel open: no status re-read, so it keeps the install panel and no recorder", () => {
    const page = new EventTarget();
    const reread = vi.fn();
    const stop = onVoiceReady(page, reread, () => true);
    page.dispatchEvent(new Event(VOICE_READY));
    expect(reread).not.toHaveBeenCalled();
    // The status the button holds is still the unset one it read on opening.
    expect(micPanel(true, UNSET)).toBe("setup");
    stop();
  });

  it("panel closed: the status is read again, and the next press records", () => {
    const page = new EventTarget();
    const reread = vi.fn();
    const stop = onVoiceReady(page, reread, () => false);
    page.dispatchEvent(new Event(VOICE_READY));
    expect(reread).toHaveBeenCalledTimes(1);
    expect(micPanel(false, READY)).toBeUndefined();
    expect(micPanel(true, READY)).toBe("recorder");
    stop();
    page.dispatchEvent(new Event(VOICE_READY));
    expect(reread).toHaveBeenCalledTimes(1);
  });

  it("without a panel guard (setup, /taste#setup) it always re-reads", () => {
    const page = new EventTarget();
    const reread = vi.fn();
    const stop = onVoiceReady(page, reread);
    page.dispatchEvent(new Event(VOICE_READY));
    expect(reread).toHaveBeenCalledTimes(1);
    stop();
  });
});
