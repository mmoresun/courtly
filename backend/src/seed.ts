// Demo data. Runs on every container start, but only fills an empty database.
import bcrypt from "bcryptjs";
import { FACILITY_TIMEZONE } from "./config";
import { pool } from "./db";

const PASSWORD = "courtly123";

const USERS = [
  { email: "alice@courtly.test", name: "Alice", role: "user" },
  { email: "bob@courtly.test", name: "Bob", role: "user" },
  { email: "admin@courtly.test", name: "Admin", role: "admin" },
];

const COURTS = [
  { name: "Padel 1", sport: "padel", priceCents: 2400, opensAt: "08:00", closesAt: "23:00", isActive: true },
  { name: "Padel 2", sport: "padel", priceCents: 2400, opensAt: "08:00", closesAt: "23:00", isActive: true },
  { name: "Tennis Center", sport: "tennis", priceCents: 1800, opensAt: "07:00", closesAt: "22:00", isActive: true },
  // Deactivated court that keeps its booking history.
  { name: "Old Tennis", sport: "tennis", priceCents: 1500, opensAt: "08:00", closesAt: "22:00", isActive: false },
];

// day: offset from the facility's local "today"; hour: local start hour.
const BOOKINGS = [
  { email: "alice@courtly.test", court: "Old Tennis", day: -7, hour: 9, hours: 1, status: "confirmed" },
  { email: "alice@courtly.test", court: "Padel 1", day: -3, hour: 10, hours: 1, status: "confirmed" },
  { email: "bob@courtly.test", court: "Tennis Center", day: -1, hour: 18, hours: 2, status: "confirmed" },
  { email: "alice@courtly.test", court: "Padel 1", day: 0, hour: 20, hours: 1, status: "confirmed" },
  { email: "bob@courtly.test", court: "Padel 2", day: 0, hour: 19, hours: 2, status: "confirmed" },
  // Bob cancelled, then Alice took the same slot: cancelled bookings don't block.
  { email: "bob@courtly.test", court: "Padel 1", day: 1, hour: 18, hours: 1, status: "cancelled" },
  { email: "alice@courtly.test", court: "Padel 1", day: 1, hour: 18, hours: 2, status: "confirmed" },
  { email: "bob@courtly.test", court: "Tennis Center", day: 2, hour: 9, hours: 1, status: "confirmed" },
];

async function seed(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rowCount } = await client.query("SELECT 1 FROM users LIMIT 1");
    if (rowCount) {
      console.log("Seed: database is not empty, skipping");
      await client.query("ROLLBACK");
      return;
    }

    const hash = await bcrypt.hash(PASSWORD, 10);
    for (const u of USERS) {
      await client.query(
        "INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4)",
        [u.email, hash, u.name, u.role],
      );
    }

    for (const c of COURTS) {
      await client.query(
        `INSERT INTO courts (name, sport, hourly_price_cents, opens_at, closes_at, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [c.name, c.sport, c.priceCents, c.opensAt, c.closesAt, c.isActive],
      );
    }

    for (const b of BOOKINGS) {
      // local date + local time, interpreted in the facility time zone → absolute instant
      await client.query(
        `INSERT INTO bookings (court_id, user_id, start_at, end_at, status, total_price_cents)
         SELECT c.id, u.id, s.start_at, s.start_at + make_interval(hours => $5::int),
                $6, c.hourly_price_cents * $5::int
         FROM courts c, users u,
              LATERAL (SELECT ((now() AT TIME ZONE $7)::date + $3::int + make_time($4, 0, 0))
                              AT TIME ZONE $7 AS start_at) s
         WHERE c.name = $2 AND u.email = $1`,
        [b.email, b.court, b.day, b.hour, b.hours, b.status, FACILITY_TIMEZONE],
      );
    }

    await client.query("COMMIT");
    console.log(`Seed: ${USERS.length} users, ${COURTS.length} courts, ${BOOKINGS.length} bookings`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
