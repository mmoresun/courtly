import { HttpError } from "../errors";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" that is a real calendar date (rejects "2026-02-30"). */
export function parseDate(value: unknown): string {
  if (typeof value === "string" && DATE.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value;
  }
  throw new HttpError(400, "date must be a real date in YYYY-MM-DD format");
}
