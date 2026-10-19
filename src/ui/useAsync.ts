import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Run an async load whenever `key` changes and keep only the latest result. Loading state is
 * derived (result's key ≠ current key), so nothing calls setState synchronously in an effect.
 * Pass `run = null` to skip loading.
 */
export function useAsync<T>(run: (() => Promise<T>) | null, key: string) {
  const runRef = useRef(run);
  useLayoutEffect(() => {
    runRef.current = run;
  });
  const [result, setResult] = useState<{ key: string; data?: T; error?: unknown } | null>(null);
  const enabled = run != null;

  useEffect(() => {
    const fn = runRef.current;
    if (!fn) return;
    let live = true;
    fn().then(
      (data) => live && setResult({ key, data }),
      (error) => live && setResult({ key, error }),
    );
    return () => {
      live = false;
    };
  }, [key, enabled]);

  const current = result?.key === key ? result : null;
  return { data: current?.data, error: current?.error, loading: enabled && !current };
}
