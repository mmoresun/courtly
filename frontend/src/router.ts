// Tiny router: the screen lives in the URL hash ("#/courts/3?date=2026-11-25"),
// so a reload keeps you on the same screen and any screen can be linked to.
// Five screens don't need a routing library.
import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function snapshot(): string {
  return window.location.hash.slice(1) || "/";
}

export interface Route {
  path: string; // "/courts/3"
  query: URLSearchParams; // date=2026-11-25
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot);
  const [path = "/", query = ""] = hash.split("?");
  return { path, query: new URLSearchParams(query) };
}

export function navigate(to: string): void {
  window.location.hash = to;
}
