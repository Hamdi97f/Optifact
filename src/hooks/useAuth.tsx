/**
 * Authentication hook backed by the Optifact api-gateway.
 *
 * The exported context shape mirrors the previous Supabase-based version
 * (`session`, `user`, `signIn`, `signUp`, `signOut`) so existing call sites
 * keep working unchanged.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type ApiUser,
  getCurrentToken,
  getCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  onSessionChange,
  register as apiRegister,
} from '@/lib/apiClient';
import { resetDbCache } from '@/lib/db';

/** Minimal user/session shape — kept compatible with the previous code. */
export interface AppUser {
  id: string;
  email: string;
}

export interface AppSession {
  token: string;
  user: AppUser;
}

interface AuthContextValue {
  session: AppSession | null;
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    companyName: string,
  ) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toAppUser(u: ApiUser | null): AppUser | null {
  return u ? { id: u.user_id, email: u.email } : null;
}

function buildSession(u: ApiUser | null, token: string | null): AppSession | null {
  if (!u || !token) return null;
  return { token, user: { id: u.user_id, email: u.email } };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => toAppUser(getCurrentUser()));
  const [session, setSession] = useState<AppSession | null>(() =>
    buildSession(getCurrentUser(), getCurrentToken()),
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const off = onSessionChange((u) => {
      setUser(toAppUser(u));
      setSession(buildSession(u, getCurrentToken()));
      // A different user → drop the in-memory table cache.
      resetDbCache();
    });
    return () => {
      off();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user,
    loading,
    async signIn(email, password) {
      setLoading(true);
      try {
        await apiLogin(email, password);
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Sign-in failed' };
      } finally {
        setLoading(false);
      }
    },
    async signUp(email, password, _companyName) {
      // The api-gateway doesn't store profile metadata at registration time,
      // so `companyName` is currently unused. It can be persisted later in
      // a `profiles` table once the user is signed in.
      void _companyName;
      setLoading(true);
      try {
        await apiRegister(email, password);
        // Attempt to sign the user in immediately so the UX matches the old flow.
        try {
          await apiLogin(email, password);
        } catch {
          // Some gateways require a separate confirmation step; surface no
          // error here so the caller can prompt the user to sign in.
        }
        return { error: null };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Sign-up failed' };
      } finally {
        setLoading(false);
      }
    },
    async signOut() {
      await apiLogout();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an <AuthProvider>');
  return ctx;
}
