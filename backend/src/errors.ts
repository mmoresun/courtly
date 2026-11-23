import type { ErrorRequestHandler } from "express";

/** Throw from any handler; errorHandler turns it into `{ error }` with this status. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Route ids like "/courts/:id". Anything that isn't a positive integer can't exist → 404. */
export function parseIdParam(value: unknown, notFoundMessage: string): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, notFoundMessage);
  return id;
}

// The single place where errors become HTTP responses.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // The exclusion constraint bookings_no_overlap: another confirmed booking overlaps this one.
  if (err?.code === "23P01") {
    res.status(409).json({ error: "This court is already booked for that time" });
    return;
  }
  // A CHECK constraint rejected the data: the request asked for something invalid → 400.
  // But our validation should have caught it first, so log it as a bug. The constraint name
  // is an internal detail: it goes to the log, not to the client.
  if (err?.code === "23514") {
    console.error(`Validation gap: CHECK constraint "${err.constraint}" rejected data`, err);
    res.status(400).json({ error: "Invalid data" });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
