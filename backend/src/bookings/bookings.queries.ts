import { FACILITY_TIMEZONE } from "../config";
import { pool } from "../db";
import type { LocalNow } from "./bookings.rules";

/** Current facility-local date and hour, computed by Postgres. */
export async function facilityNow(): Promise<LocalNow> {
  const { rows } = await pool.query<LocalNow>(
    `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS date,
            extract(hour FROM now() AT TIME ZONE $1)::int AS hour`,
    [FACILITY_TIMEZONE],
  );
  return rows[0]!;
}

/**
 * Local hours of `date` (facility time) covered by confirmed bookings of a court.
 * A 2-hour booking 18:00–20:00 gives [18, 19]. Cancelled bookings don't count.
 */
export async function takenHours(courtId: number, date: string): Promise<number[]> {
  const { rows } = await pool.query<{ hour: number }>(
    `SELECT DISTINCT extract(hour FROM h AT TIME ZONE $3)::int AS hour
     FROM bookings b,
          generate_series(b.start_at, b.end_at - interval '1 hour', interval '1 hour') AS h
     WHERE b.court_id = $1
       AND b.status = 'confirmed'
       -- bookings overlapping the local day (lets Postgres use the start_at index)...
       AND b.start_at < (($2::date + 1)::timestamp AT TIME ZONE $3)
       AND b.end_at > ($2::date::timestamp AT TIME ZONE $3)
       -- ...and only their hours that fall on that day
       AND (h AT TIME ZONE $3)::date = $2::date
     ORDER BY hour`,
    [courtId, date, FACILITY_TIMEZONE],
  );
  return rows.map((r) => r.hour);
}

export interface Booking {
  id: number;
  courtId: number;
  userId: number;
  date: string; // facility-local
  startHour: number; // facility-local
  hours: number;
  status: "confirmed" | "cancelled";
  totalPriceCents: number;
}

/** Columns of a booking, with times turned into facility-local date/hour. $tz is the time zone param. */
function bookingColumns(tz: string): string {
  return `
    id, court_id AS "courtId", user_id AS "userId",
    to_char(start_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
    extract(hour FROM start_at AT TIME ZONE ${tz})::int AS "startHour",
    (extract(epoch FROM end_at - start_at) / 3600)::int AS hours,
    status, total_price_cents AS "totalPriceCents"`;
}

/**
 * Inserts a confirmed booking. If it overlaps another confirmed booking of the same court,
 * the exclusion constraint makes Postgres throw 23P01 (turned into 409 by errorHandler).
 * end_at = start_at + N real hours (not "local end time"), so a booking on a day when clocks
 * change still lasts exactly N hours.
 */
export async function insertBooking(b: {
  courtId: number;
  userId: number;
  date: string;
  startHour: number;
  hours: number;
  totalPriceCents: number;
}): Promise<Booking> {
  const { rows } = await pool.query<Booking>(
    `INSERT INTO bookings (court_id, user_id, start_at, end_at, total_price_cents)
     SELECT $1, $2, s.start_at, s.start_at + make_interval(hours => $5), $6
     FROM (SELECT ($3::date + make_time($4, 0, 0)) AT TIME ZONE $7 AS start_at) AS s
     RETURNING ${bookingColumns("$7")}`,
    [b.courtId, b.userId, b.date, b.startHour, b.hours, b.totalPriceCents, FACILITY_TIMEZONE],
  );
  return rows[0]!;
}
