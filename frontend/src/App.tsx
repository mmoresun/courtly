import { useEffect, useState } from "react";
import { getToken, request, setToken, setUnauthorizedHandler, type User } from "./api";
import { Login } from "./pages/Login";
import { AdminCourts } from "./pages/AdminCourts";
import { AdminDay } from "./pages/AdminDay";
import { CourtDay } from "./pages/CourtDay";
import { Courts } from "./pages/Courts";
import { MyBookings } from "./pages/MyBookings";
import { navigate, useRoute, type Route } from "./router";

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
          {session.user.role === "admin" && (
            <>
              <a href={`#/admin/day?date=${session.facilityToday}`}>Bookings by day</a>
              <a href="#/admin/courts">Manage courts</a>
            </>
          )}
        </nav>
        <span className="who">
          {session.user.name}
          {session.user.role === "admin" && " (admin)"}
          <button type="button" className="link" onClick={logout}>Log out</button>
        </span>
      </header>
      <main className="page">{screen(route, session)}</main>
    </>
  );
}

/** Which screen the URL asks for. */
function screen(route: Route, session: Session) {
  if (route.path === "/") return <Courts facilityToday={session.facilityToday} />;

  if (route.path === "/bookings") return <MyBookings />;
  // The admin links are only shown to admins, but the API enforces the role on its own (403).
  if (route.path === "/admin/courts") return <AdminCourts />;
  if (route.path === "/admin/day") return <AdminDay date={route.query.get("date") ?? session.facilityToday} />;

  const court = route.path.match(/^\/courts\/(\d+)$/);
  if (court) {
    const date = route.query.get("date") ?? session.facilityToday;
    // key: a new court or date starts with a clean screen (no selected slot, no old message)
    return <CourtDay key={`${court[1]}/${date}`} courtId={Number(court[1])} date={date} />;
  }

  return (
    <p className="muted">
      Nothing here yet. <a href="#/">Back to courts</a>
    </p>
  );
}
