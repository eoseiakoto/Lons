'use client';

import { ApolloProvider } from '@/lib/apollo-client';
import { AuthProvider } from '@/lib/auth-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApolloProvider>
      <AuthProvider>{children}</AuthProvider>
    </ApolloProvider>
  );
}
