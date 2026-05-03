'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { gql, useQuery } from '@apollo/client';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useMobileNav } from '@/lib/mobile-nav-context';
import { Search, Bell, Mail, X, FileText, Users, AlertTriangle, Menu } from 'lucide-react';

const pageTitleKeys: Record<string, string> = {
  '/dashboard': 'nav.dashboard',
  '/products': 'nav.products',
  '/customers': 'nav.customers',
  '/loans/contracts': 'nav.loans',
  '/loans/applications': 'nav.loans',
  '/collections': 'nav.collections',
  '/messages': 'nav.messages',
  '/reports': 'nav.reports',
  '/settings': 'sidebar.settings',
};

function getPageTitleKey(pathname: string): string {
  for (const [path, key] of Object.entries(pageTitleKeys)) {
    if (pathname.startsWith(path)) return key;
  }
  return 'nav.dashboard';
}

const NOTIFICATION_COUNTS = gql`
  query NotificationCounts {
    collectionsMetrics {
      overdueCount
      delinquentCount
      defaultCount
    }
  }
`;

const SEARCH_CUSTOMERS = gql`
  query SearchCustomers($pagination: PaginationInput) {
    customers(pagination: $pagination) {
      edges { node { id fullName phonePrimary status } }
    }
  }
`;

const SEARCH_CONTRACTS = gql`
  query SearchContracts($pagination: PaginationInput) {
    contracts(pagination: $pagination) {
      edges { node { id contractNumber status totalOutstanding currency daysPastDue } }
    }
  }
`;

const UNREAD_MESSAGE_COUNT = gql`
  query UnreadMessageCount {
    unreadMessageCount
  }
`;

interface SearchResult {
  id: string;
  type: 'customer' | 'contract';
  title: string;
  subtitle: string;
  href: string;
}

