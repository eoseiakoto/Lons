'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Providers } from '../providers';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { useAuth } from '@/lib/auth-context';
import { MobileNavProvider, useMobileNav } from '@/lib/mobile-nav-context';

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page">
        <div className="flex items-center gap-2 text-sm text-[color:var(--text-secondary)]">
          <div
            className="w-4 h-4 rounded-full animate-spin"
            style={{
              border: '2px solid var(--border-default)',
              borderTopColor: 'var(--accent-primary)',
            }}
          />
          Loading...
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <MobileNavProvider>
      <LayoutShell>{children}</LayoutShell>
    </MobileNavProvider>
  );
}

function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { open, close } = useMobileNav();

  return (
    <div className="relative flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-[color:var(--bg-elevated)] focus:text-[color:var(--text-primary)] focus:shadow-[var(--shadow-elevated)] focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-primary-ring)]"
      >
        Skip to main content
      </a>
      <PageBackdrop />
      <Sidebar />
      {open && (
        <button
          aria-label="Close menu"
          onClick={close}
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
        />
      )}
      <div className="relative flex-1 flex flex-col min-w-0">
        <Header />
        <main
          id="main-content"
          key={pathname}
          tabIndex={-1}
          className="flex-1 overflow-y-auto focus:outline-none"
        >
          <div className="w-full mx-auto max-w-[2200px] px-4 sm:px-6 md:px-8 lg:px-10 2xl:px-14 py-6 md:py-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
    </Providers>
  );
}
