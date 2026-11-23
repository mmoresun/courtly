import { formatPrice, type Court } from "../api";
import { useApi } from "../useApi";

/** Active courts (the API only returns those to users). Each opens its availability for the facility's today. */
export function Courts({ facilityToday }: { facilityToday: string }) {
  const { data: courts, error, loading } = useApi<Court[]>("/courts");

  if (error) return <p className="error">{error}</p>;
  if (loading || !courts) return <p className="muted">Loading courts…</p>;
  if (courts.length === 0) return <p className="muted">No courts are open for booking right now.</p>;

  return (
    <>
      <h1>Courts</h1>
      <ul className="court-list">
        {courts.map((court) => (
          <li key={court.id} className="card">
            <div>
              <h2>{court.name}</h2>
              <p className="muted">
                <span className="sport">{court.sport}</span> · {court.opensAt}–{court.closesAt} · {formatPrice(court.hourlyPriceCents)} / hour
              </p>
            </div>
            <a className="button" href={`#/courts/${court.id}?date=${facilityToday}`}>
              See availability
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
