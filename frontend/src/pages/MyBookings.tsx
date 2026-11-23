import { useState } from "react";
import { formatHour, formatPrice, request, type UserBooking } from "../api";
import { useApi } from "../useApi";

/**
 * The user's bookings, split by the API into upcoming and past.
 * "Cancel" is offered on every confirmed upcoming booking, even inside the 2-hour window:
 * the API decides, and its refusal ("…up to 2 hours before they start") is shown as is.
 */
export function MyBookings() {
  const { data, error, loading, reload } = useApi<{ upcoming: UserBooking[]; past: UserBooking[] }>("/bookings");
  const [message, setMessage] = useState<{ ok: boolean; text: string; id: number } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function cancel(b: UserBooking) {
    if (!window.confirm(`Cancel ${b.courtName} on ${b.date} at ${formatHour(b.startHour)}?`)) return;
    setBusyId(b.id);
    setMessage(null);
    try {
      await request("POST", `/bookings/${b.id}/cancel`);
      setMessage({ ok: true, text: "Booking cancelled.", id: b.id });
      reload();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message, id: b.id });
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (loading || !data) return <p className="muted">Loading bookings…</p>;

  const row = (b: UserBooking, canCancel: boolean) => (
    <li key={b.id} className={`card booking ${b.status}`}>
      <div>
        <strong>{b.courtName}</strong>
        <p className="muted">
          {b.date} · {formatHour(b.startHour)}–{formatHour(b.startHour + b.hours)} · {formatPrice(b.totalPriceCents)}
          {b.status === "cancelled" && <span className="badge">cancelled</span>}
        </p>
        {message?.id === b.id && <p className={message.ok ? "notice" : "error"}>{message.text}</p>}
      </div>
      {canCancel && b.status === "confirmed" && (
        <button type="button" className="secondary" disabled={busyId === b.id} onClick={() => cancel(b)}>
          Cancel booking
        </button>
      )}
    </li>
  );

  return (
    <>
      <h1>My bookings</h1>

      <h2>Upcoming</h2>
      {data.upcoming.length === 0 ? (
        <p className="muted">
          Nothing booked yet. <a href="#/">Book a court</a>
        </p>
      ) : (
        <ul className="bookings">{data.upcoming.map((b) => row(b, true))}</ul>
      )}

      <h2>Past</h2>
      {data.past.length === 0 ? (
        <p className="muted">No past bookings.</p>
      ) : (
        <ul className="bookings">{data.past.map((b) => row(b, false))}</ul>
      )}
    </>
  );
}
