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
  available: boolean;
}

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

/** One slot per opening hour; available = not started yet and not taken. */
export function daySlots(input: {
  opensHour: number;
  closesHour: number;
  takenHours: number[];
  firstBookableHour: number;
}): Slot[] {
  const taken = new Set(input.takenHours);
  const slots: Slot[] = [];
  for (let hour = input.opensHour; hour < input.closesHour; hour++) {
    slots.push({ hour, available: hour >= input.firstBookableHour && !taken.has(hour) });
  }
  return slots;
}
