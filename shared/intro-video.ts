/**
 * The intro video's address, from `GENOBI_INTRO_VIDEO_URL` on the local
 * server (`GET /api/settings/intro-video`). Only an https address or a path
 * on the studio itself (`/media/intro.mp4`) is kept; anything else, an
 * address with a user name or password in it, or one longer than 2,048
 * characters reads as none, and with none setup shows no video card.
 */
const MAX_LENGTH = 2048;

export function introVideoAddress(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text || text.length > MAX_LENGTH || /[\x00-\x1f\x7f\s\\]/.test(text))
    return undefined;
  if (text.startsWith("/")) return text.startsWith("//") ? undefined : text;
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || url.username || url.password)
      return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}
