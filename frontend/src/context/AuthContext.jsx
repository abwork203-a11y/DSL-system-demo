import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { auth as authApi } from '../api/endpoints';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // We can't read the httpOnly session cookie from JS (that's the point), so
  // we can't know who's logged in just by looking at storage. A cached
  // `dsl_user` in localStorage lets the UI render instantly without a flash
  // of "logged out," but it's never trusted for anything security-relevant —
  // `/auth/me` (which succeeds or fails based on the real cookie) is always
  // the source of truth, checked on every load.
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('dsl_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      // Corrupted or tampered localStorage shouldn't crash the app on load —
      // /auth/me (below) is the real source of truth anyway.
      return null;
    }
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    authApi
      .me()
      .then((res) => {
        setUser(res.data.user);
        localStorage.setItem('dsl_user', JSON.stringify(res.data.user));
      })
      .catch(() => {
        localStorage.removeItem('dsl_user');
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password);
    localStorage.setItem('dsl_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      localStorage.removeItem('dsl_user');
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