export function Header() {
  const { user } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { toggle: toggleMobileNav } = useMobileNav();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: notifData } = useQuery(NOTIFICATION_COUNTS, { pollInterval: 60000 });
  const { data: unreadMsgData } = useQuery(UNREAD_MESSAGE_COUNT, { pollInterval: 30000 });
  const unreadMsgCount = unreadMsgData?.unreadMessageCount || 0;

  const { data: custData } = useQuery(SEARCH_CUSTOMERS, {
    variables: { pagination: { first: 50 } },
    skip: !searchOpen,
  });
  const { data: contractData } = useQuery(SEARCH_CONTRACTS, {
    variables: { pagination: { first: 50 } },
    skip: !searchOpen,
  });

  const metrics = notifData?.collectionsMetrics;
  const totalNotifs =
    (metrics?.overdueCount || 0) + (metrics?.delinquentCount || 0) + (metrics?.defaultCount || 0);

  const searchResults: SearchResult[] = [];
  if (searchQuery.trim().length > 0) {
    const q = searchQuery.toLowerCase();
    const customers =
      custData?.customers?.edges?.map(
        (e: { node: { id: string; fullName?: string; phonePrimary?: string; status: string } }) => e.node,
      ) || [];
    for (const c of customers) {
      if (
        (c.fullName && c.fullName.toLowerCase().includes(q)) ||
        (c.phonePrimary && c.phonePrimary.includes(q))
      ) {
        searchResults.push({
          id: c.id,
          type: 'customer',
          title: c.fullName || 'Unknown',
          subtitle: c.phonePrimary || c.status,
          href: `/customers/${c.id}`,
        });
      }
    }
    const contracts =
      contractData?.contracts?.edges?.map(
        (e: { node: { id: string; contractNumber: string; status: string; totalOutstanding?: string; currency?: string; daysPastDue?: number } }) => e.node,
      ) || [];
    for (const c of contracts) {
      if (c.contractNumber.toLowerCase().includes(q)) {
        searchResults.push({
          id: c.id,
          type: 'contract',
          title: c.contractNumber,
          subtitle: `${c.status} ${c.totalOutstanding ? `- ${c.currency} ${Number(c.totalOutstanding).toLocaleString()}` : ''}`,
          href: `/loans/contracts/${c.id}`,
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
      {/* Left — hamburger (mobile) + page title + tenant */}
      <div className="flex items-baseline gap-3 min-w-0">
        <button
          onClick={toggleMobileNav}
          aria-label="Open menu"
          className="md:hidden -ml-1 p-2 rounded-lg text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors self-center"
        >
          <Menu className="w-[18px] h-[18px]" />
        </button>
        <h2 className="text-[15px] font-semibold tracking-tight text-[color:var(--text-primary)] truncate">
          {t(getPageTitleKey(pathname))}
        </h2>
        {user?.tenantName && (
          <>
            <span className="text-[color:var(--text-tertiary)] hidden sm:inline">·</span>
            <span className="text-[13px] text-[color:var(--text-secondary)] hidden sm:inline truncate">{user.tenantName}</span>
          </>
        )}
      </div>

      {/* Right — search + notifications */}
      <div className="flex items-center gap-1.5">
        {/* Search */}
        <div className="relative" ref={searchRef}>
          <button
            onClick={() => { setSearchOpen((prev) => !prev); setNotifOpen(false); }}
            className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg text-sm text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden md:inline">{t('header.search')}</span>
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
                  placeholder={t('header.searchPlaceholder')}
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
                    {t('header.typeToSearch')}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[color:var(--text-tertiary)]">
                    {t('header.noResults')}
                  </div>
                ) : (
                  searchResults.slice(0, 10).map((r) => (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => { router.push(r.href); setSearchOpen(false); setSearchQuery(''); }}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-[color:var(--bg-hover)] transition-colors"
                    >
                      {r.type === 'customer' ? (
                        <Users
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: 'var(--status-info)' }}
                        />
                      ) : (
                        <FileText
                          className="w-4 h-4 flex-shrink-0"
                          style={{ color: 'var(--status-success)' }}
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-[color:var(--text-primary)] truncate">{r.title}</div>
                        <div className="text-xs text-[color:var(--text-tertiary)] truncate">{r.subtitle}</div>
                      </div>
                      <span className="ml-auto text-[10px] text-[color:var(--text-tertiary)] uppercase tracking-wider flex-shrink-0">
                        {t(`header.${r.type}`)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Messages */}
        <button
          onClick={() => router.push('/messages')}
          className="relative p-2 rounded-lg text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
          title={t('nav.messages') || 'Messages'}
        >
          <Mail className="w-[18px] h-[18px]" />
          {unreadMsgCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-[16px] flex items-center justify-center px-1 text-[10px] font-bold text-white rounded-full"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
            </span>
          )}
        </button>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen((prev) => !prev); setSearchOpen(false); }}
            className="relative p-2 rounded-lg text-[color:var(--text-secondary)] hover:bg-[color:var(--bg-hover)] hover:text-[color:var(--text-primary)] transition-colors"
          >
            <Bell className="w-[18px] h-[18px]" />
            {totalNotifs > 0 && (
              <span
                className="absolute top-1 right-1 min-w-[16px] h-[16px] flex items-center justify-center px-1 text-[10px] font-bold text-white rounded-full"
                style={{ backgroundColor: 'var(--status-error)' }}
              >
                {totalNotifs > 99 ? '99+' : totalNotifs}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 card-elevated z-50 overflow-hidden">
              <div
                className="px-4 py-3"
                style={{ borderBottom: '1px solid var(--border-subtle)' }}
              >
                <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">
                  {t('header.alerts')}
                </h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {totalNotifs === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[color:var(--text-tertiary)]">
                    {t('header.noAlerts')}
                  </div>
                ) : (
                  <>
                    {(metrics?.overdueCount || 0) > 0 && (
                      <button
                        onClick={() => { router.push('/collections'); setNotifOpen(false); }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[color:var(--bg-hover)] transition-colors"
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'var(--status-warning-soft)' }}
                        >
                          <AlertTriangle
                            className="w-4 h-4"
                            style={{ color: 'var(--status-warning)' }}
                          />
                        </div>
                        <div className="text-left">
                          <div className="text-sm text-[color:var(--text-primary)] font-medium">
                            {metrics.overdueCount} {t('header.overdue')}
                          </div>
                          <div className="text-xs text-[color:var(--text-tertiary)]">
                            {t('header.overdueDesc')}
                          </div>
                        </div>
                      </button>
                    )}
                    {(metrics?.delinquentCount || 0) > 0 && (
                      <button
                        onClick={() => { router.push('/collections'); setNotifOpen(false); }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[color:var(--bg-hover)] transition-colors"
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'var(--accent-primary-soft)' }}
                        >
                          <AlertTriangle
                            className="w-4 h-4"
                            style={{ color: 'var(--accent-primary)' }}
                          />
                        </div>
                        <div className="text-left">
                          <div className="text-sm text-[color:var(--text-primary)] font-medium">
                            {metrics.delinquentCount} {t('header.delinquent')}
                          </div>
                          <div className="text-xs text-[color:var(--text-tertiary)]">
                            {t('header.delinquentDesc')}
                          </div>
                        </div>
                      </button>
                    )}
                    {(metrics?.defaultCount || 0) > 0 && (
                      <button
                        onClick={() => { router.push('/collections'); setNotifOpen(false); }}
                        className="flex items-center gap-3 w-full px-4 py-3 hover:bg-[color:var(--bg-hover)] transition-colors"
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ backgroundColor: 'var(--status-error-soft)' }}
                        >
                          <AlertTriangle
                            className="w-4 h-4"
                            style={{ color: 'var(--status-error)' }}
                          />
                        </div>
                        <div className="text-left">
                          <div className="text-sm text-[color:var(--text-primary)] font-medium">
                            {metrics.defaultCount} {t('header.default')}
                          </div>
                          <div className="text-xs text-[color:var(--text-tertiary)]">
                            {t('header.defaultDesc')}
                          </div>
                        </div>
                      </button>
                    )}
                  </>
                )}
              </div>
              <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  onClick={() => { router.push('/collections'); setNotifOpen(false); }}
                  className="w-full px-4 py-2.5 text-xs font-medium hover:bg-[color:var(--bg-hover)] transition-colors text-center"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  {t('header.viewAll')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
