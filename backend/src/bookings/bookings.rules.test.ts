import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { daySlots, firstBookableHour, isOpenHour } from "./bookings.rules";

/** "8 9x 10p" — hours; x = taken, p = past */
function slots(takenHours: number[], first = 0): string {
  return daySlots({ opensHour: 8, closesHour: 12, takenHours, firstBookableHour: first })
    .map((s) => `${s.hour}${{ available: "", taken: "x", past: "p" }[s.status]}`)
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

  test("a court open past midnight, 20:00–02:00: the day's slots are 0, 1 and 20–23, in clock order", () => {
    const hours = daySlots({ opensHour: 20, closesHour: 2, takenHours: [], firstBookableHour: 0 }).map((s) => s.hour);
    assert.deepEqual(hours, [0, 1, 20, 21, 22, 23]);
  });

  test("a court open around the clock, 00:00–00:00, has 24 slots", () => {
    assert.equal(daySlots({ opensHour: 0, closesHour: 0, takenHours: [], firstBookableHour: 0 }).length, 24);
  });

  test("isOpenHour: closing is exclusive, both for day and for overnight courts", () => {
    assert.equal(isOpenHour(22, 8, 23), true);
    assert.equal(isOpenHour(23, 8, 23), false);
    assert.equal(isOpenHour(1, 20, 2), true);
    assert.equal(isOpenHour(2, 20, 2), false);
    assert.equal(isOpenHour(19, 20, 2), false);
  });
});

describe("availability", () => {
  test("booked hours are taken", () => {
    assert.equal(slots([9, 10]), "8 9x 10x 11");
  });

  test("hours before the first bookable hour are past", () => {
    assert.equal(slots([], 10), "8p 9p 10 11");
    assert.equal(slots([], 24), "8p 9p 10p 11p");
  });

  test("a booked hour stays taken after it has started", () => {
    assert.equal(slots([9], 10), "8p 9x 10 11");
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
