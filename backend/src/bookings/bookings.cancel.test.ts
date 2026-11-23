// Cancelling and listing bookings through the real HTTP API and a real test database.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../db";
import { createCourt, createUser, insertBookingRow, useTestDatabase } from "../test/db";
import { api, tokenFor, useTestServer } from "../test/http";
import { canCancel } from "./bookings.rules";

useTestDatabase();
useTestServer();

const HOUR = 60 * 60 * 1000;
const DAY = "2030-06-15";

/** The database clock, `hours` from now. */
async function fromNow(hours: number): Promise<Date> {
  const { rows } = await pool.query<{ now: Date }>("SELECT now()");
  return new Date(rows[0]!.now.getTime() + hours * HOUR);
}

/** A 1-hour booking starting `hours` from now, inserted directly (bypasses the create rules). */
async function bookingStartingIn(
  hours: number,
  userId: number,
  courtId: number,
  status: "confirmed" | "cancelled" = "confirmed",
): Promise<number> {
  const start = await fromNow(hours); // end is derived from the same instant: exactly 1 hour long
  return insertBookingRow({
    courtId, userId, status, startAt: start.toISOString(), endAt: new Date(start.getTime() + HOUR).toISOString(),
  });
}

async function setup() {
  const userId = await createUser();
  const court = await createCourt();
  return { userId, token: tokenFor(userId), courtId: court.id };
}

const cancel = (id: number, token: string) => api("POST", `/bookings/${id}/cancel`, { token });

describe("REQUIRED RULE: cancellation window (up to 2 hours before the start)", () => {
  const start = new Date("2030-06-15T18:00:00Z");

  test("exactly 2:00 before the start: still allowed", () => {
    assert.equal(canCancel(start, new Date(start.getTime() - 2 * HOUR)), true);
  });

  test("1 ms less than 2 hours before: rejected", () => {
    assert.equal(canCancel(start, new Date(start.getTime() - 2 * HOUR + 1)), false);
  });

  test("API: 3 hours before → cancelled", async () => {
    const { userId, token, courtId } = await setup();
    const id = await bookingStartingIn(3, userId, courtId);
    const res = await cancel(id, token);
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "cancelled");
  });

  test("API: 1 hour before → 400 with a clear message, booking stays confirmed", async () => {
    const { userId, token, courtId } = await setup();
    const id = await bookingStartingIn(1, userId, courtId);
    assert.deepEqual(await cancel(id, token), {
      status: 400,
      body: { error: "Bookings can only be cancelled up to 2 hours before they start" },
    });
    const { rows } = await pool.query("SELECT status FROM bookings WHERE id = $1", [id]);
    assert.equal(rows[0].status, "confirmed");
  });

  test("API: a booking that already happened can't be cancelled", async () => {
    const { userId, token, courtId } = await setup();
    const id = await bookingStartingIn(-5, userId, courtId);
    assert.equal((await cancel(id, token)).status, 400);
  });
});

describe("cancelling", () => {
  test("cancelling frees the slot: availability shows it again and it can be booked again", async () => {
    const { token, courtId } = await setup();
    const slot18 = async () =>
      (await api("GET", `/courts/${courtId}/availability?date=${DAY}`, { token })).body.slots.find((s: { hour: number }) => s.hour === 18);

    const { body: booking } = await api("POST", "/bookings", { token, body: { courtId, date: DAY, startHour: 18, hours: 1 } });
    assert.equal((await slot18()).available, false);

    assert.equal((await cancel(booking.id, token)).status, 200);
    assert.equal((await slot18()).available, true);

    const rebook = await api("POST", "/bookings", { token, body: { courtId, date: DAY, startHour: 18, hours: 1 } });
    assert.equal(rebook.status, 201);
    // The cancelled booking is still in the database: history is kept.
    const { rows } = await pool.query("SELECT status FROM bookings ORDER BY id");
    assert.deepEqual(rows.map((r) => r.status), ["cancelled", "confirmed"]);
  });

  test("someone else's booking answers 404, exactly like a missing one — admins included", async () => {
    const { userId, courtId } = await setup();
    const id = await bookingStartingIn(5, userId, courtId);
    const stranger = tokenFor(await createUser());
    const admin = tokenFor(await createUser("admin"), "admin");

    const missing = await cancel(999, stranger);
    assert.deepEqual(missing, { status: 404, body: { error: "Booking not found" } });
    assert.deepEqual(await cancel(id, stranger), missing);
    assert.deepEqual(await cancel(id, admin), missing);
  });

  test("cancelling twice → 409 the second time", async () => {
    const { userId, token, courtId } = await setup();
    const id = await bookingStartingIn(5, userId, courtId);
    assert.equal((await cancel(id, token)).status, 200);
    assert.deepEqual(await cancel(id, token), { status: 409, body: { error: "This booking is already cancelled" } });
  });

  test("checks run owner → status: a stranger gets 404 even for a cancelled booking", async () => {
    const { userId, token, courtId } = await setup();
    const id = await bookingStartingIn(5, userId, courtId);
    await cancel(id, token);
    assert.equal((await cancel(id, tokenFor(await createUser()))).status, 404);
  });
});

describe("my bookings (upcoming and past)", () => {
  test("only my own bookings, split by end time; a booking going on right now is upcoming", async () => {
    const { userId, token, courtId } = await setup();
    const other = await createUser();
    const past = await bookingStartingIn(-26, userId, courtId);
    const running = await bookingStartingIn(-0.5, userId, courtId); // started 30 min ago, ends in 30 min
    const later = await bookingStartingIn(30, userId, courtId);
    const cancelledLater = await bookingStartingIn(50, userId, courtId, "cancelled");
    await bookingStartingIn(10, other, courtId); // not mine

    const { status, body } = await api("GET", "/bookings", { token });
    assert.equal(status, 200);
    assert.deepEqual(body.upcoming.map((b: { id: number }) => b.id), [running, later, cancelledLater]); // soonest first
    assert.deepEqual(body.past.map((b: { id: number }) => b.id), [past]);
    assert.equal(body.upcoming[2].status, "cancelled");
    assert.equal(body.upcoming[0].courtName, "Court");
  });
});
