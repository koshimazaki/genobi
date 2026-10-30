/**
 * Every API route has a ceiling, and the numbers live here so the two backends
 * cannot drift: the Worker counts in D1 (shared across isolates), the local
 * Express server counts in one in-memory map.
 *
 * These protect this studio's own Cloudflare and upstream quota. They are not a
 * spending control: generation is always paid for with the visitor's own BFL
 * key, which the per-request balance check covers separately.
 */
export const RATE_WINDOW_MS = 60_000;

/** Requests per window, per browser session unless noted. */
export const RATE_LIMITS = {
  /** POST /api/jobs and /api/uploads: paid work, so the tightest ceiling. */
  submit: 8,
  /** The same writes counted per client IP, bounding one visitor's many sessions. */
  submitPerIp: 20,
  /** GET /api/credits: one upstream BFL call each. */
  credits: 20,
  /** GET /api/jobs/:id: the studio polls every 4s for each unfinished job. */
  poll: 120,
  /** GET /api/history (one D1 read pair) and GET /api/takes/:id (one read). */
  history: 60,
  /** Optional local activity must not consume job-history or paid-work quota. */
  activity: 360,
  /** Pairing by hashed IP; authenticated outbound runner heartbeats by pair. */
  runnerPair: 10,
  runnerPoll: 120,
  /**
   * Local project copy writes (`/api/projects`): debounced pushes, their
   * files and Director commands. Nothing paid, so looser than `submit`.
   */
  edit: 240,
  /** Media reads. Players issue many small Range requests, so this stays loose. */
  media: 600,
} as const;

export type RateBucket = keyof typeof RATE_LIMITS;

/**
 * The local server's ceilings where they differ from the hosted ones. Its
 * reads (history, settings, chains, voice and project status) are memory
 * reads on the owner's own machine, and one page load makes about twenty of
 * them, so the hosted 60, sized for D1 reads, ran out after a few reloads
 * (a Vite dependency reload, a refresh) and failed every panel for a minute.
 * The ceiling still stops a runaway loop. Paid and upstream buckets are
 * unchanged.
 */
export const LOCAL_RATE_LIMITS: Partial<Record<RateBucket, number>> = {
  history: 600,
};
export const localRateLimit = (bucket: RateBucket) =>
  LOCAL_RATE_LIMITS[bucket] ?? RATE_LIMITS[bucket];

export const RATE_LIMIT_MESSAGE = "Please wait a moment before trying again.";
