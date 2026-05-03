'use client';

import { ApolloClient, InMemoryCache, createHttpLink, ApolloProvider as BaseApolloProvider } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import { onError } from '@apollo/client/link/error';
import React from 'react';

const httpLink = createHttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : '',
    },
  };
});

const errorLink = onError(({ graphQLErrors, networkError }) => {
  const isAuthError =
    graphQLErrors?.some(
      (e) =>
        e.extensions?.code === 'UNAUTHENTICATED' ||
        e.message?.toLowerCase().includes('invalid or expired token') ||
        e.message?.toLowerCase().includes('unauthorized'),
    ) ||
    (networkError && 'statusCode' in networkError && networkError.statusCode === 401);

  if (isAuthError && typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = '/login';
  }
});

export const apolloClient = new ApolloClient({
  link: errorLink.concat(authLink.concat(httpLink)),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
});

export function ApolloProvider({ children }: { children: React.ReactNode }) {
  return <BaseApolloProvider client={apolloClient}>{children}</BaseApolloProvider>;
}
