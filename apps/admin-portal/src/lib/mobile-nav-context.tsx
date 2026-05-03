'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

interface MobileNavValue {
  open: boolean;
  toggle: () => void;
  close: () => void;
}

const MobileNavContext = createContext<MobileNavValue | null>(null);

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <MobileNavContext.Provider value={{ open, toggle, close }}>
      {children}
    </MobileNavContext.Provider>
  );
}

export function useMobileNav(): MobileNavValue {
  const ctx = useContext(MobileNavContext);
  if (!ctx) {
    return { open: false, toggle: () => {}, close: () => {} };
  }
  return ctx;
}
