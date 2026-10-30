// The local media service's limits (server/media-tools.ts), shared so the
// Genobi MCP tools (mcp/media-tools.ts) refuse what the server would refuse
// before sending anything. Portable: no Node or DOM API.

/** A source id as the media routes accept it: an upload, a take, a derived file or a library clip. */
export const MEDIA_SOURCE_ID = /^[a-zA-Z0-9_-]{1,80}$/;
/** Long enough for a timeline cut, short enough to encode on a laptop. */
export const MAX_VIDEO_SECONDS = 120;
/** Frames one `POST /api/media/frames` extracts. */
export const MAX_MEDIA_FRAMES = 16;
/** Clips one concat joins. */
export const MAX_MEDIA_INPUTS = 8;
/** The longest crossfade overlap, in seconds. */
export const MAX_MEDIA_OVERLAP = 5;
/** The shortest trim or overlap, in seconds. */
export const MIN_MEDIA_SECONDS = 0.1;
