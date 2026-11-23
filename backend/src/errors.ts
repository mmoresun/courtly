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
  // A CHECK constraint rejected the data: the request asked for something invalid → client error.
  if (err?.code === "23514") {
    res.status(400).json({ error: `Invalid data (rule ${err.constraint} violated)` });
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON body" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
