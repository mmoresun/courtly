// Admin edits a court that already has bookings: existing bookings are never changed.
// New rules (price, hours, active) apply only to new bookings. Through the real HTTP API.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db";
import { createCourt, createUser, insertBookingRow, useTestDatabase } from "../test/db";
import { api, tokenFor, useTestServer } from "../test/http";

useTestDatabase();
useTestServer();

const DAY = "2030-06-15"; // Lisbon is UTC+1 then: 21:00Z = 22:00 local

async function setup() {
  const admin = tokenFor(await createUser("admin"), "admin");
  const userId = await createUser();
  const court = await createCourt({ name: "Padel", hourlyPriceCents: 2000, opensAt: "08:00", closesAt: "23:00" });
  const { isActive, name, sport, hourlyPriceCents, opensAt, closesAt } = court;
  return { admin, userId, user: tokenFor(userId), court, body: { name, sport, hourlyPriceCents, opensAt, closesAt, isActive } };
}

describe("changing a court never changes existing bookings", () => {
  test("new price: an existing booking keeps its price, the day's revenue doesn't move; new bookings use the new price", async () => {
    const { admin, user, court, body } = await setup();
    await api("POST", "/bookings", { token: user, body: { courtId: court.id, date: DAY, startHour: 10, hours: 2 } });
    const revenue = async () => (await api("GET", `/admin/bookings?date=${DAY}`, { token: admin })).body.totalRevenueCents;
    assert.equal(await revenue(), 4000);

    assert.equal((await api("PUT", `/admin/courts/${court.id}`, { token: admin, body: { ...body, hourlyPriceCents: 9900 } })).status, 200);

    assert.equal(await revenue(), 4000);
    const next = await api("POST", "/bookings", { token: user, body: { courtId: court.id, date: DAY, startHour: 14, hours: 1 } });
    assert.equal(next.body.totalPriceCents, 9900);
  });

  test("shorter opening hours: allowed; a booking now outside them stays valid, new ones follow the new hours", async () => {
    const { admin, userId, user, court, body } = await setup();
    const late = await insertBookingRow({ courtId: court.id, userId, startAt: `${DAY}T21:00Z`, endAt: `${DAY}T22:00Z` }); // 22:00 local

    assert.equal((await api("PUT", `/admin/courts/${court.id}`, { token: admin, body: { ...body, closesAt: "20:00" } })).status, 200);

    const { rows } = await pool.query("SELECT status FROM bookings WHERE id = $1", [late]);
    assert.equal(rows[0].status, "confirmed");
    const day = await api("GET", `/admin/bookings?date=${DAY}`, { token: admin });
    assert.deepEqual(day.body.bookings.map((b: { id: number }) => b.id), [late]);
    // new bookings: 20:00 is now after closing
    const res = await api("POST", "/bookings", { token: user, body: { courtId: court.id, date: DAY, startHour: 20, hours: 1 } });
    assert.equal(res.status, 400);
  });

  test("deactivated court: no new bookings or availability (404), but the player still sees an upcoming booking and can cancel it", async () => {
    const { admin, userId, user, court, body } = await setup();
    const id = await insertBookingRow({ courtId: court.id, userId, startAt: `${DAY}T09:00Z`, endAt: `${DAY}T10:00Z` });

    assert.equal((await api("PUT", `/admin/courts/${court.id}`, { token: admin, body: { ...body, isActive: false } })).status, 200);

    assert.equal((await api("GET", `/courts/${court.id}/availability?date=${DAY}`, { token: user })).status, 404);
    assert.equal((await api("POST", "/bookings", { token: user, body: { courtId: court.id, date: DAY, startHour: 14, hours: 1 } })).status, 404);
    const mine = await api("GET", "/bookings", { token: user });
    assert.deepEqual(mine.body.upcoming.map((b: { id: number }) => b.id), [id]);
    assert.equal((await api("POST", `/bookings/${id}/cancel`, { token: user })).status, 200);
  });

  test("reactivating brings the court back", async () => {
    const { admin, user, court, body } = await setup();
    await api("PUT", `/admin/courts/${court.id}`, { token: admin, body: { ...body, isActive: false } });
    await api("PUT", `/admin/courts/${court.id}`, { token: admin, body: { ...body, isActive: true } });
    assert.equal((await api("GET", `/courts/${court.id}/availability?date=${DAY}`, { token: user })).status, 200);
  });
});

describe("admin input is validated by our code, before any database CHECK", () => {
  test("bad court fields get a specific 400 in the words of the form, never the generic 'Invalid data'", async () => {
    const { admin, court, body } = await setup();
    const cases: [Record<string, unknown>, RegExp][] = [
      [{ ...body, name: "  " }, /^Name is required$/],
      [{ ...body, hourlyPriceCents: 0 }, /^Price must be a positive amount$/],
      [{ ...body, hourlyPriceCents: -100 }, /^Price must be a positive amount$/],
      [{ ...body, opensAt: "08:30" }, /^Opening time must be a whole hour, like 08:00$/],
    ];
    for (const [bad, message] of cases) {
      for (const res of [
        await api("POST", "/admin/courts", { token: admin, body: bad }),
        await api("PUT", `/admin/courts/${court.id}`, { token: admin, body: bad }),
      ]) {
        assert.equal(res.status, 400, JSON.stringify(bad));
        assert.match(res.body.error, message);
      }
    }
  });
});

describe("courts open past midnight", () => {
  test("the database accepts a court open 20:00–02:00 and one open around the clock", async () => {
    const { admin, body } = await setup();
    for (const hours of [{ opensAt: "20:00", closesAt: "02:00" }, { opensAt: "00:00", closesAt: "00:00" }]) {
      const res = await api("POST", "/admin/courts", { token: admin, body: { ...body, ...hours } });
      assert.equal(res.status, 201);
      assert.equal(res.body.opensAt, hours.opensAt);
      assert.equal(res.body.closesAt, hours.closesAt);
    }
  });
});
