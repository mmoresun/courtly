import { useState } from "react";
import { formatHour, formatPrice, request, type Booking, type Court, type Slot } from "../api";
import { navigate } from "../router";
import { useApi } from "../useApi";

/**
 * "2026-11-24" ± n days, or null if `date` isn't a real date. (JS would quietly turn "2026-02-30"
 * into March 2; the API rejects such a date, and the day arrows are disabled.)
 */
function addDays(date: string, n: number): string | null {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

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
  const previousDay = addDays(date, -1);
  const nextDay = addDays(date, 1);

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
  const canBookTwo = selected !== null && slots.some((s) => s.hour === selected + 1 && s.available);

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

      <div className="date-bar">
        <button type="button" className="secondary" disabled={!previousDay} onClick={() => previousDay && goTo(previousDay)}>
          ← Previous day
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && goTo(e.target.value)} aria-label="Date" />
        <button type="button" className="secondary" disabled={!nextDay} onClick={() => nextDay && goTo(nextDay)}>
          Next day →
        </button>
      </div>

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
                disabled={!slot.available || busy}
                onClick={() => { setSelected(slot.hour); setMessage(null); }}
              >
                {formatHour(slot.hour)}
                <small>{slot.available ? "free" : "unavailable"}</small>
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
