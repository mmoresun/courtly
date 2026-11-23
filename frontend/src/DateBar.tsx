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

/** Previous / date picker / next. `onChange` should navigate: the date lives in the URL. */
export function DateBar({ date, onChange }: { date: string; onChange: (date: string) => void }) {
  const previousDay = addDays(date, -1);
  const nextDay = addDays(date, 1);
  return (
    <div className="date-bar">
      <button type="button" className="secondary" disabled={!previousDay} onClick={() => previousDay && onChange(previousDay)}>
        ← Previous day
      </button>
      <input type="date" value={date} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Date" />
      <button type="button" className="secondary" disabled={!nextDay} onClick={() => nextDay && onChange(nextDay)}>
        Next day →
      </button>
    </div>
  );
}
