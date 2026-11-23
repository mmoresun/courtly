// Booking business rules in one place.
// Pure functions over facility-local dates and whole hours: no database, no clock, no time zones.
// "now" is passed in, and Postgres does every time-zone conversion (see bookings.queries.ts).

/** Facility-local current time, rounded down to the hour. `date` is "YYYY-MM-DD". */
export interface LocalNow {
  date: string;
  hour: number;
}

export type SlotStatus = "available" | "taken" | "past";

export interface Slot {
  hour: number; // local start hour: 8 means 08:00–09:00
  status: SlotStatus;
}

/** "08:00" → 8 */
export function hourOf(time: string): number {
  return Number(time.slice(0, 2));
}

/** A slot can't be booked once it has started. "YYYY-MM-DD" strings compare like dates. */
export function isPast(date: string, hour: number, now: LocalNow): boolean {
  return date < now.date || (date === now.date && hour <= now.hour);
}

/** One slot per opening hour of the day, each marked available, taken or past. */
export function daySlots(input: {
  date: string;
  opensHour: number;
  closesHour: number;
  takenHours: number[];
  now: LocalNow;
}): Slot[] {
  const taken = new Set(input.takenHours);
  const slots: Slot[] = [];
  for (let hour = input.opensHour; hour < input.closesHour; hour++) {
    const status: SlotStatus = isPast(input.date, hour, input.now)
      ? "past"
      : taken.has(hour)
        ? "taken"
        : "available";
    slots.push({ hour, status });
  }
  return slots;
}
