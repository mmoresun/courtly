import { pool } from "../db";
import type { CourtInput } from "./courts.validation";

export interface Court extends CourtInput {
  id: number;
}

const COURT_COLUMNS = `
  id, name, sport,
  hourly_price_cents AS "hourlyPriceCents",
  to_char(opens_at, 'HH24:MI') AS "opensAt",
  to_char(closes_at, 'HH24:MI') AS "closesAt",
  is_active AS "isActive"`;

export async function listCourts({ includeInactive }: { includeInactive: boolean }): Promise<Court[]> {
  const { rows } = await pool.query<Court>(
    `SELECT ${COURT_COLUMNS} FROM courts WHERE is_active OR $1 ORDER BY id`,
    [includeInactive],
  );
  return rows;
}

export async function findCourt(id: number): Promise<Court | undefined> {
  const { rows } = await pool.query<Court>(`SELECT ${COURT_COLUMNS} FROM courts WHERE id = $1`, [id]);
  return rows[0];
}

export async function insertCourt(c: CourtInput): Promise<Court> {
  const { rows } = await pool.query<Court>(
    `INSERT INTO courts (name, sport, hourly_price_cents, opens_at, closes_at, is_active)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COURT_COLUMNS}`,
    [c.name, c.sport, c.hourlyPriceCents, c.opensAt, c.closesAt, c.isActive],
  );
  return rows[0]!;
}

/** Returns undefined when the court doesn't exist. */
export async function updateCourt(id: number, c: CourtInput): Promise<Court | undefined> {
  const { rows } = await pool.query<Court>(
    `UPDATE courts
     SET name = $2, sport = $3, hourly_price_cents = $4, opens_at = $5, closes_at = $6, is_active = $7
     WHERE id = $1
     RETURNING ${COURT_COLUMNS}`,
    [id, c.name, c.sport, c.hourlyPriceCents, c.opensAt, c.closesAt, c.isActive],
  );
  return rows[0];
}
