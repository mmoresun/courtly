import { useEffect, useState } from "react";
import { getToken, request, setToken, setUnauthorizedHandler, type User } from "./api";
import { Login } from "./pages/Login";
import { navigate, useRoute } from "./router";

export interface Session {
  user: User;
  facilityToday: string; // the facility's date, not the browser's
}

function fetchSession(): Promise<Session> {
  return request<Session>("GET", "/me");
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(() => getToken() !== null);
  const route = useRoute();

  // On start: if a token is stored, check it and learn who we are (401 → login screen).
  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    if (!getToken()) return;
    fetchSession()
      .then(setSession, () => setSession(null))
      .finally(() => setChecking(false));
  }, []);

  async function afterLogin() {
    setSession(await fetchSession());
  }

  // An explicit logout starts over at the root. (An expired token keeps the address,
  // so after logging in again you're back on the same screen.)
  function logout() {
    setToken(null);
    setSession(null);
    navigate("/");
  }

  if (checking) return <p className="page">Loading…</p>;
  if (!session) return <Login onLogin={afterLogin} />;

  return (
    <>
      <header className="topbar">
        <a href="#/" className="brand">Courtly</a>
        <nav>
          <a href="#/">Courts</a>
          <a href="#/bookings">My bookings</a>
        </nav>
        <span className="who">
          {session.user.name}
          {session.user.role === "admin" && " (admin)"}
          <button type="button" className="link" onClick={logout}>Log out</button>
        </span>
      </header>
      <main className="page">
        <p className="muted">Screen “{route.path}” comes next.</p>
      </main>
    </>
  );
}
