import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { daySlots, firstBookableHour } from "./bookings.rules";

/** "8 9x 10" — hours, x = unavailable */
function slots(takenHours: number[], first = 0): string {
  return daySlots({ opensHour: 8, closesHour: 12, takenHours, firstBookableHour: first })
    .map((s) => `${s.hour}${s.available ? "" : "x"}`)
    .join(" ");
}

describe("REQUIRED RULE: opening hours — availability", () => {
  test("a court open 08:00–23:00 has exactly 15 slots, 8 through 22; 23 is not a slot", () => {
    const hours = daySlots({ opensHour: 8, closesHour: 23, takenHours: [], firstBookableHour: 0 }).map((s) => s.hour);
    assert.equal(hours.length, 15);
    assert.equal(hours[0], 8);
    assert.equal(hours.at(-1), 22); // 22:00–23:00 is the last slot
    assert.ok(!hours.includes(23));
  });

  test("slots cover exactly the opening hours: 08–12 gives 8, 9, 10, 11", () => {
    assert.equal(slots([]), "8 9 10 11");
  });
});

describe("availability", () => {
  test("taken hours are unavailable", () => {
    assert.equal(slots([9, 10]), "8 9x 10x 11");
  });

  test("hours before the first bookable hour are unavailable", () => {
    assert.equal(slots([], 10), "8x 9x 10 11");
    assert.equal(slots([], 24), "8x 9x 10x 11x");
  });
});

describe("no bookings in the past", () => {
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
});
