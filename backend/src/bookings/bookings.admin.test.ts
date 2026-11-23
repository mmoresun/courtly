// Admin day view through the real HTTP API and a real test database.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db";
import { createCourt, createUser, insertBookingRow, useTestDatabase } from "../test/db";
import { api, tokenFor, useTestServer } from "../test/http";

useTestDatabase();
useTestServer();

async function booking(courtId: number, userId: number, startAt: string, hours: number, price: number, status: "confirmed" | "cancelled" = "confirmed") {
  const end = new Date(Date.parse(startAt) + hours * 3_600_000).toISOString();
  const id = await insertBookingRow({ courtId, userId, startAt, endAt: end, status });
  await pool.query("UPDATE bookings SET total_price_cents = $2 WHERE id = $1", [id, price]);
  return id;
}

describe("admin day view: all bookings of a day across courts, with expected revenue", () => {
  test("all users and courts (inactive too); revenue counts confirmed bookings only", async () => {
    const admin = tokenFor(await createUser("admin"), "admin");
    const alice = await createUser();
    const bob = await createUser();
    const padel = await createCourt({ name: "Padel" });
    const old = await createCourt({ name: "Old", isActive: false });

    // June 15, 2030 in Lisbon is UTC+1: 09:00Z = 10:00 local
    const a = await booking(padel.id, alice, "2030-06-15T09:00Z", 2, 4800);
    const b = await booking(old.id, bob, "2030-06-15T09:00Z", 1, 1500);
    const c = await booking(padel.id, bob, "2030-06-15T16:00Z", 1, 2400, "cancelled");
    await booking(padel.id, alice, "2030-06-16T09:00Z", 1, 9999); // another day

    const { status, body } = await api("GET", "/admin/bookings?date=2030-06-15", { token: admin });
    assert.equal(status, 200);
    assert.deepEqual(body.bookings.map((x: { id: number }) => x.id), [b, a, c]); // by time, then court name
    assert.equal(body.totalRevenueCents, 4800 + 1500); // the cancelled 2400 is listed but not counted
    assert.equal(body.bookings[2].status, "cancelled");
    assert.equal(body.bookings[0].startHour, 10); // facility-local
    const { rows } = await pool.query("SELECT name, email FROM users WHERE id = $1", [bob]);
    assert.equal(body.bookings[0].userName, rows[0].name); // the admin sees who booked
    assert.equal(body.bookings[0].userEmail, rows[0].email);
    assert.equal(body.bookings[0].courtName, "Old");
  });

  test("the day is the facility's local day: 00:30 Lisbon belongs to that day, 23:30 Lisbon the day before doesn't", async () => {
    const admin = tokenFor(await createUser("admin"), "admin");
    const user = await createUser();
    const court = await createCourt();
    const justAfterMidnight = await booking(court.id, user, "2030-06-14T23:30Z", 1, 1000); // 00:30 on June 15 in Lisbon
    await booking(court.id, user, "2030-06-14T22:30Z", 1, 1000); // 23:30 on June 14 in Lisbon

    const { body } = await api("GET", "/admin/bookings?date=2030-06-15", { token: admin });
    assert.deepEqual(body.bookings.map((x: { id: number }) => x.id), [justAfterMidnight]);
    assert.equal(body.totalRevenueCents, 1000);
  });

  test("an empty day → no bookings and zero revenue (not null)", async () => {
    const admin = tokenFor(await createUser("admin"), "admin");
    assert.deepEqual((await api("GET", "/admin/bookings?date=2030-06-15", { token: admin })).body, {
      date: "2030-06-15",
      bookings: [],
      totalRevenueCents: 0,
    });
  });

  test("an invalid date → 400", async () => {
    const admin = tokenFor(await createUser("admin"), "admin");
    assert.equal((await api("GET", "/admin/bookings?date=2030-02-30", { token: admin })).status, 400);
  });
});
