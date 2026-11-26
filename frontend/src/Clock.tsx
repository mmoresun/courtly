import { useNow } from "./useNow";

/**
 * The facility's current date and time, in the header corner. Slots and bookings are in facility
 * time, so this is the clock to compare them with, whatever the browser's own time zone is.
 */
export function Clock({ timeZone }: { timeZone: string }) {
  const now = useNow(1000);

  const day = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone });
  const time = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  const place = timeZone.split("/").pop()?.replace(/_/g, " ");
  return (
    <span className="clock" title={`Facility time (${timeZone})`}>
      <small>{place} time · {day}</small>
      <strong>{time}</strong>
    </span>
  );
}
