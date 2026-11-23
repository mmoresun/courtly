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

export interface BookingRequest {
  courtId: number;
  date: string; // facility-local "YYYY-MM-DD"
  startHour: number; // facility-local hour, 0–23
  hours: 1 | 2;
}

/** Body of POST /api/bookings. Anything else in the body (e.g. userId, price) is ignored. */
export function parseBookingRequest(body: unknown): BookingRequest {
  const b = (body ?? {}) as Record<string, unknown>;

  const { courtId, startHour, hours } = b;
  if (typeof courtId !== "number" || !Number.isSafeInteger(courtId) || courtId < 1) {
    throw new HttpError(400, "courtId must be a positive integer");
  }
  const date = parseDate(b.date);
  if (typeof startHour !== "number" || !Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    throw new HttpError(400, "startHour must be a whole hour from 0 to 23");
  }
  if (hours !== 1 && hours !== 2) throw new HttpError(400, "hours must be 1 or 2");

  return { courtId, date, startHour, hours };
}
