'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apolloClient } from './apollo-client';
import { gql } from '@apollo/client';

interface User {
  userId: string;
  role: string;
  type: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

const LOGIN_MUTATION = gql`
  mutation LoginPlatformUser($email: String!, $password: String!) {
    loginPlatformUser(email: $email, password: $password) {
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      const payload = parseJwt(token);
      if (payload && Number(payload.exp) * 1000 > Date.now()) {
        setUser({
          userId: payload.sub,
          role: payload.role || 'platform_admin',
          type: payload.type || 'platform',
        });
      } else {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await apolloClient.mutate({
      mutation: LOGIN_MUTATION,
      variables: { email, password },
    });

    const { accessToken, refreshToken } = data.loginPlatformUser;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    const payload = parseJwt(accessToken);
    setUser({
      userId: payload.sub,
      role: payload.role || 'platform_admin',
      type: payload.type || 'platform',
    });

    router.push('/dashboard');
  }, [router]);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    router.push('/login');
  }, [router]);

  return React.createElement(AuthContext.Provider, { value: { user, loading, login, logout } }, children);
}

export function useAuth() {
  return useContext(AuthContext);
}
