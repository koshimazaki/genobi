import type { ErrorRequestHandler } from "express";
import { AppError } from "./errors";

/**
 * The local server's last handler: an `AppError` answers its own status,
 * message and code; anything else is a fixed sentence, so a provider error or
 * a credential never reaches a response.
 */
export const jsonErrors: ErrorRequestHandler = (
  error,
  _request,
  response,
  next,
) => {
  if (response.headersSent) return next(error);
  if (error instanceof AppError)
    return void response
      .status(error.status)
      .json({ ...error.details, error: error.message, code: error.code });
  if (error?.type === "entity.too.large")
    return void response
      .status(413)
      .json({ error: "The upload is too large." });
  if (error instanceof SyntaxError)
    return void response
      .status(400)
      .json({ error: "The request was not valid JSON." });
  // Keep provider errors and credentials private.
  response
    .status(500)
    .json({ error: "The local server could not complete this request." });
};
