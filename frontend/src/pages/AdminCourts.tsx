import { useState, type FormEvent } from "react";
import { formatHour, formatPrice, request, type Court } from "../api";
import { useApi } from "../useApi";

type CourtInput = Omit<Court, "id">;

const HOURS = Array.from({ length: 24 }, (_, h) => formatHour(h)); // "00:00" … "23:00"
const EMPTY: CourtInput = { name: "", sport: "", hourlyPriceCents: 2000, opensAt: "08:00", closesAt: "22:00", isActive: true };

/**
 * Admin: all courts (inactive too), add, edit, deactivate / reactivate.
 * Every change is a full PUT, and every check (name, price, hours) is done by the API:
 * its 400 message is shown next to the form.
 * Existing bookings are never touched by these changes (see README).
 */
export function AdminCourts() {
  const { data: courts, error, loading, reload } = useApi<Court[]>("/admin/courts");
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [rowError, setRowError] = useState<{ id: number; text: string } | null>(null);

  async function save(id: number | "new", input: CourtInput) {
    if (id === "new") await request("POST", "/admin/courts", input);
    else await request("PUT", `/admin/courts/${id}`, input);
    setEditing(null);
    reload();
  }

  // Deactivating is reversible (activate again), so it needs no confirmation.
  async function toggleActive(court: Court) {
    setRowError(null);
    const { id, ...input } = court;
    try {
      await request("PUT", `/admin/courts/${id}`, { ...input, isActive: !court.isActive });
      reload();
    } catch (err) {
      setRowError({ id, text: (err as Error).message });
    }
  }

  if (error) return <p className="error">{error}</p>;
  if (loading || !courts) return <p className="muted">Loading courts…</p>;

  return (
    <>
      <h1>Manage courts</h1>
      <p className="muted">
        Deactivated courts can't be booked and are hidden from players. Their bookings stay, and existing bookings
        keep their price and time when a court is edited.
      </p>

      {editing === "new" ? (
        <CourtForm initial={EMPTY} onSave={(input) => save("new", input)} onCancel={() => setEditing(null)} />
      ) : (
        <p>
          <button type="button" onClick={() => setEditing("new")}>
            Add court
          </button>
        </p>
      )}

      <ul className="court-list">
        {courts.map((court) =>
          editing === court.id ? (
            <li key={court.id}>
              <CourtForm initial={court} onSave={(input) => save(court.id, input)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={court.id} className={`card ${court.isActive ? "" : "inactive"}`}>
              <div>
                <h2>
                  {court.name} {!court.isActive && <span className="badge">inactive</span>}
                </h2>
                <p className="muted">
                  <span className="sport">{court.sport}</span> · {court.opensAt}–{court.closesAt} ·{" "}
                  {formatPrice(court.hourlyPriceCents)} / hour
                </p>
                {rowError?.id === court.id && <p className="error">{rowError.text}</p>}
              </div>
              <div className="actions">
                <button type="button" className="secondary" onClick={() => setEditing(court.id)}>
                  Edit
                </button>
                <button type="button" className="secondary" onClick={() => toggleActive(court)}>
                  {court.isActive ? "Deactivate" : "Activate"}
                </button>
              </div>
            </li>
          ),
        )}
      </ul>
    </>
  );
}

function CourtForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: CourtInput;
  onSave: (input: CourtInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CourtInput>(initial);
  // The price is typed in euros, sent in cents. Kept as text so "24." can be typed.
  const [price, setPrice] = useState((initial.hourlyPriceCents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof CourtInput>(key: K, value: CourtInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      // Math.round: 24.1 * 100 is 2410.0000000000005 in floating point.
      await onSave({ ...form, hourlyPriceCents: Math.round(Number(price) * 100) });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card court-form" onSubmit={submit}>
      <label>
        Name
        <input value={form.name} onChange={(e) => set("name", e.target.value)} />
      </label>
      <label>
        Sport
        <input value={form.sport} onChange={(e) => set("sport", e.target.value)} placeholder="padel, tennis…" />
      </label>
      <label>
        Price per hour, €
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value);
            setError(null);
          }}
        />
      </label>
      <label>
        Opens
        <select value={form.opensAt} onChange={(e) => set("opensAt", e.target.value)}>
          {HOURS.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
      </label>
      <label>
        Closes
        <select value={form.closesAt} onChange={(e) => set("closesAt", e.target.value)}>
          {HOURS.map((h) => (
            <option key={h}>{h}</option>
          ))}
        </select>
      </label>
      <label className="checkbox">
        <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        Active (can be booked)
      </label>
      {error && <p className="error">{error}</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
