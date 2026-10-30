export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_failed",
    /** Extra fields for the answer, such as a conflict's current revision. */
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function requireKey(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 512 ||
    /[\s\x00-\x1f]/.test(value)
  ) {
    // A malformed key is refused generically: the route's own key kind is
    // named by the caller that knows the route (`missingKeyError`), never a
    // provider this request may not even use.
    throw new AppError(400, "Enter a valid API key.", "invalid_key");
  }
  return value;
}
