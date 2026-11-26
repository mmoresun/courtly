import { useState } from "react";
import { formatDate, formatHour, formatPrice, request, type Booking, type Court, type Slot } from "../api";
import { ConfirmModal } from "../ConfirmModal";
import { DateBar } from "../DateBar";
import { navigate } from "../router";
import { useApi } from "../useApi";

/**
 * One court, one day. The date lives in the URL (?date=…): changing it navigates, so a link
 * opens the same day and the browser's Back button works.
 * The browser doesn't decide what can be booked: it shows what the API says, sends the request,
 * and shows the API's answer, including its error messages.
 *
 * Flow: pick a duration → pick a start (every hour of the booking is highlighted, and the
 * summary spells out "from – to") → "Book" opens a modal with date and time → "Confirm" books.
 */
export function CourtDay({ courtId, date }: { courtId: number; date: string }) {
  const courts = useApi<Court[]>("/courts");
  const availability = useApi<{ slots: Slot[] }>(`/courts/${courtId}/availability?date=${encodeURIComponent(date)}`);
  const [hours, setHours] = useState<1 | 2>(1);
  const [start, setStart] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const court = courts.data?.find((c) => c.id === courtId);
  const slots = availability.data?.slots ?? [];
  const goTo = (newDate: string) => navigate(`/courts/${courtId}?date=${newDate}`);

  // A start works if every hour of the booking is a free slot (so none is taken or after closing).
  const isFree = (hour: number) => slots.some((s) => s.hour === hour && s.status === "available");
  const canStart = (hour: number, h: number) => Array.from({ length: h }, (_, i) => hour + i).every(isFree);

  function chooseHours(h: 1 | 2) {
    setHours(h);
    if (start !== null && !canStart(start, h)) setStart(null);
    setMessage(null);
  }

  async function book() {
    if (start === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const b = await request<Booking>("POST", "/bookings", { courtId, date, startHour: start, hours });
      setMessage({
        ok: true,
        text: `Booked ${formatDate(b.date)}, ${formatHour(b.startHour)} – ${formatHour(b.startHour + b.hours)} for ${formatPrice(b.totalPriceCents)}.`,
      });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message }); // e.g. someone else just took it → 409 text
    } finally {
      // Whatever the answer, the selection is out of date now (booked by us, or taken by
      // someone else → 409): drop it so the page never offers a booking that can't work.
      setStart(null);
      setConfirming(false);
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

  const end = start === null ? null : start + hours;
  const price = court.hourlyPriceCents * hours;

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

      <div className="duration" role="group" aria-label="Duration">
        <span>Duration:</span>
        {([1, 2] as const).map((h) => (
          <button key={h} type="button" className={hours === h ? "" : "secondary"} aria-pressed={hours === h} onClick={() => chooseHours(h)}>
            {h === 1 ? "1 hour" : "2 hours"}
          </button>
        ))}
      </div>

      {availability.error ? (
        <p className="error">{availability.error}</p>
      ) : availability.loading ? (
        <p className="muted">Loading slots…</p>
      ) : (
        <ul className="slots">
          {slots.map((slot) => {
            const inBooking = start !== null && end !== null && slot.hour >= start && slot.hour < end;
            const startable = canStart(slot.hour, hours);
            return (
              <li key={slot.hour}>
                <button
                  type="button"
                  className={`slot ${inBooking ? "selected" : ""}`}
                  disabled={!startable || busy}
                  onClick={() => { setStart(slot.hour); setMessage(null); }}
                >
                  {formatHour(slot.hour)}–{formatHour(slot.hour + 1)}
                  <small>{slot.status !== "available" ? slot.status : startable ? "available" : "available, 1 hour only"}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {start !== null && end !== null && (
        <div className="card book-bar">
          <span className="summary">
            Your booking: <strong>{formatDate(date)}</strong>, from <strong>{formatHour(start)}</strong> to{" "}
            <strong>{formatHour(end)}</strong> ({hours === 1 ? "1 hour" : "2 hours"}) · {formatPrice(price)}
          </span>
          <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
            Book
          </button>
          <button type="button" className="link" onClick={() => setStart(null)}>
            Clear
          </button>
        </div>
      )}

      {confirming && start !== null && end !== null && (
        <ConfirmModal
          title="Confirm booking"
          rows={[
            ["Court", court.name],
            ["Date", formatDate(date)],
            ["Time", `${formatHour(start)} – ${formatHour(end)}`],
            ["Price", formatPrice(price)],
          ]}
          confirmLabel="Confirm"
          busy={busy}
          onConfirm={book}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
