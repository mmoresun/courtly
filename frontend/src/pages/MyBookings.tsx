import { useState } from "react";
import { formatDate, formatHour, formatPrice, request, type UserBooking } from "../api";
import { ConfirmModal } from "../ConfirmModal";
import { useNow } from "../useNow";
import { useApi } from "../useApi";

/**
 * The user's bookings, split by the API into upcoming, past and cancelled.
 * "Cancel" is offered on every confirmed upcoming booking, even inside the 2-hour window:
 * the API decides, and its refusal ("…up to 2 hours before they start") is shown as is.
 */
export function MyBookings() {
  const { data, error, loading, reload } = useApi<{ upcoming: UserBooking[]; past: UserBooking[]; cancelled: UserBooking[] }>("/bookings");
  const [message, setMessage] = useState<{ ok: boolean; text: string; id: number } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toCancel, setToCancel] = useState<UserBooking | null>(null);
  const now = useNow(30_000);

  async function cancel(b: UserBooking) {
    setBusyId(b.id);
    setMessage(null);
    try {
      await request("POST", `/bookings/${b.id}/cancel`);
      setMessage({ ok: true, text: "Booking cancelled.", id: b.id });
      reload();
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message, id: b.id });
    } finally {
      setToCancel(null);
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
        </p>
        {canCancel && <p className="starts-in">{startsIn(b, now)}</p>}
        {message?.id === b.id && <p className={message.ok ? "notice" : "error"}>{message.text}</p>}
      </div>
      {canCancel && (
        <button type="button" className="secondary" disabled={busyId === b.id} onClick={() => setToCancel(b)}>
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

      <h2>Cancelled</h2>
      {data.cancelled.length === 0 ? (
        <p className="muted">No cancelled bookings.</p>
      ) : (
        <ul className="bookings">{data.cancelled.map((b) => row(b, false))}</ul>
      )}

      {toCancel && (
        <ConfirmModal
          title="Cancel this booking?"
          rows={[
            ["Court", toCancel.courtName],
            ["Date", formatDate(toCancel.date)],
            ["Time", `${formatHour(toCancel.startHour)} – ${formatHour(toCancel.startHour + toCancel.hours)}`],
            ["Price", formatPrice(toCancel.totalPriceCents)],
          ]}
          confirmLabel="Cancel booking"
          backLabel="Keep it"
          danger
          busy={busyId === toCancel.id}
          onConfirm={() => cancel(toCancel)}
          onClose={() => setToCancel(null)}
        />
      )}
    </>
  );
}

/** "starts in 3 h 20 min" / "starts in 2 days 4 h" / "going on now" (upcoming includes running bookings). */
function startsIn(b: UserBooking, now: Date): string {
  const minutes = Math.ceil((new Date(b.startAt).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "going on now";
  const days = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (days > 0) return `starts in ${days} ${days === 1 ? "day" : "days"}${h ? ` ${h} h` : ""}`;
  if (h > 0) return `starts in ${h} h${m ? ` ${m} min` : ""}`;
  return `starts in ${m} min`;
}
