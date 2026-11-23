import { test } from "node:test";
import assert from "node:assert/strict";
import { createCourt, createUser, insertBookingRow, useTestDatabase } from "../test/db";
import { takenHours } from "./bookings.queries";

useTestDatabase();

// In November Lisbon time equals UTC, so these instants read as local times too.
test("taken hours: a 2-hour booking takes both hours; cancelled, other courts and other days don't count", async () => {
  const userId = await createUser();
  const court = await createCourt();
  const otherCourt = await createCourt({ name: "Other" });

  await insertBookingRow({ courtId: court.id, userId, startAt: "2026-11-25T18:00Z", endAt: "2026-11-25T20:00Z" });
  await insertBookingRow({ courtId: court.id, userId, startAt: "2026-11-25T10:00Z", endAt: "2026-11-25T11:00Z", status: "cancelled" });
  await insertBookingRow({ courtId: otherCourt.id, userId, startAt: "2026-11-25T12:00Z", endAt: "2026-11-25T13:00Z" });
  await insertBookingRow({ courtId: court.id, userId, startAt: "2026-11-26T12:00Z", endAt: "2026-11-26T13:00Z" });

  assert.deepEqual(await takenHours(court.id, "2026-11-25"), [18, 19]);
});

test("taken hours are facility-local: in summer Lisbon is UTC+1", async () => {
  const userId = await createUser();
  const court = await createCourt();
  // 09:00 UTC on July 10 is 10:00 in Lisbon
  await insertBookingRow({ courtId: court.id, userId, startAt: "2027-07-10T09:00Z", endAt: "2027-07-10T10:00Z" });

  assert.deepEqual(await takenHours(court.id, "2027-07-10"), [10]);
});
