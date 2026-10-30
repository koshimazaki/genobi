// Setup's install wait (Box 1.10): the welcome first, then each install's
// fixed sentences one at a time, Rain drawn faintly behind the installer's
// own progress, the cli-spinners frame on the running step, and the intro
// video card only when an address is configured.
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import spinners from "cli-spinners";
import {
  HERMES_MESSAGES,
  installMessages,
  messageHold,
  nextMessage,
  VOICE_MESSAGES,
} from "../shared/install-messages";
import { introVideoAddress } from "../shared/intro-video";
import { WELCOME } from "../shared/welcome";
import {
  InstallMessages,
  InstallWait,
  IntroVideoCard,
} from "../src/setup/InstallWait";
import { HermesProfileProgress } from "../src/setup/HermesProfileProgress";
import { VoiceInstallProgress } from "../src/voice/VoiceInstallProgress";
import { readIntroVideo } from "../src/setup/connect-api";

const words = (text: string) => text.trim().split(/\s+/).length;
/** The order the messages show in, from the first, over `steps` advances. */
const sequence = (count: number, steps: number) => {
  const shown = [0];
  for (let i = 0; i < steps; i++) shown.push(nextMessage(shown.at(-1)!, count));
  return shown;
};

const spinnerMark = `<span class="cli-spinner" aria-hidden="true">${spinners.dots.frames[0]}</span>`;

afterEach(() => vi.unstubAllGlobals());

describe("the install's sentences", () => {
  it("start with the welcome, then say what each install does, in order", () => {
    expect(installMessages("voice")).toEqual([WELCOME, ...VOICE_MESSAGES]);
    expect(installMessages("hermes")).toEqual([WELCOME, ...HERMES_MESSAGES]);
    expect(VOICE_MESSAGES.join(" ")).toMatch(/nothing runs until you press/i);
    expect(VOICE_MESSAGES.join(" ")).toMatch(/never leaves this machine/);
    expect(HERMES_MESSAGES.join(" ")).toMatch(/waits for your approval/);
  });

  it("show the welcome once, then go round the install's own sentences", () => {
    const count = installMessages("voice").length;
    const shown = sequence(count, count * 2);
    expect(shown.slice(0, count)).toEqual([...Array(count).keys()]);
    expect(shown.filter((index) => index === 0)).toHaveLength(1);
    expect(shown[count]).toBe(1);
    expect(sequence(1, 3)).toEqual([0, 0, 0, 0]);
  });

  it("stay for a reading pace, between six and thirty seconds", () => {
    expect(messageHold("Short.")).toBe(6_000);
    const sentence = VOICE_MESSAGES[1];
    expect(messageHold(sentence)).toBe(words(sentence) * 300);
    expect(messageHold(WELCOME)).toBe(30_000);
    expect(messageHold("word ".repeat(400))).toBe(30_000);
  });

  it("keep the welcome under 120 words and each sentence short", () => {
    expect(words(WELCOME)).toBeLessThan(120);
    expect(WELCOME).toMatch(/open-source video studio/);
    expect(WELCOME).toMatch(/Press the mic/);
    for (const text of [...VOICE_MESSAGES, ...HERMES_MESSAGES]) {
      expect(words(text)).toBeLessThanOrEqual(25);
      // Never a made-up progress figure: those come from the installer.
      expect(text).not.toMatch(/%/);
    }
  });

  it("render the welcome first, with Pause and Next", () => {
    const html = renderToStaticMarkup(<InstallMessages kind="hermes" />);
    expect(html).toContain(WELCOME.slice(0, 40));
    expect(html).toContain(`1 of ${HERMES_MESSAGES.length + 1}`);
    expect(html).toContain(">Pause</button>");
    expect(html).toContain(">Next</button>");
    expect(html).toContain('aria-live="polite"');
  });
});

describe("the install wait", () => {
  it("draws Rain faintly behind the progress and hides it from assistive technology", () => {
    const html = renderToStaticMarkup(
      <InstallWait kind="voice" active>
        <p>progress</p>
      </InstallWait>,
    );
    expect(html).toMatch(
      /<pre class="ascii-backdrop install-wait__rain" aria-hidden="true">[⠀-⣿\n]+<\/pre>/,
    );
    expect(html.indexOf("progress")).toBeLessThan(
      html.indexOf(WELCOME.slice(0, 20)),
    );
    // No address has been read, so there is no video card.
    expect(html).not.toContain("<video");
    expect(html).not.toContain("Watch the video");
  });

  it("is only the progress when nothing installs", () => {
    expect(
      renderToStaticMarkup(
        <InstallWait kind="hermes" active={false}>
          <p>progress</p>
        </InstallWait>,
      ),
    ).toBe("<p>progress</p>");
  });

  it("puts a cli-spinners frame on the running step, and no figure the installer did not report", () => {
    const voice = renderToStaticMarkup(
      <VoiceInstallProgress
        state={{
          phase: "runtime",
          bytes: 0,
          busy: true,
          steps: {
            environment: "done",
            check: "done",
            download: "skipped",
            runtime: "running",
          },
        }}
        total={1_880_560_703}
        pending={false}
        onCancel={() => {}}
      />,
    );
    expect(voice).toContain(spinnerMark);
    expect(voice).not.toMatch(/%|GB \//);
    const hermes = renderToStaticMarkup(
      <HermesProfileProgress
        state={{
          phase: "running",
          steps: { check: "done", create: "running" },
        }}
      />,
    );
    expect(hermes).toContain(spinnerMark);
    expect(hermes).not.toMatch(/%|bytes/);
  });
});

describe("the intro video card", () => {
  it("does not exist without an address", () => {
    expect(renderToStaticMarkup(<IntroVideoCard kind="voice" />)).toBe("");
    expect(
      renderToStaticMarkup(<IntroVideoCard kind="voice" address="" />),
    ).toBe("");
  });

  it("shows the video with controls and never plays by itself", () => {
    const html = renderToStaticMarkup(
      <IntroVideoCard kind="voice" address="https://example.com/intro.mp4" />,
    );
    expect(html).toContain("Watch the video while it downloads");
    expect(html).toContain('src="https://example.com/intro.mp4"');
    expect(html).toContain("controls");
    expect(html).not.toMatch(/autoplay/i);
  });

  it("keeps only an https address or a path on the studio", () => {
    expect(introVideoAddress("https://example.com/intro.mp4")).toBe(
      "https://example.com/intro.mp4",
    );
    expect(introVideoAddress(" /media/intro.mp4 ")).toBe("/media/intro.mp4");
    for (const value of [
      undefined,
      null,
      42,
      "",
      "http://example.com/intro.mp4",
      "javascript:alert(1)",
      "//example.com/intro.mp4",
      "https://user:secret@example.com/intro.mp4",
      "https://example.com/in\ntro.mp4",
      `https://example.com/${"a".repeat(2048)}`,
    ])
      expect(introVideoAddress(value)).toBeUndefined();
  });

  it("reads none where the route is missing, as on the hosted studio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response('{"error":"API route not found."}', { status: 404 }),
      ),
    );
    expect(await readIntroVideo()).toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ video: "javascript:alert(1)" })),
    );
    expect(await readIntroVideo()).toBeUndefined();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ video: "/media/intro.mp4" })),
    );
    expect(await readIntroVideo()).toBe("/media/intro.mp4");
  });
});
