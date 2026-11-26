import { useState } from "react";
import { formatHour, formatPrice, request, type Booking, type Court, type Slot } from "../api";
import { DateBar } from "../DateBar";
import { navigate } from "../router";
import { useApi } from "../useApi";

/**
 * One court, one day. The date lives in the URL (?date=…): changing it navigates, so a link
 * opens the same day and the browser's Back button works.
 * The browser doesn't decide what can be booked: it shows what the API says, sends the request,
 * and shows the API's answer, including its error messages.
 */
export function CourtDay({ courtId, date }: { courtId: number; date: string }) {
  const courts = useApi<Court[]>("/courts");
  const availability = useApi<{ slots: Slot[] }>(`/courts/${courtId}/availability?date=${encodeURIComponent(date)}`);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const court = courts.data?.find((c) => c.id === courtId);
  const goTo = (newDate: string) => navigate(`/courts/${courtId}?date=${newDate}`);

  async function book(hours: 1 | 2) {
    if (selected === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const b = await request<Booking>("POST", "/bookings", { courtId, date, startHour: selected, hours });
      setMessage({
        ok: true,
        text: `Booked ${formatHour(b.startHour)}–${formatHour(b.startHour + b.hours)} on ${b.date} for ${formatPrice(b.totalPriceCents)}.`,
      });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message }); // e.g. someone else just took it → 409 text
    } finally {
      // Whatever the answer, the selected slot is out of date now (booked by us, or taken by
      // someone else → 409): drop the selection so the panel never offers a booking that can't work.
      setSelected(null);
      setBusy(false);
      availability.reload();
    }
  }

  if (courts.error) return <p className="error">{courts.error}</p>;
  if (courts.loading) return <p className="muted">Loading…</p>;
  if (!court) {
    return (
      <p className="error">
        Court not found. <a href="#/">Back to courts</a>
      </p>
    );
  }

  const slots = availability.data?.slots ?? [];
  // 2 hours only if the next hour is also a free slot (so it is neither taken nor after closing).
  const canBookTwo = selected !== null && slots.some((s) => s.hour === selected + 1 && s.status === "available");

  return (
    <>
      <p>
        <a href="#/">← All courts</a>
      </p>
      <h1>{court.name}</h1>
      <p className="muted">
        <span className="sport">{court.sport}</span> · {court.opensAt}–{court.closesAt} ·{" "}
        {formatPrice(court.hourlyPriceCents)} / hour · times are facility local time
      </p>

      <DateBar date={date} onChange={goTo} />

      {message && <p className={message.ok ? "notice" : "error"}>{message.text}{message.ok && <> <a href="#/bookings">My bookings</a></>}</p>}

      {availability.error ? (
        <p className="error">{availability.error}</p>
      ) : availability.loading ? (
        <p className="muted">Loading slots…</p>
      ) : (
        <ul className="slots">
          {slots.map((slot) => (
            <li key={slot.hour}>
              <button
                type="button"
                className={`slot ${slot.hour === selected ? "selected" : ""}`}
                disabled={slot.status !== "available" || busy}
                onClick={() => { setSelected(slot.hour); setMessage(null); }}
              >
                {formatHour(slot.hour)}
                <small>{slot.status}</small>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected !== null && (
        <div className="card book-bar">
          <span>
            Start at <strong>{formatHour(selected)}</strong>
          </span>
          <button type="button" disabled={busy} onClick={() => book(1)}>
            1 hour · {formatPrice(court.hourlyPriceCents)}
          </button>
          {canBookTwo && (
            <button type="button" disabled={busy} onClick={() => book(2)}>
              2 hours · {formatPrice(court.hourlyPriceCents * 2)}
            </button>
          )}
          <button type="button" className="link" onClick={() => setSelected(null)}>
            Cancel
          </button>
        </div>
      )}
    </>
  );
}
