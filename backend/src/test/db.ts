// Helpers for tests that touch the database.
import { after, beforeEach } from "node:test";
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
