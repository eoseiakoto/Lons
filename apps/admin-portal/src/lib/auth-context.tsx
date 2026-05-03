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
  login: (tenantId: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  hasPermission: () => false,
  refreshUser: async () => {},
});

const LOGIN_MUTATION = gql`
  mutation LoginBySlug($slug: String!, $email: String!, $password: String!) {
    loginBySlug(slug: $slug, email: $email, password: $password) {
      accessToken
      refreshToken
    }
  }
`;

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

  const login = useCallback(async (slug: string, email: string, password: string) => {
    const { data } = await apolloClient.mutate({
      mutation: LOGIN_MUTATION,
      variables: { slug, email, password },
    });

    const { accessToken, refreshToken } = data.loginBySlug;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

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
  }, [router]);

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tenantName');
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

  return React.createElement(AuthContext.Provider, { value: { user, loading, login, logout, hasPermission, refreshUser } }, children);
}

export function useAuth() {
  return useContext(AuthContext);
}
