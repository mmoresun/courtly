import { useState, type FormEvent } from "react";
import { request, setToken, type User } from "../api";

const DEMO_ACCOUNTS = ["alice@courtly.test", "bob@courtly.test", "admin@courtly.test"];

export function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await request<{ token: string; user: User }>("POST", "/auth/login", { email, password });
      setToken(token);
      await onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <h1>Courtly</h1>
      <form onSubmit={submit} className="card">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(null); }} required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null); }} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <section className="card muted">
        <p>Demo accounts, password <code>courtly123</code>:</p>
        <ul>
          {DEMO_ACCOUNTS.map((demo) => (
            <li key={demo}>
              <button type="button" className="link" onClick={() => { setEmail(demo); setPassword("courtly123"); setError(null); }}>
                {demo}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
