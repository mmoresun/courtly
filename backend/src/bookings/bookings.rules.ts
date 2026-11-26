// Booking business rules in one place.
// Pure functions over facility-local dates and whole hours: no database, no clock, no time zones.
// "now" is passed in, and Postgres does every time-zone conversion (see bookings.queries.ts).

/** Facility-local current time, rounded down to the hour. `date` is "YYYY-MM-DD". */
export interface LocalNow {
  date: string;
  hour: number;
}

export interface Slot {
  hour: number; // local start hour: 8 means 08:00–09:00
  status: SlotStatus;
}

/** taken = a confirmed booking covers it; past = it has already started. A taken slot stays "taken" after it starts. */
export type SlotStatus = "available" | "taken" | "past";

/** "08:00" → 8 */
export function hourOf(time: string): number {
  return Number(time.slice(0, 2));
}

/**
 * Earliest local hour of `date` that can still be booked.
 * A slot that has already started can't be booked: at 14:00 and at 14:59 alike, the first one is 15.
 * "YYYY-MM-DD" strings compare like dates.
 */
export function firstBookableHour(date: string, now: LocalNow): number {
  if (date < now.date) return 24; // past day: nothing
  if (date > now.date) return 0; // future day: everything
  return now.hour + 1;
}

/**
 * Is the court open during the hour starting at `hour` (0–23)?
 * 08–23: open 8 through 22. 20–02 (closes after midnight): open 20–23 and 0–1. 00–00: always open.
 * The one place that knows about opening hours: slots and booking checks both use it.
 */
export function isOpenHour(hour: number, opensHour: number, closesHour: number): boolean {
  if (opensHour < closesHour) return hour >= opensHour && hour < closesHour;
  return hour >= opensHour || hour < closesHour; // open across midnight, or around the clock
}

/** One slot per open hour of the calendar day, in clock order; available = not taken and not started yet. */
export function daySlots(input: {
  opensHour: number;
  closesHour: number;
  takenHours: number[];
  firstBookableHour: number;
}): Slot[] {
  const taken = new Set(input.takenHours);
  const slots: Slot[] = [];
  for (let hour = 0; hour < 24; hour++) {
    if (!isOpenHour(hour, input.opensHour, input.closesHour)) continue;
    const status: SlotStatus = taken.has(hour) ? "taken" : hour < input.firstBookableHour ? "past" : "available";
    slots.push({ hour, status });
  }
  return slots;
}

/**
 * Why a booking of `hours` starting at `startHour` can't be made, or null if it can.
 * Uses the same firstBookableHour as availability, so what the UI shows and what the API
 * accepts can't disagree. Overlaps with other bookings are not checked here: the database
 * constraint does that (see the README).
 */
export function bookingRuleViolation(input: {
  startHour: number;
  hours: number;
  opensHour: number;
  closesHour: number;
  firstBookableHour: number;
}): string | null {
  if (input.startHour < input.firstBookableHour) {
    return "This time slot has already started or is in the past";
  }
  // Every hour of the booking must be an open hour. A 2-hour booking from 22:00 on an 08–23 court
  // fails on 23:00; from 23:00 on a 20–02 court its second hour is 00:00 the next day, which is open.
  const bookingHours = Array.from({ length: input.hours }, (_, i) => (input.startHour + i) % 24);
  if (!bookingHours.every((h) => isOpenHour(h, input.opensHour, input.closesHour))) {
    return `The booking must fit within opening hours (${hh(input.opensHour)}–${hh(input.closesHour)})`;
  }
  return null;
}

function hh(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export const CANCELLATION_WINDOW_HOURS = 2;

/**
 * A booking can be cancelled while at least 2 hours remain before it starts.
 * Exactly 2:00 before is still allowed; one millisecond later it isn't.
 * Works on absolute instants, so time zones don't matter here.
 */
export function canCancel(startAt: Date, now: Date): boolean {
  return startAt.getTime() - now.getTime() >= CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000;
}
