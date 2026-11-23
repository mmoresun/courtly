import { useCallback, useEffect, useState } from "react";
import { request } from "./api";

interface Loaded<T> {
  key: string; // which request this result belongs to
  data?: T;
  error?: string;
}

/**
 * GET `path` and keep the result. `loading` is true until the answer for the *current* path
 * arrives, so a screen never shows data of the previous court or date. `reload()` fetches again
 * (e.g. after booking a slot).
 */
export function useApi<T>(path: string) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<Loaded<T>>({ key: "" });
  const key = `${path}#${version}`;

  useEffect(() => {
    let stale = false;
    request<T>("GET", path).then(
      (data) => !stale && setResult({ key, data }),
      (err: Error) => !stale && setResult({ key, error: err.message }),
    );
    return () => {
      stale = true;
    };
  }, [path, key]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const current = result.key === key;
  return {
    data: current ? result.data : undefined,
    error: current ? result.error : undefined,
    loading: !current,
    reload,
  };
}
