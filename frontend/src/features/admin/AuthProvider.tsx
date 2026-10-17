import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { adminApi } from '../../api/admin';
import type { Session } from '../../api/admin';
import { ApiError } from '../../api/client';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mutationPending = useRef(false);

  const loadSession = useCallback(async (requestGeneration: number) => {
    try {
      const result = await adminApi.session();
      if (requestGeneration !== generation.current) return;
      setSession(result);
      setError('');
    }
    catch (failure) {
      if (requestGeneration !== generation.current) return;
      setSession(null);
      setError(failure instanceof ApiError && failure.status === 401
        ? ''
        : failure instanceof Error ? failure.message : '인증 상태를 확인하지 못했습니다.');
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    // A session read during login/logout could observe the cookie before the mutation completes.
    if (mutationPending.current) return;
    const requestGeneration = ++generation.current;
    setLoading(true);
    setError('');
    await loadSession(requestGeneration);
  }, [loadSession]);

  useEffect(() => {
    const requestGeneration = ++generation.current;
    void loadSession(requestGeneration);
    return () => { generation.current += 1; };
  }, [loadSession]);

  const login = async (email: string, password: string) => {
    const requestGeneration = ++generation.current;
    mutationPending.current = true;
    try {
      const result = await adminApi.login(email, password);
      if (requestGeneration !== generation.current) return;
      setSession(result);
      setError('');
    } finally {
      if (requestGeneration === generation.current) {
        mutationPending.current = false;
        setLoading(false);
      }
    }
  };

  const logout = async () => {
    const requestGeneration = ++generation.current;
    mutationPending.current = true;
    try {
      await adminApi.logout();
      if (requestGeneration !== generation.current) return;
      setSession(null);
      setError('');
    } finally {
      if (requestGeneration === generation.current) {
        mutationPending.current = false;
        setLoading(false);
      }
    }
  };
  return <AuthContext.Provider value={{ session, loading, error, refresh, login, logout }}>{children}</AuthContext.Provider>;
}
