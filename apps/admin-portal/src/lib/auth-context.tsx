'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apolloClient } from './apollo-client';
import { gql } from '@apollo/client';

interface User {
  userId: string;
  tenantId: string;
  tenantName?: string;
  role: string;
  permissions: string[];
  email?: string;
  name?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /**
   * Submit slug + email + password. Resolves to:
   *   - `null` when login completes normally (tokens stored, redirect fired).
   *   - An `MfaChallenge` when the user has MFA enabled — the LoginForm
   *     swaps to a TOTP entry screen and submits via `verifyMfa`.
   * Still throws `MfaEnrollmentRequiredError` when the tenant tier
   * mandates MFA and the user is overdue (separate flow — restricted
   * enrollment-only token is stored before the throw).
   */
  login: (
    tenantId: string,
    email: string,
    password: string,
  ) => Promise<MfaChallenge | null>;
  /**
   * Exchange a valid MFA token + TOTP/backup code for a full session.
   * Throws on invalid/expired token or wrong code.
   */
  verifyMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => null,
  verifyMfa: async () => {},
  logout: () => {},
  hasPermission: () => false,
  refreshUser: async () => {},
});

const LOGIN_MUTATION = gql`
  mutation LoginBySlug($slug: String!, $email: String!, $password: String!) {
    loginBySlug(slug: $slug, email: $email, password: $password) {
      accessToken
      refreshToken
      requiresMfaEnrollment
      mfaGraceDaysRemaining
      # MFA portal fix: existing MFA-enabled SP users return
      # { requiresMfa: true, mfaToken } — neither field was selected
      # before, so the frontend got an undefined accessToken + the
      # JWT parse failed silently. Surfacing both fields here so the
      # caller can branch into the TOTP challenge flow.
      requiresMfa
      mfaToken
    }
  }
`;

/**
 * MFA portal fix: redeem the one-time MFA challenge token for a
 * full tenant session. Backend rate-limits this at 5 attempts per
 * 5-minute token AND per IP; frontend just dispatches.
 */
const VERIFY_MFA_MUTATION = gql`
  mutation VerifyMfa($mfaToken: String!, $code: String!) {
    verifyMfa(mfaToken: $mfaToken, code: $code) {
      accessToken
      refreshToken
    }
  }
`;

/**
 * MFA portal fix: returned by `login()` when the SP user has MFA
 * enabled. The LoginForm renders a TOTP entry screen and submits
 * the code via `verifyMfa(challenge.mfaToken, code)`. Held in React
 * state only (never localStorage) — the mfaToken is a 5-minute
 * bearer for the exchange.
 */
export interface MfaChallenge {
  mfaToken: string;
}

/**
 * S19-STAB-5 — thrown by `login()` when the server refuses tokens
 * because the user's tenant tier mandates MFA and the 7-day grace
 * window has expired. The LoginForm catches this and surfaces a
 * dedicated "enrolment required" UI instead of the generic
 * "Invalid credentials" toast.
 */
export class MfaEnrollmentRequiredError extends Error {
  constructor() {
    super('MFA enrolment is required for this account.');
    this.name = 'MfaEnrollmentRequiredError';
  }
}

/**
 * S19-STAB-5 — localStorage key for the grace-window countdown.
 * Read by `MfaGraceBanner` on the portal layout; cleared on logout
 * or when the user successfully enrols MFA.
 */
export const MFA_GRACE_KEY = 'mfaGraceDaysRemaining';

const ME_QUERY = gql`
  query Me {
    me { id email name phone role { id name } }
  }
`;

