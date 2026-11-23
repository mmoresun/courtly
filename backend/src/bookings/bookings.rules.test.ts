import { test } from "node:test";
import assert from "node:assert/strict";
import { daySlots, firstBookableHour } from "./bookings.rules";

/** "8 9x 10" — hours, x = unavailable */
function slots(takenHours: number[], first = 0): string {
  return daySlots({ opensHour: 8, closesHour: 12, takenHours, firstBookableHour: first })
    .map((s) => `${s.hour}${s.available ? "" : "x"}`)
    .join(" ");
}

test("slots cover exactly the opening hours: 08–12 gives 8, 9, 10, 11", () => {
  assert.equal(slots([]), "8 9 10 11");
});

test("taken hours are unavailable", () => {
  assert.equal(slots([9, 10]), "8 9x 10x 11");
});

test("hours before the first bookable hour are unavailable", () => {
  assert.equal(slots([], 10), "8x 9x 10 11");
  assert.equal(slots([], 24), "8x 9x 10x 11x");
});

test("first bookable hour: past day → none, future day → all", () => {
  const now = { date: "2026-11-24", hour: 14 };
  assert.equal(firstBookableHour("2026-11-23", now), 24);
  assert.equal(firstBookableHour("2026-11-25", now), 0);
});

test("today: a slot that has started can't be booked — at 14:00 and 14:59 the first is 15", () => {
  // now.hour is the hour rounded down, so 14:00 and 14:59 are the same input
  assert.equal(firstBookableHour("2026-11-24", { date: "2026-11-24", hour: 14 }), 15);
});

test("today late evening: after 23:00 nothing is left", () => {
  assert.equal(firstBookableHour("2026-11-24", { date: "2026-11-24", hour: 23 }), 24);
});
