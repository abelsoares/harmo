import { useEffect, useState } from 'react';

export type FetchState<T> = { loading: boolean; data: T | null; error: string | null };

export function useAsync<T>(loader: () => Promise<T>, deps: ReadonlyArray<unknown>): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ loading: true, data: null, error: null });

  useEffect(() => {
    let cancelled = false;

    setState(s => ({ ...s, loading: true, error: null }));
    loader()
      .then(data => {
        if (!cancelled) {
          setState({ loading: false, data, error: null });
        }
      })
      .catch(err => {
        if (!cancelled) {
          setState({ loading: false, data: null, error: err instanceof Error ? err.message : String(err) });
        }
      });

    return () => {
      cancelled = true;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: caller owns the deps array
  }, deps);

  return state;
}