const MY_TENANT_QUERY = gql`
  query MyTenant {
    myTenant { id name slug }
  }
`;

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Fetch tenant name in background after user is set
  const fetchTenantName = useCallback(async () => {
    try {
      const { data } = await apolloClient.query({
        query: MY_TENANT_QUERY,
        fetchPolicy: 'network-only',
      });
      if (data?.myTenant?.name) {
        localStorage.setItem('tenantName', data.myTenant.name);
        setUser((prev) => prev ? { ...prev, tenantName: data.myTenant.name } : prev);
      }
    } catch {
      // Non-critical, fail silently
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const payload = parseJwt(token);
      if (payload && Number(payload.exp) * 1000 > Date.now()) {
        setUser({
          userId: payload.sub as string,
          tenantId: payload.tenantId as string,
          tenantName: localStorage.getItem('tenantName') || undefined,
          role: payload.role as string,
          permissions: (payload.permissions as string[]) || [],
          email: payload.email as string | undefined,
          name: payload.name as string | undefined,
        });
      } else {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('tenantName');
      }
    }
    setLoading(false);
  }, []);

  // Fetch tenant name once user is available
  useEffect(() => {
    if (user && !user.tenantName) {
      fetchTenantName();
    }
  }, [user, fetchTenantName]);

  const login = useCallback(
    async (
      slug: string,
      email: string,
      password: string,
    ): Promise<MfaChallenge | null> => {
    const { data } = await apolloClient.mutate({
      mutation: LOGIN_MUTATION,
      variables: { slug, email, password },
    });

    const {
      accessToken,
      refreshToken,
      requiresMfaEnrollment,
      mfaGraceDaysRemaining,
      requiresMfa,
      mfaToken,
    } = data.loginBySlug;

    // MFA portal fix: SP user has MFA enabled and the backend
    // returned a short-lived MFA challenge token. Hand it back so
    // the LoginForm can render a TOTP entry screen and submit via
    // verifyMfa(mfaToken, code). The mfaToken is intentionally NOT
    // stored to localStorage — it's a one-use bearer.
    if (requiresMfa) {
      if (!mfaToken) {
        throw new Error(
          'Login response advertised requiresMfa=true but did not include an mfaToken.',
        );
      }
      return { mfaToken };
    }

    // MFA-lockout fix: the server now ALSO issues an `accessToken`
    // alongside `requiresMfaEnrollment: true` — the token is
    // scoped to `mfa_enrollment_only`, so the portal can authenticate
    // the user just enough to reach the MFA enrolment card and
    // unlock their account. Previously this branch threw and the
    // user had no recovery path (chicken-and-egg).
    //
    // We still surface the typed error to the LoginForm so the
    // "enrolment required" banner renders — but the LoginForm now
    // catches it and lets the redirect-to-profile happen WITHOUT
    // refusing the login.
    if (requiresMfaEnrollment) {
      // Store the restricted token. No refreshToken is issued for
      // an enrollment-only session — the user must complete the
      // enrolment within the access-token's lifetime or re-login.
      localStorage.setItem('accessToken', accessToken);
      localStorage.removeItem('refreshToken');
      // Stamp the grace countdown (negative for overdue) so any
      // future banner that surfaces "N days past due" reads it.
      if (typeof mfaGraceDaysRemaining === 'number') {
        localStorage.setItem(MFA_GRACE_KEY, String(mfaGraceDaysRemaining));
      }
      // Hydrate the user object from the JWT so subsequent route
      // guards see an authenticated user (just with `scope:
      // mfa_enrollment_only` on the JWT itself, which the server
      // enforces — the frontend doesn't need to police it).
      const enrollmentPayload = parseJwt(accessToken);
      if (enrollmentPayload) {
        setUser({
          userId: enrollmentPayload.sub as string,
          tenantId: enrollmentPayload.tenantId as string,
          role: enrollmentPayload.role as string,
          permissions: [],
          email: enrollmentPayload.email as string | undefined,
          name: enrollmentPayload.name as string | undefined,
        });
      }
      // The LoginForm catches this error and routes to the
      // enrolment card. Throw AFTER token storage so the redirect
      // target finds a valid session.
      throw new MfaEnrollmentRequiredError();
    }

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    // S19-STAB-5: persist the grace-window countdown so the portal-
    // layout banner can render it across navigations. The banner
    // clears the key once the user enrols (MFA status flips to
    // 'enrolled' on next login) or on logout.
    if (typeof mfaGraceDaysRemaining === 'number') {
      localStorage.setItem(MFA_GRACE_KEY, String(mfaGraceDaysRemaining));
    } else {
      localStorage.removeItem(MFA_GRACE_KEY);
    }

    const payload = parseJwt(accessToken);
    if (!payload) throw new Error('Invalid token');

    setUser({
      userId: payload.sub as string,
      tenantId: payload.tenantId as string,
      role: payload.role as string,
      permissions: (payload.permissions as string[]) || [],
      email: payload.email as string | undefined,
      name: payload.name as string | undefined,
    });

    router.push('/dashboard');
    return null;
  }, [router]);

  /**
   * MFA portal fix: redeem the in-progress mfaToken + TOTP/backup
   * code for a full tenant session. Mirrors the post-login
   * hydration: stores both tokens, parses JWT, sets the user,
   * redirects to /dashboard. Refreshes any persisted grace
   * countdown so the banner refreshes for the now-enrolled user
   * (on a normal MFA-enabled login the grace key shouldn't be
   * relevant — defensive: clear it).
   */
  const verifyMfa = useCallback(
    async (mfaToken: string, code: string): Promise<void> => {
      const { data } = await apolloClient.mutate({
        mutation: VERIFY_MFA_MUTATION,
        variables: { mfaToken, code },
      });
      const { accessToken, refreshToken } = data.verifyMfa;
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      // The user has just completed MFA — they're enrolled,
      // therefore not in grace. Drop any stale countdown.
      localStorage.removeItem(MFA_GRACE_KEY);

      const payload = parseJwt(accessToken);
      if (!payload) throw new Error('Invalid token');
      setUser({
        userId: payload.sub as string,
        tenantId: payload.tenantId as string,
        role: payload.role as string,
        permissions: (payload.permissions as string[]) || [],
        email: payload.email as string | undefined,
        name: payload.name as string | undefined,
      });
      router.push('/dashboard');
    },
    [router],
  );

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tenantName');
    // S19-STAB-5: drop the grace countdown so the banner doesn't
    // re-appear on the next user's login.
    localStorage.removeItem(MFA_GRACE_KEY);
    setUser(null);
    router.push('/login');
  }, [router]);

  const hasPermission = useCallback((permission: string) => {
    if (!user) return false;
    if (user.permissions.includes('*')) return true;
    return user.permissions.includes(permission);
  }, [user]);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await apolloClient.query({
        query: ME_QUERY,
        fetchPolicy: 'network-only',
      });
      if (data?.me) {
        setUser((prev) => prev ? {
          ...prev,
          name: data.me.name || prev.name,
          email: data.me.email || prev.email,
        } : prev);
      }
    } catch {
      // Silently fail
    }
  }, []);

  return React.createElement(AuthContext.Provider, { value: { user, loading, login, verifyMfa, logout, hasPermission, refreshUser } }, children);
}

export function useAuth() {
  return useContext(AuthContext);
}
