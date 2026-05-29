'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apolloClient } from './apollo-client';
import { gql } from '@apollo/client';

interface User {
  userId: string;
  role: string;
  type: string;
  email?: string;
  name?: string;
}

/**
 * MFA portal fix: state describing the in-progress MFA challenge.
 * Stored ONLY in React state (never localStorage) — the mfaToken is
 * a 5-minute, one-use bearer for the TOTP/backup-code exchange. The
 * email is held only so the challenge screen can render "Signed in
 * as ..." copy without re-prompting.
 */
export interface MfaChallenge {
  mfaToken: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /**
   * Submit email + password. Resolves to:
   *   - `null` when login completes normally (tokens stored, redirect fired);
   *   - an `MfaChallenge` when the account has MFA enabled and the caller
   *     must prompt for a TOTP code. The caller passes the challenge to
   *     `verifyMfa(challenge.mfaToken, code)` to complete login.
   */
  login: (email: string, password: string) => Promise<MfaChallenge | null>;
  /**
   * Exchange a valid MFA token + TOTP/backup code for a full session.
   * Throws on invalid/expired token or wrong code.
   */
  verifyMfa: (mfaToken: string, code: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => null,
  verifyMfa: async () => {},
  logout: () => {},
});

const LOGIN_MUTATION = gql`
  mutation LoginPlatformUser($email: String!, $password: String!) {
    loginPlatformUser(email: $email, password: $password) {
      accessToken
      refreshToken
      requiresMfa
      mfaToken
    }
  }
`;

/**
 * MFA portal fix: redeem a one-time MFA challenge token for a full
 * access+refresh pair. Backend rate-limits this at 5 attempts per
 * 5 minutes per token AND per IP (see verifyMfa resolver +
 * AuthService.verifyMfaAndLogin); the frontend just dispatches.
 */
const VERIFY_MFA_MUTATION = gql`
  mutation VerifyMfa($mfaToken: String!, $code: String!) {
    verifyMfa(mfaToken: $mfaToken, code: $code) {
      accessToken
      refreshToken
    }
  }
`;

function parseJwt(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/**
 * Hydrate the auth state from a fresh access token: parse JWT, refuse
 * tokens that lack a role claim (P0-003 invariant — never silently
 * elevate to platform_admin), persist tokens, set the user object.
 *
 * Shared between the normal login flow and the post-MFA-verify flow
 * so neither path can drift away from the role-claim guard.
 */
function hydrateSession(
  accessToken: string,
  refreshToken: string,
  setUser: (u: User) => void,
): User {
  const payload = parseJwt(accessToken);
  // P0-003 fix: refuse a token that lacks a role claim. The login
  // mutation is supposed to issue role-bearing tokens; if it
  // doesn't, that's a platform bug — we'd rather the user see an
  // error than be silently granted admin.
  if (!payload?.role || typeof payload.role !== 'string') {
    throw new Error('Server returned a token without a role claim. Please contact support.');
  }
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  const u: User = {
    userId: payload.sub,
    role: payload.role,
    type: payload.type || 'platform',
    email: payload.email,
    name: payload.name,
  };
  setUser(u);
  return u;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const payload = parseJwt(token);
      // P0-003 fix: never default the role to `platform_admin`.
      // Previously, a token without a `role` claim was silently
      // elevated, which means a mis-issued token could grant
      // cross-tenant admin. Now we reject the session entirely and
      // force a fresh login.
      if (
        payload &&
        Number(payload.exp) * 1000 > Date.now() &&
        typeof payload.role === 'string' &&
        payload.role.length > 0
      ) {
        setUser({
          userId: payload.sub,
          role: payload.role,
          type: payload.type || 'platform',
          email: payload.email,
          name: payload.name,
        });
      } else {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<MfaChallenge | null> => {
      const { data } = await apolloClient.mutate({
        mutation: LOGIN_MUTATION,
        variables: { email, password },
      });

      const { accessToken, refreshToken, requiresMfa, mfaToken } =
        data.loginPlatformUser;

      // MFA portal fix: if the platform admin has MFA enabled, the
      // backend returns { requiresMfa: true, mfaToken } and NO
      // access/refresh tokens. Hand the challenge back to the
      // caller — the LoginForm renders a TOTP screen and submits
      // the code via verifyMfa(). The mfaToken is short-lived
      // (5 min) and intentionally NOT persisted to localStorage.
      if (requiresMfa) {
        if (!mfaToken) {
          throw new Error(
            'Login response advertised requiresMfa=true but did not include an mfaToken.',
          );
        }
        return { mfaToken, email };
      }

      hydrateSession(accessToken, refreshToken, setUser);
      router.push('/dashboard');
      return null;
    },
    [router],
  );

  const verifyMfa = useCallback(
    async (mfaToken: string, code: string): Promise<void> => {
      const { data } = await apolloClient.mutate({
        mutation: VERIFY_MFA_MUTATION,
        variables: { mfaToken, code },
      });
      const { accessToken, refreshToken } = data.verifyMfa;
      hydrateSession(accessToken, refreshToken, setUser);
      router.push('/dashboard');
    },
    [router],
  );

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    router.push('/login');
  }, [router]);

  return React.createElement(
    AuthContext.Provider,
    { value: { user, loading, login, verifyMfa, logout } },
    children,
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
