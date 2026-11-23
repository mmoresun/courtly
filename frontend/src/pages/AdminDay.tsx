import { formatHour, formatPrice, type UserBooking } from "../api";
import { DateBar } from "../DateBar";
import { navigate } from "../router";
import { useApi } from "../useApi";

interface AdminBooking extends UserBooking {
  userName: string;
  userEmail: string;
}

/** Admin: every booking of one facility day across all courts, and the expected revenue (from the API). */
export function AdminDay({ date }: { date: string }) {
  const { data, error, loading } = useApi<{ bookings: AdminBooking[]; totalRevenueCents: number }>(
    `/admin/bookings?date=${encodeURIComponent(date)}`,
  );

  return (
    <>
      <h1>Bookings by day</h1>
      <DateBar date={date} onChange={(d) => navigate(`/admin/day?date=${d}`)} />

      {error ? (
        <p className="error">{error}</p>
      ) : loading || !data ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <p className="card revenue">
            Expected revenue: <strong>{formatPrice(data.totalRevenueCents)}</strong>
            <span className="muted">
              {" "}· {data.bookings.filter((b) => b.status === "confirmed").length} confirmed bookings (cancelled ones don't count)
            </span>
          </p>
          {data.bookings.length === 0 ? (
            <p className="muted">No bookings on this day.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Court</th>
                    <th>Player</th>
                    <th>Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bookings.map((b) => (
                    <tr key={b.id} className={b.status}>
                      <td>
                        {formatHour(b.startHour)}–{formatHour(b.startHour + b.hours)}
                      </td>
                      <td>{b.courtName}</td>
                      <td>
                        {b.userName} <span className="muted">{b.userEmail}</span>
                      </td>
                      <td>{formatPrice(b.totalPriceCents)}</td>
                      <td>{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
