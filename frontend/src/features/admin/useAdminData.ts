import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../api/client';
import { useAuth } from './auth-context';

type Loader<T> = (signal: AbortSignal) => Promise<T>;
interface Response<T> { loader: Loader<T>; attempt: number; data: T | null; error: string }

export function useAdminData<T>(loader: Loader<T>) {
  const [response, setResponse] = useState<Response<T> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { refresh } = useAuth();

  useEffect(() => {
    const controller = new AbortController();
    void loader(controller.signal).then(data => {
      if (!controller.signal.aborted) setResponse({ loader, attempt, data, error: '' });
    }).catch(async failure => {
      if (controller.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) await refresh();
      if (!controller.signal.aborted) setResponse({
        loader, attempt, data: null,
        error: failure instanceof Error ? failure.message : '데이터를 불러오지 못했습니다.',
      });
    });
    return () => controller.abort();
  }, [loader, attempt, refresh]);

  const reload = useCallback(() => setAttempt(value => value + 1), []);
  const replaceData = useCallback((data: T) => setResponse({ loader, attempt, data, error: '' }), [loader, attempt]);
  // Never show the previous filter or report while its replacement request is pending.
  const current = response?.loader === loader && response.attempt === attempt ? response : null;
  return { data: current?.data ?? null, loading: !current, error: current?.error ?? '', reload, replaceData };
}
