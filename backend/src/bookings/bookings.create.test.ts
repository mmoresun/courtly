// POST /api/bookings through the real HTTP API and a real test database.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db";
import { createCourt, createUser, insertBookingRow, useTestDatabase } from "../test/db";
import { api, tokenFor, useTestServer } from "../test/http";
import { facilityNow } from "./bookings.queries";

useTestDatabase();
useTestServer();

const DAY = "2030-06-15"; // a fixed day far in the future

async function setup(courtOverrides = {}) {
  const userId = await createUser();
  const court = await createCourt({ opensAt: "08:00", closesAt: "23:00", hourlyPriceCents: 2000, ...courtOverrides });
  return { userId, token: tokenFor(userId), courtId: court.id };
}

function book(token: string, body: Record<string, unknown>) {
  return api("POST", "/bookings", { token, body });
}

describe("REQUIRED RULE: no double bookings", () => {
  test("10 users booking the same slot at the same instant: exactly one wins, the others get 409", async () => {
    const { courtId } = await setup();
    const tokens = await Promise.all(Array.from({ length: 10 }, async () => tokenFor(await createUser())));

    // All requests are started before any is awaited, so they hit the server together.
    const results = await Promise.all(tokens.map((token) => book(token, { courtId, date: DAY, startHour: 18, hours: 1 })));

    const statuses = results.map((r) => r.status).sort();
    assert.deepEqual(statuses, [201, ...Array(9).fill(409)]);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM bookings WHERE status = 'confirmed'");
    assert.equal(rows[0].n, 1);
  });

  test("the 409 message is clear", async () => {
    const { courtId, token } = await setup();
    await book(token, { courtId, date: DAY, startHour: 18, hours: 1 });
    const res = await book(token, { courtId, date: DAY, startHour: 18, hours: 1 });
    assert.deepEqual(res, { status: 409, body: { error: "This court is already booked for that time" } });
  });

  test("a 2-hour booking is rejected when only its second hour is taken", async () => {
    const { courtId, token } = await setup();
    assert.equal((await book(token, { courtId, date: DAY, startHour: 19, hours: 1 })).status, 201);
    assert.equal((await book(token, { courtId, date: DAY, startHour: 18, hours: 2 })).status, 409);
  });

  test("back-to-back bookings are fine: 18–19 and 19–20 don't overlap", async () => {
    const { courtId, token } = await setup();
    assert.equal((await book(token, { courtId, date: DAY, startHour: 18, hours: 1 })).status, 201);
    assert.equal((await book(token, { courtId, date: DAY, startHour: 19, hours: 1 })).status, 201);
  });

  test("the same slot on another court is fine", async () => {
    const { courtId, token, userId } = await setup();
    const other = await createCourt({ name: "Other" });
    assert.equal((await book(token, { courtId, date: DAY, startHour: 18, hours: 1 })).status, 201);
    assert.equal((await book(tokenFor(userId), { courtId: other.id, date: DAY, startHour: 18, hours: 1 })).status, 201);
  });

  test("a cancelled booking doesn't block its slot", async () => {
    const { courtId, token, userId } = await setup();
    await insertBookingRow({ courtId, userId, startAt: `${DAY}T17:00Z`, endAt: `${DAY}T18:00Z`, status: "cancelled" }); // 18:00 Lisbon (summer)
    assert.equal((await book(token, { courtId, date: DAY, startHour: 18, hours: 1 })).status, 201);
  });
});

describe("REQUIRED RULE: opening hours — booking", () => {
  test("a slot before opening is rejected", async () => {
    const { courtId, token } = await setup();
    const res = await book(token, { courtId, date: DAY, startHour: 7, hours: 1 });
    assert.deepEqual(res, { status: 400, body: { error: "The booking must fit within opening hours (08:00–23:00)" } });
  });

  test("the last slot 22:00 can be booked for 1 hour, but not for 2 (would end at 24:00)", async () => {
    const { courtId, token } = await setup();
    assert.equal((await book(token, { courtId, date: DAY, startHour: 22, hours: 2 })).status, 400);
    assert.equal((await book(token, { courtId, date: DAY, startHour: 22, hours: 1 })).status, 201);
  });

  test("a 2-hour booking ending exactly at closing is fine (21:00–23:00)", async () => {
    const { courtId, token } = await setup();
    assert.equal((await book(token, { courtId, date: DAY, startHour: 21, hours: 2 })).status, 201);
  });

  test("court open 20:00–02:00: 23:00 for 2 hours runs past midnight and takes 00:00 of the next day", async () => {
    const { courtId, token } = await setup({ opensAt: "20:00", closesAt: "02:00" });
    const res = await book(token, { courtId, date: DAY, startHour: 23, hours: 2 });
    assert.equal(res.status, 201);
    assert.equal(res.body.totalPriceCents, 4000);

    const nextDay = await api("GET", `/courts/${courtId}/availability?date=2030-06-16`, { token });
    assert.equal(nextDay.body.slots.find((s: { hour: number }) => s.hour === 0).status, "taken");
    // ...so a booking for 00:00 that night collides with it
    assert.equal((await book(token, { courtId, date: "2030-06-16", startHour: 0, hours: 1 })).status, 409);
  });

  test("court open 20:00–02:00: 01:00 for 2 hours is rejected (02:00 is closed), and so is 19:00", async () => {
    const { courtId, token } = await setup({ opensAt: "20:00", closesAt: "02:00" });
    const res = await book(token, { courtId, date: DAY, startHour: 1, hours: 2 });
    assert.deepEqual(res, { status: 400, body: { error: "The booking must fit within opening hours (20:00–02:00)" } });
    assert.equal((await book(token, { courtId, date: DAY, startHour: 19, hours: 1 })).status, 400);
    assert.equal((await book(token, { courtId, date: DAY, startHour: 1, hours: 1 })).status, 201);
  });
});

