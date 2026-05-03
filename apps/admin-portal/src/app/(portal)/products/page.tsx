'use client';

import { useMemo, useState } from 'react';
import { gql, useQuery } from '@apollo/client';
import { useRouter } from 'next/navigation';
import {
  Package,
  Plus,
  Filter,
  Search,
  ArrowUpRight,
  CheckCircle2,
  PauseCircle,
  PenLine,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';

const PRODUCTS_QUERY = gql`
  query Products($pagination: PaginationInput) {
    products(pagination: $pagination) {
      edges {
        node {
          id
          code
          name
          type
          currency
          status
          interestRate
          maxActiveLoans
          version
          createdAt
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface Product {
  id: string;
  code: string;
  name: string;
  type: string;
  currency: string;
  status: string;
  interestRate?: number;
  maxActiveLoans?: number;
  version?: number;
  createdAt: string;
}

const TYPE_COLOR: Record<string, string> = {
  micro_loan: 'var(--accent-primary)',
  overdraft: 'var(--accent-secondary)',
  bnpl: 'var(--status-info)',
  invoice_factoring: 'var(--accent-primary-deep)',
};

export default function ProductsPage() {
  const router = useRouter();
  const { t } = useI18n();
  const typeLabel = (type: string) => t(`products.typeLabel.${type}`) || type.replace(/_/g, ' ');
  const { data, loading } = useQuery(PRODUCTS_QUERY, {
    variables: { pagination: { first: 100 } },
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const products: Product[] = data?.products?.edges?.map((e: any) => e.node) || [];

  const stats = useMemo(() => {
    const active = products.filter((p) => p.status === 'active').length;
    const draft = products.filter((p) => p.status === 'draft').length;
    const suspended = products.filter((p) => p.status === 'suspended').length;
    const types = new Set(products.map((p) => p.type)).size;
    return { active, draft, suspended, types };
  }, [products]);

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      p.name?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q);
    const matchesStatus = !statusFilter || p.status === statusFilter;
    const matchesType = !typeFilter || p.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const filtersActive = Boolean(search || statusFilter || typeFilter);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.productCatalog')}
        title={t('products.title')}
        subtitle={t('products.list.subtitle')}
        actions={
          <button onClick={() => router.push('/products/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            {t('products.createProduct')}
          </button>
        }
      />

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title={t('products.list.kpi.totalProducts')}
          value={loading ? '—' : products.length}
          subtitle={t('products.list.kpi.typesCount', { count: stats.types })}
          icon={<Package className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title={t('common.active')}
          value={loading ? '—' : stats.active}
          subtitle={t('products.list.kpi.percentLive', { percent: products.length > 0 ? Math.round((stats.active / products.length) * 100) : 0 })}
          icon={<CheckCircle2 className="w-4 h-4" />}
          live={stats.active > 0}
        />
        <MetricCard
          variant="glow"
          title={t('products.list.kpi.draft')}
          value={loading ? '—' : stats.draft}
          subtitle={t('products.list.kpi.draftSubtitle')}
          icon={<PenLine className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title={t('products.list.kpi.suspended')}
          value={loading ? '—' : stats.suspended}
          subtitle={t('products.list.kpi.suspendedSubtitle')}
          icon={<PauseCircle className="w-4 h-4" />}
        />
      </section>

      {/* Filters */}
      <section className="relative z-10 flex flex-wrap items-center gap-2">
        <div className="relative flex-shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[color:var(--text-tertiary)] pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg pl-9 pr-3 py-1.5 text-[13px] focus:outline-none transition-colors w-72"
            style={{
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            placeholder={t('products.list.searchPlaceholder')}
          />
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)] ml-1">
          <Filter className="w-3.5 h-3.5" />
          <span className="uppercase tracking-wider">{t('common.filter')}</span>
        </div>
        <FilterPill
          options={[
            { value: '', label: t('products.list.filter.anyStatus') },
            { value: 'active', label: t('common.active') },
            { value: 'draft', label: t('products.list.filter.draft') },
            { value: 'suspended', label: t('products.list.filter.suspended') },
            { value: 'archived', label: t('products.list.filter.archived') },
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <FilterPill
          options={[
            { value: '', label: t('products.list.filter.anyType') },
            { value: 'micro_loan', label: t('reports.layout.product.microLoan') },
            { value: 'overdraft', label: t('reports.layout.product.overdraft') },
            { value: 'bnpl', label: t('reports.layout.product.bnpl') },
            { value: 'invoice_factoring', label: t('reports.layout.product.invoiceFactoring') },
          ]}
          value={typeFilter}
          onChange={setTypeFilter}
        />
        {filtersActive && (
          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setTypeFilter('');
            }}
            className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] underline-offset-2 hover:underline ml-1"
          >
            {t('common.clear')}
          </button>
        )}
        <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
          {t('products.filteredCount', { filtered: filtered.length, total: products.length })}
        </span>
      </section>

      {/* Table */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>{t('products.code')}</Th>
                <Th>{t('products.name')}</Th>
                <Th>{t('products.type')}</Th>
                <Th>{t('products.currency')}</Th>
                <Th>{t('products.interestRate')}</Th>
                <Th>{t('products.status')}</Th>
                <Th>v</Th>
                <Th>{t('products.created')}</Th>
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    {t('products.loadingProducts')}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <Package className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {filtersActive ? t('products.list.noMatch') : t('products.list.noProducts')}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => {
                  const typeColor = TYPE_COLOR[p.type] ?? 'var(--text-tertiary)';
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/products/${p.id}`)}
                      style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] cursor-pointer transition-colors"
                    >
                      <Td>
                        <span className="text-[12px] font-mono text-[color:var(--text-tertiary)]">
                          {p.code}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-primary)] font-medium">
                          {p.name}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px]"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: typeColor,
                              boxShadow: `0 0 6px ${typeColor}`,
                            }}
                          />
                          {typeLabel(p.type)}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-secondary)] font-mono text-[12px]">
                          {p.currency}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-primary)] font-semibold tabular-nums">
                          {p.interestRate || 0}%
                        </span>
                      </Td>
                      <Td>
                        <StatusBadge status={p.status} />
                      </Td>
                      <Td>
                        <span className="text-[color:var(--text-tertiary)] tabular-nums">
                          {p.version}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[12px] tabular-nums text-[color:var(--text-tertiary)]">
                          {formatDate(p.createdAt)}
                        </span>
                      </Td>
                      <Td>
                        <ArrowUpRight className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)] ${className ?? ''}`}
    >
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}
