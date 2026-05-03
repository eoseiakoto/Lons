'use client';

import { MotionConfig } from 'framer-motion';
import { ApolloProvider } from '@/lib/apollo-client';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { ToastProvider } from '@/components/ui/toast';
import { I18nProvider } from '@/lib/i18n/i18n-context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <I18nProvider>
          <ApolloProvider>
            <AuthProvider>
              <ToastProvider>{children}</ToastProvider>
            </AuthProvider>
          </ApolloProvider>
        </I18nProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
