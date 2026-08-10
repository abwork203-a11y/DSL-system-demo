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

  const applySession = useCallback((user) => {
    localStorage.setItem('dsl_user', JSON.stringify(user));
    setUser(user);
  }, []);

  // Two possible outcomes now: a normal account logs straight in
  // ({ done: true }); an MFA-enabled account gets a pending token instead
  // ({ done: false, mfaToken }) that the caller (LoginPage) uses to prompt
  // for a code and complete the login via completeMfaLogin below.
  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password);
    if (res.data.mfaRequired) {
      return { done: false, mfaToken: res.data.mfaToken };
    }
    applySession(res.data.user);
    return { done: true, user: res.data.user };
  }, [applySession]);

  const completeMfaLogin = useCallback(async (mfaToken, code) => {
    const res = await authApi.mfaVerify(mfaToken, code);
    applySession(res.data.user);
    return res.data;
  }, [applySession]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      localStorage.removeItem('dsl_user');
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, login, completeMfaLogin, logout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