describe("no bookings in the past — the same rule as availability", () => {
  test("yesterday is rejected", async () => {
    const { courtId, token } = await setup({ opensAt: "00:00" });
    const now = await facilityNow();
    const yesterday = new Date(Date.parse(`${now.date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    const res = await book(token, { courtId, date: yesterday, startHour: 10, hours: 1 });
    assert.deepEqual(res, { status: 400, body: { error: "This time slot has already started or is in the past" } });
  });

  test("today: the API accepts a slot exactly when availability shows it as available", async () => {
    const { courtId, token } = await setup({ opensAt: "00:00", closesAt: "23:00" });
    const { date } = await facilityNow();
    const { body } = await api("GET", `/courts/${courtId}/availability?date=${date}`, { token });

    for (const slot of body.slots as { hour: number; status: string }[]) {
      const res = await book(token, { courtId, date, startHour: slot.hour, hours: 1 });
      assert.equal(res.status, slot.status === "available" ? 201 : 400, `slot ${slot.hour}: ${slot.status}`);
    }
  });
});

describe("the server decides who and how much", () => {
  test("the owner comes from the token: userId in the body is ignored", async () => {
    const { courtId, token, userId } = await setup();
    const someoneElse = await createUser();
    const res = await book(token, { courtId, date: DAY, startHour: 18, hours: 1, userId: someoneElse });
    assert.equal(res.status, 201);
    assert.equal(res.body.userId, userId);
    const { rows } = await pool.query("SELECT user_id FROM bookings WHERE id = $1", [res.body.id]);
    assert.equal(rows[0].user_id, userId);
  });

  test("the price is court price × hours: a price in the body is ignored", async () => {
    const { courtId, token } = await setup({ hourlyPriceCents: 2400 });
    const res = await book(token, { courtId, date: DAY, startHour: 18, hours: 2, totalPriceCents: 1 });
    assert.equal(res.body.totalPriceCents, 4800);
  });

  test("the booking comes back in facility-local terms, plus the exact start moment", async () => {
    const { courtId, token, userId } = await setup();
    const res = await book(token, { courtId, date: DAY, startHour: 18, hours: 2 });
    assert.deepEqual(res.body, {
      id: res.body.id, courtId, userId, date: DAY, startHour: 18, hours: 2, status: "confirmed", totalPriceCents: 4000,
      startAt: "2030-06-15T17:00:00.000Z", // 18:00 in Lisbon summer time (UTC+1)
    });
  });
});

describe("bad requests", () => {
  test("an inactive court answers 404, like a missing one (it isn't in the list either)", async () => {
    const { courtId, token } = await setup({ isActive: false });
    assert.equal((await book(token, { courtId, date: DAY, startHour: 18, hours: 1 })).status, 404);
    assert.equal((await book(token, { courtId: 999, date: DAY, startHour: 18, hours: 1 })).status, 404);
  });

  test("3 hours, a fractional hour or a missing date → 400", async () => {
    const { courtId, token } = await setup();
    assert.equal((await book(token, { courtId, date: DAY, startHour: 18, hours: 3 })).status, 400);
    assert.equal((await book(token, { courtId, date: DAY, startHour: 18.5, hours: 1 })).status, 400);
    assert.equal((await book(token, { courtId, startHour: 18, hours: 1 })).status, 400);
  });

  test("dates are checked by our validation, never left for Postgres to reject (that would be a 500)", async () => {
    const { courtId, token } = await setup();
    for (const date of ["2026-02-30", "tomorrow"]) {
      assert.equal((await book(token, { courtId, date, startHour: 18, hours: 1 })).status, 400, date);
      assert.equal((await api("GET", `/courts/${courtId}/availability?date=${date}`, { token })).status, 400, date);
    }
  });

  test("no token → 401", async () => {
    assert.equal((await api("POST", "/bookings", { body: {} })).status, 401);
  });
});
