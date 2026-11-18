import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { OrgPlan, OrgRole } from '../types/workspace';

const STORAGE_TOKEN_KEY = 'cp360_session_token';

export interface AuthSessionUser {
  uid: string;
  email: string;
  fullName: string;
  isSuperAdmin?: boolean;
  provider: 'google' | 'password' | 'demo';
}

interface AuthContextValue {
  sessionUser: AuthSessionUser | null;
  loading: boolean;
  signingIn: boolean;
  error: string | null;
  clearError: () => void;
  getToken: () => Promise<string | null>;
  signInWithGoogle: () => Promise<void>;
  signInWithGoogleRedirect: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  activateFounder: (params: { email: string; fullName: string; password: string }) => Promise<void>;
  activateInvite: (params: { email: string; fullName: string; password: string }) => Promise<void>;
  registerOrganization: (params: {
    organizationName: string;
    industry: string;
    plan: OrgPlan;
    fullName: string;
    email: string;
    password: string;
  }) => Promise<void>;
  loginDemoRole: (role: OrgRole) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [sessionUser, setSessionUser] = useState<AuthSessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const signingInRef = useRef(false);

  const persistSession = (token: string, user: { uid: string; email: string; fullName: string; isSuperAdmin?: boolean }, provider: 'password' | 'demo') => {
    tokenRef.current = token;
    try {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } catch {
      // Ignore storage errors in restricted iframes
    }
    setSessionUser({
      uid: user.uid,
      email: user.email,
      fullName: user.fullName,
      isSuperAdmin: user.isSuperAdmin,
      provider,
    });
  };

  useEffect(() => {
    let active = true;

    const restoreSavedSession = async () => {
      let savedToken: string | null = null;
      try {
        savedToken = localStorage.getItem(STORAGE_TOKEN_KEY);
      } catch {
        savedToken = null;
      }

      if (savedToken) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          if (res.ok) {
            const data = await res.json();
            if (active && data.user) {
              tokenRef.current = savedToken;
              setSessionUser({
                uid: data.user.uid,
                email: data.user.email,
                fullName: data.user.fullName,
                isSuperAdmin: data.user.isSuperAdmin,
                provider: String(data.user.uid).startsWith('demo-persona-') ? 'demo' : 'password',
              });
              setLoading(false);
              return true;
            }
          }
        } catch {
          // Invalid or expired token
        }
        try {
          localStorage.removeItem(STORAGE_TOKEN_KEY);
        } catch {
          // Ignore
        }
      }
      return false;
    };

    getRedirectResult(auth).catch(() => {
      // Ignore empty redirect results
    });

    let unsub: (() => void) | undefined;

    restoreSavedSession().then((restored) => {
      if (!active) return;
      unsub = onAuthStateChanged(auth, async (user) => {
        if (!active) return;
        if (user) {
          try {
            tokenRef.current = await user.getIdToken();
            setSessionUser({
              uid: user.uid,
              email: user.email || '',
              fullName: user.displayName || user.email?.split('@')[0] || 'Utilisateur',
              provider: 'google',
            });
          } catch (err) {
            console.error('Token fetch error:', err);
            tokenRef.current = null;
          }
          setLoading(false);
        } else if (!restored) {
          setLoading(false);
        }
      });
    });

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, []);

  const getToken = async (): Promise<string | null> => {
    if (auth.currentUser && sessionUser?.provider === 'google') {
      const fresh = await auth.currentUser.getIdToken();
      tokenRef.current = fresh;
      return fresh;
    }
    return tokenRef.current;
  };

  const signInWithGoogle = async () => {
    if (signingInRef.current) return;
    signingInRef.current = true;
    setSigningIn(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleAuthProvider);
      try {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
      } catch {
        // Ignore
      }
      tokenRef.current = await cred.user.getIdToken();
      setSessionUser({
        uid: cred.user.uid,
        email: cred.user.email || '',
        fullName: cred.user.displayName || cred.user.email?.split('@')[0] || 'Utilisateur',
        provider: 'google',
      });
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setError(
          'La fenêtre Google s’est fermée dans l’aperçu intégré. Utilisez la connexion Email/Mot de passe (ou activez votre compte Fondateur), ou ouvrez l’application dans un nouvel onglet.'
        );
      } else if (code === 'auth/popup-blocked') {
        setError(
          'Pop-up bloquée par le navigateur. Utilisez Email/Mot de passe ou ouvrez l’application dans un nouvel onglet.'
        );
      } else if (code === 'auth/unauthorized-domain') {
        setError('Domaine non autorisé pour Google OAuth. Utilisez la connexion Email/Mot de passe.');
      } else {
        setError(err?.message || 'Connexion Google interrompue.');
      }
    } finally {
      signingInRef.current = false;
      setSigningIn(false);
    }
  };

  const signInWithGoogleRedirect = async () => {
    setError(null);
    await signInWithRedirect(auth, googleAuthProvider);
  };

  const loginWithEmail = async (email: string, password: string) => {
    setSigningIn(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Connexion refusée.');
      persistSession(data.token, data.user, 'password');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSigningIn(false);
    }
  };

  const activateFounder = async (params: { email: string; fullName: string; password: string }) => {
    setSigningIn(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/founder-activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation fondateur impossible.');
      persistSession(data.token, data.user, 'password');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSigningIn(false);
    }
  };

  const activateInvite = async (params: { email: string; fullName: string; password: string }) => {
    setSigningIn(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/activate-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation invitation impossible.');
      persistSession(data.token, data.user, 'password');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSigningIn(false);
    }
  };

  const registerOrganization = async (params: {
    organizationName: string;
    industry: string;
    plan: OrgPlan;
    fullName: string;
    email: string;
    password: string;
  }) => {
    setSigningIn(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/register-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Création d’organisation impossible.');
      persistSession(data.token, data.user, 'password');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSigningIn(false);
    }
  };

  const loginDemoRole = async (role: OrgRole) => {
    setSigningIn(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/demo-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Accès démo indisponible.');
      persistSession(data.token, data.user, 'demo');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSigningIn(false);
    }
  };

  const logout = async () => {
    tokenRef.current = null;
    try {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    } catch {
      // Ignore
    }
    setSessionUser(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        sessionUser,
        loading,
        signingIn,
        error,
        clearError: () => setError(null),
        getToken,
        signInWithGoogle,
        signInWithGoogleRedirect,
        loginWithEmail,
        activateFounder,
        activateInvite,
        registerOrganization,
        loginDemoRole,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
