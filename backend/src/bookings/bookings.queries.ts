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
