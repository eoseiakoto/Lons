'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Package,
  Users,
  FileText,
  AlertTriangle,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Customers', href: '/customers', icon: Users },
  { name: 'Loans', href: '/loans/contracts', icon: FileText },
  { name: 'Collections', href: '/collections', icon: AlertTriangle },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { logout, user } = useAuth();

  return (
    <div className="flex flex-col w-64 bg-white/5 backdrop-blur-2xl border-r border-white/10 min-h-screen">
      <div className="p-5 border-b border-white/10">
        <h1 className="text-xl font-bold text-white tracking-tight">Lons</h1>
        <p className="text-xs text-white/30 mt-0.5">Admin Portal</p>
      </div>

      <nav className="flex-1 py-3 px-2">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-0.5 transition-all duration-200',
                isActive
                  ? 'bg-white/15 text-white border-l-2 border-blue-400'
                  : 'text-white/60 hover:bg-white/10 hover:text-white',
              )}
            >
              <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="text-xs text-white/30 mb-1">{user?.userId}</div>
        <div className="text-xs text-white/50 mb-3 capitalize">{user?.role}</div>
        <button
          onClick={logout}
          className="flex items-center text-white/40 hover:text-white text-sm w-full transition-colors duration-200"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </button>
      </div>
    </div>
  );
}
