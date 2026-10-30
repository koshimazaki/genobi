import { useEffect, useState, type ReactNode } from "react";
import {
  installMessages,
  messageHold,
  nextMessage,
  type InstallKind,
} from "../../shared/install-messages";
import AsciiBackdrop from "../deck/AsciiBackdrop";
import { readIntroVideo } from "./connect-api";
import "./install-wait.css";

/**
 * The fixed sentences of one install, one at a time: the welcome, then what
 * is being installed and what the mode will feel like. Each stays for a
 * reading pace; Pause holds it and Next moves on.
 */
export function InstallMessages({ kind }: { kind: InstallKind }) {
  const messages = installMessages(kind);
  const count = messages.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const text = messages[index];
  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(
      () => setIndex((value) => nextMessage(value, count)),
      messageHold(text),
    );
    return () => clearTimeout(timer);
  }, [text, count, paused]);
  return (
    <div className="install-messages">
      <p className="install-messages__text" aria-live="polite">
        {text}
      </p>
      <div className="install-messages__controls">
        <small>
          {index + 1} of {count}
        </small>
        <button
          type="button"
          aria-pressed={paused}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          onClick={() => setIndex((value) => nextMessage(value, count))}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/**
 * "Watch the video while it downloads": only with an address, which the
 * local server reads from `GENOBI_INTRO_VIDEO_URL`. It never plays by
 * itself; the person presses play.
 */
export function IntroVideoCard({
  address,
  kind,
}: {
  address?: string;
  kind: InstallKind;
}) {
  if (!address) return null;
  return (
    <figure className="install-video">
      <figcaption>
        {kind === "voice"
          ? "Watch the video while it downloads"
          : "Watch the video while Hermes is set up"}
      </figcaption>
      <video src={address} controls preload="metadata" playsInline />
    </figure>
  );
}

/** The intro video's address, read while an install waits. */
function useIntroVideo(active: boolean) {
  const [video, setVideo] = useState<string>();
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void readIntroVideo(controller.signal).then((address) => {
      if (!controller.signal.aborted) setVideo(address);
    });
    return () => controller.abort();
  }, [active]);
  return video;
}

/**
 * An install's wait in setup: Rain drawn faintly behind the installer's own
 * progress (`children`), the install's sentences under it, and the intro
 * video when one is configured. Decorative only: bytes and percentages come
 * from the progress the installer reports, never from here. Inactive, it is
 * the progress alone.
 */
export function InstallWait({
  kind,
  active,
  children,
}: {
  kind: InstallKind;
  active: boolean;
  children: ReactNode;
}) {
  const video = useIntroVideo(active);
  if (!active) return <>{children}</>;
  return (
    <div className="install-wait" data-kind={kind}>
      <div className="install-wait__panel">
        <AsciiBackdrop
          className="install-wait__rain"
          program="rain"
          columns={96}
          rows={40}
        />
        <div className="install-wait__content">
          {children}
          <InstallMessages kind={kind} />
        </div>
      </div>
      <IntroVideoCard address={video} kind={kind} />
    </div>
  );
}
