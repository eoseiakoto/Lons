'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { gql, useQuery } from '@apollo/client';
import { Search, Bell, Mail, X, Building2, Menu } from 'lucide-react';
import { useMobileNav } from '@/lib/mobile-nav-context';

const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/tenants': 'Tenants',
  '/messages': 'Messages',
  '/feedback': 'Feedback',
  '/system': 'System Health',
  '/settings': 'Settings',
  '/analytics': 'Analytics',
  '/screening': 'AML Screening',
  '/compliance': 'Compliance',
};

function getPageTitle(pathname: string): string {
  for (const [path, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(path)) return title;
  }
  return 'Dashboard';
}

const UNREAD_MESSAGE_COUNT = gql`
  query UnreadMessageCount {
    unreadMessageCount
  }
`;

const SEARCH_TENANTS = gql`
  query SearchTenants {
    tenants {
      items {
        id
        name
        slug
        status
      }
    }
  }
`;

interface SearchResult {
  id: string;
  type: 'tenant';
  title: string;
  subtitle: string;
  href: string;
}

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { toggle: toggleMobileNav } = useMobileNav();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: unreadData } = useQuery(UNREAD_MESSAGE_COUNT, { pollInterval: 30000 });
  const { data: tenantData } = useQuery(SEARCH_TENANTS, { skip: !searchOpen });

  const unreadCount = unreadData?.unreadMessageCount || 0;

  const searchResults: SearchResult[] = [];
  if (searchQuery.trim().length > 0) {
    const q = searchQuery.toLowerCase();
    const tenants = tenantData?.tenants?.items || [];
    for (const t of tenants) {
      if (
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.slug && t.slug.toLowerCase().includes(q))
      ) {
        searchResults.push({
          id: t.id,
          type: 'tenant',
          title: t.name,
          subtitle: t.slug || t.status,
          href: `/tenants/${t.id}`,
        });
      }
    }
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (searchOpen && inputRef.current) inputRef.current.focus();
  }, [searchOpen]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      setSearchOpen((prev) => !prev);
    }
    if (e.key === 'Escape') {
      setSearchOpen(false);
      setNotifOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <header
      className="relative z-40 px-4 sm:px-6 h-14 flex items-center justify-between shrink-0 backdrop-blur-2xl gap-3"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-page) 70%, transparent)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={toggleMobileNav}
          aria-label="Open menu"
          className="md:hidden -ml-1 p-2 rounded-lg text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
        >
          <Menu className="w-[18px] h-[18px]" />
        </button>
        <h2 className="text-[15px] font-semibold tracking-tight text-[color:var(--text-primary)] truncate">
          {getPageTitle(pathname)}
        </h2>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Search */}
        <div className="relative" ref={searchRef}>
          <button
            onClick={() => { setSearchOpen((prev) => !prev); setNotifOpen(false); }}
            className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Search</span>
            <kbd
              className="hidden md:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-[color:var(--text-tertiary)] rounded ml-1"
              style={{
                backgroundColor: 'var(--bg-muted)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span className="text-xs">&#8984;</span>K
            </kbd>
          </button>

          {searchOpen && (
            <div className="absolute right-0 top-full mt-2 w-96 card-elevated z-50 overflow-hidden">
              <div
                className="flex items-center gap-2 px-4 py-3"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <Search className="w-4 h-4 text-[color:var(--text-tertiary)]" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-[color:var(--text-primary)] placeholder:text-[color:var(--text-tertiary)] outline-none"
                  placeholder="Search tenants..."
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {searchQuery.trim().length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[color:var(--text-tertiary)]">
                    Type to search tenants...
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[color:var(--text-tertiary)]">
                    No results found
                  </div>
                ) : (
                  searchResults.slice(0, 10).map((r) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => { router.push(r.href); setSearchOpen(false); setSearchQuery(''); }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-[color:var(--bg-hover)] transition-colors"
                    >
                      <Building2
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: 'var(--accent-primary)' }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-[color:var(--text-primary)] truncate">{r.title}</div>
                        <div className="text-xs text-[color:var(--text-tertiary)] truncate">{r.subtitle}</div>
                      </div>
                      <span className="ml-auto text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-wider flex-shrink-0">
                        Tenant
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        <Link
          href="/messages"
          className="relative p-2 rounded-lg text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
          title="Messages"
        >
          <Mail className="w-[18px] h-[18px]" />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-[16px] flex items-center justify-center px-1 text-[10px] font-bold text-white rounded-full"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen((prev) => !prev); setSearchOpen(false); }}
            className="relative p-2 rounded-lg text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
          >
            <Bell className="w-[18px] h-[18px]" />
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 card-elevated z-50 overflow-hidden">
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">Notifications</h3>
              </div>
              <div className="px-4 py-8 text-center text-sm text-[color:var(--text-tertiary)]">
                No new notifications
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
