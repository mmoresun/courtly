import { test } from "node:test";
import assert from "node:assert/strict";
import { daySlots, type LocalNow } from "./bookings.rules";

const now: LocalNow = { date: "2026-11-24", hour: 9 }; // it's 09:xx on Nov 24 at the facility
const tomorrow = "2026-11-25";

function statuses(date: string, takenHours: number[] = []) {
  return daySlots({ date, opensHour: 8, closesHour: 12, takenHours, now }).map((s) => `${s.hour}:${s.status}`);
}

test("slots cover exactly the opening hours: 08–12 gives 8, 9, 10, 11", () => {
  assert.deepEqual(statuses(tomorrow), ["8:available", "9:available", "10:available", "11:available"]);
});

test("hours covered by bookings are taken", () => {
  assert.deepEqual(statuses(tomorrow, [9, 10]), ["8:available", "9:taken", "10:taken", "11:available"]);
});

test("today: slots that already started are past", () => {
  // 09:xx now → the 09:00 slot has started, 10:00 hasn't
  assert.deepEqual(statuses("2026-11-24"), ["8:past", "9:past", "10:available", "11:available"]);
});

test("a past day is all past, even where it was booked", () => {
  assert.deepEqual(statuses("2026-11-23", [10]), ["8:past", "9:past", "10:past", "11:past"]);
});
