import { HttpError } from "../errors";

export interface CourtInput {
  name: string;
  sport: string;
  hourlyPriceCents: number;
  opensAt: string; // "HH:00", facility local time
  closesAt: string;
  isActive: boolean;
}

// Slots are 1 hour long, so opening hours must be whole hours: "00:00" … "23:00".
const WHOLE_HOUR = /^([01]\d|2[0-3]):00$/;

/** Validates a full court (used by both create and PUT). Throws 400 on the first bad field. */
export function parseCourtInput(body: unknown): CourtInput {
  const b = (body ?? {}) as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) throw bad("name is required");

  const sport = typeof b.sport === "string" ? b.sport.trim().toLowerCase() : "";
  if (!sport) throw bad("sport is required");

  const price = b.hourlyPriceCents;
  if (typeof price !== "number" || !Number.isInteger(price) || price <= 0) {
    throw bad("hourlyPriceCents must be a positive integer (price in cents)");
  }

  const { opensAt, closesAt } = b;
  if (typeof opensAt !== "string" || !WHOLE_HOUR.test(opensAt)) {
    throw bad('opensAt must be a whole hour like "08:00"');
  }
  if (typeof closesAt !== "string" || !WHOLE_HOUR.test(closesAt)) {
    throw bad('closesAt must be a whole hour like "23:00"');
  }
  // Same "HH:00" format, so string comparison is time comparison.
  if (opensAt >= closesAt) throw bad("opensAt must be earlier than closesAt");

  if (typeof b.isActive !== "boolean") throw bad("isActive must be true or false");

  return { name, sport, hourlyPriceCents: price, opensAt, closesAt, isActive: b.isActive };
}

function bad(message: string): HttpError {
  return new HttpError(400, message);
}
