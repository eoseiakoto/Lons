'use client';

import { MotionConfig } from 'framer-motion';
import { ApolloProvider } from '@/lib/apollo-client';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ApolloProvider>
          <AuthProvider>{children}</AuthProvider>
        </ApolloProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
