'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, LayoutGroup } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Building2,
  BarChart3,
  Server,
  Settings,
  LogOut,
  MessageSquareText,
  ShieldAlert,
  Shield,
  UserCircle,
  ChevronUp,
  Sun,
  Moon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useMobileNav } from '@/lib/mobile-nav-context';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Tenants', href: '/tenants', icon: Building2 },
  { name: 'AML Screening', href: '/screening', icon: Shield },
  { name: 'Analytics', href: '/analytics/scoring', icon: BarChart3 },
  { name: 'Feedback', href: '/feedback', icon: MessageSquareText },
  { name: 'System', href: '/system', icon: Server },
  { name: 'Compliance', href: '/compliance', icon: ShieldAlert },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { open: mobileOpen } = useMobileNav();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const initials = (user?.name || user?.email || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <aside
      className={cn(
        'fixed md:relative inset-y-0 left-0 z-40 flex flex-col w-64 h-full shrink-0 backdrop-blur-2xl transition-transform duration-300 ease-out md:translate-x-0',
        mobileOpen ? 'translate-x-0' : '-translate-x-full',
      )}
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-sidebar) 70%, transparent)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Brand */}
      <div className="px-5 py-5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-tertiary))',
              letterSpacing: '-0.02em',
            }}
          >
            L
          </div>
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-[color:var(--text-primary)] leading-none">
              Lōns
            </h1>
            <p className="text-[11px] text-[color:var(--text-tertiary)] mt-1 leading-none">
              Platform
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 py-4 px-3 overflow-y-auto">
        <LayoutGroup id="platform-sidebar-nav">
        {navigation.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 px-3 py-2 rounded-lg mb-0.5 text-sm font-medium transition-colors duration-150',
                isActive ? 'text-[color:var(--accent-primary-deep)] font-semibold' : 'nav-item',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="platform-sidebar-active-pill"
                  className="absolute inset-0 rounded-lg"
                  style={{ backgroundColor: 'var(--accent-primary-soft)' }}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <item.icon
                className={cn(
                  'relative w-[18px] h-[18px] flex-shrink-0',
                  isActive && 'text-[color:var(--accent-primary)]',
                )}
              />
              <span className="relative">{item.name}</span>
            </Link>
          );
        })}
        </LayoutGroup>
      </nav>

      {/* Theme toggle */}
      <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <button
          onClick={toggleTheme}
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
        >
          {theme === 'dark' ? (
            <Moon className="w-[18px] h-[18px] flex-shrink-0" />
          ) : (
            <Sun className="w-[18px] h-[18px] flex-shrink-0" />
          )}
          <span className="flex-1 text-left">Theme</span>
          <span
            className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            style={{
              backgroundColor: theme === 'dark' ? 'var(--accent-primary)' : 'var(--bg-muted)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <span
              className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform"
              style={{
                transform: theme === 'dark' ? 'translateX(18px)' : 'translateX(2px)',
              }}
            />
          </span>
        </button>
      </div>

      {/* User section */}
      <div
        className="relative p-3"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
        ref={menuRef}
      >
        {menuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-2 card-elevated rounded-xl overflow-hidden z-50 animate-[fadeIn_0.15s_ease-out]">
            <div className="px-4 pt-4 pb-3">
              <p className="text-xs text-[color:var(--text-tertiary)] truncate">{user?.email}</p>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => { router.push('/settings/profile'); setMenuOpen(false); }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
              >
                <UserCircle className="w-4 h-4" />
                My Profile
              </button>
              <button
                onClick={() => { router.push('/settings'); setMenuOpen(false); }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => { logout(); setMenuOpen(false); }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-[color:var(--status-error-text)] hover:bg-[color:var(--status-error-soft)] transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((prev) => !prev)}
          className="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-[color:var(--bg-hover)] transition-colors group"
        >
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-semibold flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-tertiary))',
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium text-[color:var(--text-primary)] truncate">
              {user?.name || user?.email || 'User'}
            </div>
            <div className="text-xs text-[color:var(--text-tertiary)] capitalize truncate">
              {user?.role?.replace(/_/g, ' ')}
            </div>
          </div>
          <ChevronUp
            className={cn(
              'w-4 h-4 text-[color:var(--text-tertiary)] transition-transform duration-200 flex-shrink-0',
              menuOpen ? 'rotate-0' : 'rotate-180',
            )}
          />
        </button>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </aside>
  );
}
