// Helpers for tests that touch the database.
import { after, beforeEach } from "node:test";
import { insertCourt, type Court } from "../courts/courts.queries";
import type { CourtInput } from "../courts/courts.validation";
import { pool } from "../db";
import { assertTestDatabase } from "./global-setup.mjs";

/** Call at the top of a test file: every test starts with empty tables. */
export function useTestDatabase(): void {
  assertTestDatabase(new URL(process.env.DATABASE_URL ?? ""));
  beforeEach(async () => {
    await pool.query("TRUNCATE bookings, courts, users RESTART IDENTITY CASCADE");
  });
  // Open connections would keep the test process alive.
  after(() => pool.end());
}

// --- Fixtures ---

let userCounter = 0;

export async function createUser(role: "user" | "admin" = "user"): Promise<number> {
  userCounter++;
  const { rows } = await pool.query<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, role) VALUES ($1, 'not-a-real-hash', $2, $3) RETURNING id",
    [`user${userCounter}@test.io`, `User ${userCounter}`, role],
  );
  return rows[0]!.id;
}

export function createCourt(overrides: Partial<CourtInput> = {}): Promise<Court> {
  return insertCourt({
    name: "Court",
    sport: "padel",
    hourlyPriceCents: 2000,
    opensAt: "08:00",
    closesAt: "23:00",
    isActive: true,
    ...overrides,
  });
}

/** Inserts a booking directly, bypassing business rules. Times are absolute ISO instants. */
export async function insertBookingRow(b: {
  courtId: number;
  userId: number;
  startAt: string;
  endAt: string;
  status?: "confirmed" | "cancelled";
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO bookings (court_id, user_id, start_at, end_at, status, total_price_cents)
     VALUES ($1, $2, $3, $4, $5, 1000) RETURNING id`,
    [b.courtId, b.userId, b.startAt, b.endAt, b.status ?? "confirmed"],
  );
  return rows[0]!.id;
}
