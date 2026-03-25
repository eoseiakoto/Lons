'use client';

import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/products': 'Products',
  '/customers': 'Customers',
  '/loans/contracts': 'Contracts',
  '/loans/applications': 'Applications',
  '/collections': 'Collections',
  '/reports': 'Reports',
  '/settings': 'Settings',
};

function getPageTitle(pathname: string): string {
  for (const [path, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(path)) return title;
  }
  return 'Dashboard';
}

export function Header() {
  const { user } = useAuth();
  const pathname = usePathname();

  return (
    <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-3 flex items-center justify-between">
      <h2 className="text-lg font-semibold text-white/80">{getPageTitle(pathname)}</h2>
      <div className="flex items-center space-x-4">
        <span className="text-sm text-white/40 capitalize">{user?.role}</span>
        <div className="w-8 h-8 bg-blue-500/80 rounded-full flex items-center justify-center text-white text-sm font-medium border border-blue-400/30">
          {user?.userId?.charAt(0)?.toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  );
}
