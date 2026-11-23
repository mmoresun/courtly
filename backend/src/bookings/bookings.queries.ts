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

/**
 * Columns of a booking, with times turned into facility-local date/hour.
 * `tz` is the time zone placeholder ("$3"), `t` the table name or alias.
 */
function bookingColumns(tz: string, t = "bookings"): string {
  return `
    ${t}.id, ${t}.court_id AS "courtId", ${t}.user_id AS "userId",
    to_char(${t}.start_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS date,
    extract(hour FROM ${t}.start_at AT TIME ZONE ${tz})::int AS "startHour",
    (extract(epoch FROM ${t}.end_at - ${t}.start_at) / 3600)::int AS hours,
    ${t}.status, ${t}.total_price_cents AS "totalPriceCents"`;
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

/** What the cancel rules need, plus the database clock. */
export async function findBookingForCancel(
  id: number,
): Promise<{ userId: number; status: Booking["status"]; startAt: Date; now: Date } | undefined> {
  const { rows } = await pool.query(
    `SELECT user_id AS "userId", status, start_at AS "startAt", now() AS now FROM bookings WHERE id = $1`,
    [id],
  );
  return rows[0];
}

/**
 * Cancelling only changes the status: the row (and the history) stays.
 * Returns undefined if the booking was not confirmed any more (e.g. cancelled by a parallel request).
 */
export async function cancelBooking(id: number): Promise<Booking | undefined> {
  const { rows } = await pool.query<Booking>(
    `UPDATE bookings SET status = 'cancelled'
     WHERE id = $1 AND status = 'confirmed'
     RETURNING ${bookingColumns("$2")}`,
    [id, FACILITY_TIMEZONE],
  );
  return rows[0];
}

export interface UserBooking extends Booking {
  courtName: string;
}

/**
 * A user's bookings, split by end_at: a booking that is going on right now is still upcoming.
 * Upcoming: soonest first. Past: most recent first. Cancelled ones are included with their status.
 */
export async function listUserBookings(userId: number): Promise<{ upcoming: UserBooking[]; past: UserBooking[] }> {
  const { rows } = await pool.query<UserBooking & { isUpcoming: boolean }>(
    `SELECT ${bookingColumns("$2", "b")}, c.name AS "courtName", b.end_at > now() AS "isUpcoming"
     FROM bookings b JOIN courts c ON c.id = b.court_id
     WHERE b.user_id = $1
     ORDER BY b.start_at`,
    [userId, FACILITY_TIMEZONE],
  );
  const strip = ({ isUpcoming: _, ...booking }: UserBooking & { isUpcoming: boolean }): UserBooking => booking;
  return {
    upcoming: rows.filter((r) => r.isUpcoming).map(strip),
    past: rows.filter((r) => !r.isUpcoming).map(strip).reverse(),
  };
}
