// The only place that talks to the backend.
// Every message the user sees about a rule (taken slot, too late to cancel, …) comes from the API:
// the browser doesn't re-implement booking rules.

export type Role = "user" | "admin";

export interface User {
  id: number;
  name: string;
  role: Role;
}

export interface Court {
  id: number;
  name: string;
  sport: string;
  hourlyPriceCents: number;
  opensAt: string; // "08:00", facility local time
  closesAt: string;
  isActive: boolean;
}

export interface Slot {
  hour: number;
  status: "available" | "taken" | "past"; // same as the backend's SlotStatus
}

export interface Booking {
  id: number;
  courtId: number;
  userId: number;
  date: string; // facility-local "YYYY-MM-DD"
  startHour: number;
  hours: number;
  status: "confirmed" | "cancelled";
  totalPriceCents: number;
}

export interface UserBooking extends Booking {
  courtName: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = "courtly.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (private mode): the session just won't survive a reload
  }
}

let onUnauthorized = () => {};

/** App registers this: an expired or broken token sends the user back to the login screen. */
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));

  // A wrong password on the login form is also a 401, but then there's no token to drop.
  if (res.status === 401 && token) {
    setToken(null);
    onUnauthorized();
  }
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function formatPrice(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}
