'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { gql, useQuery } from '@apollo/client';
import { ArrowLeft } from 'lucide-react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { formatMoney } from '@/lib/utils';
import { add, bankersRound, multiply } from '@/lib/decimal';

const MERCHANT_DETAIL = gql`
  query MerchantDetail($id: ID!) {
    merchant(id: $id) {
      id name code status settlementType discountRate
      contactEmail contactPhone walletId walletProvider
      onboardedAt createdAt updatedAt
    }
  }
`;

const MERCHANT_TRANSACTIONS = gql`
  query MerchantTransactions($merchantId: ID!, $first: Int, $after: String) {
    merchantTransactions(merchantId: $merchantId, first: $first, after: $after) {
      edges {
        node {
          id status currency
          purchaseAmount totalRepayable
          numberOfInstallments
          purchaseRef
          createdAt completedAt
        }
        cursor
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`;

const MERCHANT_SETTLEMENTS = gql`
  query MerchantSettlements($merchantId: ID!, $first: Int) {
    merchantSettlements(merchantId: $merchantId, first: $first) {
      id
      currency
      grossAmount discountFee netAmount
      transactionCount
      periodStart periodEnd
      status
      settledAt walletRef failureReason
      createdAt
    }
  }
`;

interface MerchantNode {
  id: string;
  name: string;
  code: string;
  status: 'pending' | 'active' | 'suspended' | 'deactivated';
  settlementType: 'IMMEDIATE' | 'T_PLUS_1';
  discountRate: string;
  contactEmail?: string;
  contactPhone?: string;
  walletId?: string;
  walletProvider?: string;
  onboardedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface BnplTransactionNode {
  id: string;
  status: string;
  currency: string;
  purchaseAmount: string;
  totalRepayable: string;
  numberOfInstallments: number;
  purchaseRef: string;
  createdAt: string;
  completedAt?: string;
}

interface MerchantSettlementNode {
  id: string;
  currency: string;
  grossAmount: string;
  discountFee: string;
  netAmount: string;
  transactionCount: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  settledAt?: string;
  walletRef?: string;
  failureReason?: string;
  createdAt: string;
}

const PAGE_SIZE = 25;

export default function MerchantDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { t } = useI18n();
  const [accumulated, setAccumulated] = useState<BnplTransactionNode[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  const { data: merchantData, loading: merchantLoading } = useQuery(MERCHANT_DETAIL, {
    variables: { id },
  });

  // FIX 21: cursor-paginated transaction list. Each "Load more" click
  // advances the cursor; results accumulate into a single visible list.
  const { data: txData, loading: txLoading, fetchMore } = useQuery(
    MERCHANT_TRANSACTIONS,
    {
      variables: { merchantId: id, first: PAGE_SIZE, after: null },
      onCompleted: (data) => {
        const edges = data?.merchantTransactions?.edges ?? [];
        setAccumulated(edges.map((e: { node: BnplTransactionNode }) => e.node));
        setCursor(data?.merchantTransactions?.pageInfo?.endCursor ?? null);
      },
    },
  );

  // FIX 20: settlement history.
  const { data: settlementData, loading: settlementLoading } = useQuery(
    MERCHANT_SETTLEMENTS,
    { variables: { merchantId: id, first: 50 } },
  );

  if (merchantLoading) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <div className="relative z-10 card-glow p-12 text-center text-[color:var(--text-tertiary)]">
          {t('common.loading')}
        </div>
      </div>
    );
  }

  const merchant = merchantData?.merchant as MerchantNode | undefined;
  if (!merchant) {
    return (
      <div className="relative space-y-8 animate-enter">
        <PageBackdrop />
        <PageHeader title={t('merchants.title')} subtitle={t('merchants.detail.notFound')} />
        <Link
          href="/merchants"
          className="inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('merchants.title')}
        </Link>
      </div>
    );
  }

  // FIX 21: prefer the accumulated list (built from successive
  // fetchMore calls). Fall back to the initial response on first render
  // before onCompleted fires.
  const initialEdges =
    txData?.merchantTransactions?.edges?.map((e: { node: BnplTransactionNode }) => e.node) ??
    [];
  const transactions: BnplTransactionNode[] =
    accumulated.length > 0 ? accumulated : initialEdges;
  const totalCount = txData?.merchantTransactions?.totalCount ?? 0;
  const hasNextPage = txData?.merchantTransactions?.pageInfo?.hasNextPage ?? false;

  const handleLoadMore = async () => {
    if (!cursor || !hasNextPage) return;
    const result = await fetchMore({
      variables: { merchantId: id, first: PAGE_SIZE, after: cursor },
    });
    const newEdges = result.data?.merchantTransactions?.edges ?? [];
    setAccumulated((prev) => [
      ...prev,
      ...newEdges.map((e: { node: BnplTransactionNode }) => e.node),
    ]);
    setCursor(result.data?.merchantTransactions?.pageInfo?.endCursor ?? null);
  };

  const settlements: MerchantSettlementNode[] =
    settlementData?.merchantSettlements ?? [];

  // Performance metrics — derived client-side from the visible page.
  // Decimal-string accumulation: never `Number(tx.purchaseAmount)`.
  const totalGross = transactions.reduce<string>(
    (acc, tx) => add(acc, String(tx.purchaseAmount)),
    '0',
  );
  const totalCurrency = transactions[0]?.currency ?? 'GHS';
  const completedCount = transactions.filter((tx) => tx.status === 'completed').length;
  const activeCount = transactions.filter(
    (tx) => tx.status === 'approved' || tx.status === 'active',
  ).length;
  const refundedOrCancelledCount = transactions.filter(
    (tx) => tx.status === 'refunded' || tx.status === 'cancelled',
  ).length;

  // FIX 25: every column header reads from i18n.
  const txColumns = [
    {
      header: t('common.ref'),
      accessor: (tx: BnplTransactionNode) => (
        <span className="font-mono text-xs">{tx.purchaseRef}</span>
      ),
    },
    {
      header: t('common.status'),
      accessor: (tx: BnplTransactionNode) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]">
          {tx.status}
        </span>
      ),
    },
    {
      header: t('common.amount'),
      accessor: (tx: BnplTransactionNode) => formatMoney(tx.purchaseAmount, tx.currency),
    },
    {
      header: t('merchants.detail.installments'),
      accessor: (tx: BnplTransactionNode) => `${tx.numberOfInstallments}×`,
    },
    {
      header: t('common.created'),
      accessor: (tx: BnplTransactionNode) =>
        new Date(tx.createdAt).toLocaleDateString(),
    },
  ];

  // Settlement table columns.
  const settlementColumns = [
    {
      header: t('merchants.detail.settlementPeriod'),
      accessor: (s: MerchantSettlementNode) =>
        `${new Date(s.periodStart).toLocaleDateString()} → ${new Date(s.periodEnd).toLocaleDateString()}`,
    },
    {
      header: t('merchants.detail.settlementGross'),
      accessor: (s: MerchantSettlementNode) => formatMoney(s.grossAmount, s.currency),
    },
    {
      header: t('merchants.detail.settlementFee'),
      accessor: (s: MerchantSettlementNode) => formatMoney(s.discountFee, s.currency),
    },
    {
      header: t('merchants.detail.settlementNet'),
      accessor: (s: MerchantSettlementNode) => formatMoney(s.netAmount, s.currency),
    },
    {
      header: t('merchants.detail.settlementCount'),
      accessor: (s: MerchantSettlementNode) => s.transactionCount,
    },
    {
      header: t('common.status'),
      accessor: (s: MerchantSettlementNode) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-[color:var(--bg-muted)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)]">
          {s.status}
        </span>
      ),
    },
    {
      header: t('merchants.detail.settlementWalletRef'),
      accessor: (s: MerchantSettlementNode) =>
        s.walletRef ? <span className="font-mono text-xs">{s.walletRef}</span> : '-',
    },
  ];

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />
      <Link
        href="/merchants"
        className="relative z-10 inline-flex items-center gap-2 text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('merchants.title')}
      </Link>

      <PageHeader
        eyebrow={merchant.code}
        title={merchant.name}
        subtitle={`${merchant.settlementType === 'IMMEDIATE' ? t('merchants.settlementImmediate') : t('merchants.settlementTPlusOne')} · ${bankersRound(multiply(String(merchant.discountRate), '100'), 2)}% ${t('merchants.discountRate')}`}
      />

      {/* Profile card */}
      <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-4">
        <ProfileCell label={t('merchants.status')} value={merchant.status} />
        <ProfileCell label={t('merchants.contactEmail')} value={merchant.contactEmail || '-'} />
        <ProfileCell label={t('merchants.contactPhone')} value={merchant.contactPhone || '-'} />
        <ProfileCell label={t('merchants.walletProvider')} value={merchant.walletProvider || '-'} />
        <ProfileCell label={t('merchants.walletId')} value={merchant.walletId || '-'} />
        <ProfileCell
          label={t('merchants.detail.metric.onboarded')}
          value={merchant.onboardedAt ? new Date(merchant.onboardedAt).toLocaleDateString() : '-'}
        />
      </div>

      {/* Performance metrics */}
      <section className="relative z-10 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
          {t('merchants.detail.metrics')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label={t('merchants.detail.metric.transactionsPage')} value={String(transactions.length)} sub={t('merchants.detail.metric.ofTotal', { count: totalCount })} />
          <Metric label={t('merchants.detail.metric.grossVolume')} value={formatMoney(totalGross, totalCurrency)} />
          <Metric label={t('common.active')} value={String(activeCount)} />
          <Metric label={t('merchants.detail.metric.completedRefunded')} value={`${completedCount} / ${refundedOrCancelledCount}`} />
        </div>
      </section>

      {/* Transaction list — FIX 21: cursor-paginated with Load more */}
      <section className="relative z-10 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
          {t('merchants.detail.transactions')}{' '}
          <span className="ml-2 text-[color:var(--text-tertiary)] normal-case tracking-normal">
            {transactions.length}/{totalCount}
          </span>
        </h2>
        <div className="card-glow overflow-hidden">
          {txLoading && transactions.length === 0 ? (
            <div className="p-8 text-center text-[color:var(--text-tertiary)] text-sm">{t('common.loading')}</div>
          ) : (
            <DataTable
              columns={txColumns}
              data={transactions}
              emptyMessage={t('merchants.detail.noTransactions')}
            />
          )}
        </div>
        {hasNextPage && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={txLoading}
              className="glass-button text-sm disabled:opacity-50"
            >
              {txLoading ? t('common.loading') : t('common.loadMore')}
            </button>
          </div>
        )}
      </section>

      {/* Settlement history — FIX 20 */}
      <section className="relative z-10 space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-[color:var(--text-tertiary)]">
          {t('merchants.detail.settlements')}
        </h2>
        <div className="card-glow overflow-hidden">
          {settlementLoading ? (
            <div className="p-8 text-center text-[color:var(--text-tertiary)] text-sm">{t('common.loading')}</div>
          ) : (
            <DataTable
              columns={settlementColumns}
              data={settlements}
              emptyMessage={t('merchants.detail.noSettlements')}
            />
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-glow p-4">
      <div className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)] mb-1">
        {label}
      </div>
      <div className="text-sm text-[color:var(--text-primary)] font-medium">{value}</div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card-glow p-4">
      <div className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)] mb-1">
        {label}
      </div>
      <div className="text-2xl font-semibold text-[color:var(--text-primary)]">{value}</div>
      {sub && (
        <div className="text-xs text-[color:var(--text-tertiary)] mt-1">{sub}</div>
      )}
    </div>
  );
}
