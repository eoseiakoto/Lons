'use client';

import { gql, useQuery, useMutation } from '@apollo/client';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Pencil, Play, Pause, Package } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatMoney, formatDate } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';

const PRODUCT_QUERY = gql`
  query Product($id: ID!) {
    product(id: $id) {
      id code name description type currency status version
      minAmount maxAmount minTenorDays maxTenorDays
      interestRate interestRateModel repaymentMethod
      gracePeriodDays approvalWorkflow maxActiveLoans
      activatedAt createdAt updatedAt
      lender { id name }
    }
  }
`;

const ACTIVATE_PRODUCT = gql`
  mutation ActivateProduct($id: ID!) { activateProduct(id: $id) { id status } }
`;

const SUSPEND_PRODUCT = gql`
  mutation SuspendProduct($id: ID!) { suspendProduct(id: $id) { id status } }
`;

export default function ProductDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { data, loading, refetch } = useQuery(PRODUCT_QUERY, { variables: { id } });
  const [activate] = useMutation(ACTIVATE_PRODUCT);
  const [suspend] = useMutation(SUSPEND_PRODUCT);

  if (loading)
    return <div className="text-sm text-[color:var(--text-tertiary)] py-12 text-center">{t('common.loading')}</div>;
  const product = data?.product;
  if (!product)
    return <div className="text-sm text-[color:var(--text-tertiary)] py-12 text-center">{t('products.notFound')}</div>;

  const handleActivate = async () => { await activate({ variables: { id } }); refetch(); };
  const handleSuspend = async () => { await suspend({ variables: { id } }); refetch(); };

  type Field = [string, React.ReactNode];
  const fields: Field[] = [
    [t('products.code'), <span className="font-mono text-[color:var(--text-tertiary)]">{product.code}</span>],
    [t('products.type'), product.type.replace(/_/g, ' ')],
    [t('products.currency'), product.currency],
    [t('products.minAmount'), product.minAmount ? formatMoney(product.minAmount, product.currency) : '—'],
    [t('products.maxAmount'), product.maxAmount ? formatMoney(product.maxAmount, product.currency) : '—'],
    [t('products.interestRate'), `${product.interestRate || 0}%`],
    [t('products.interestModel'), product.interestRateModel?.replace(/_/g, ' ') ?? '—'],
    [t('products.repaymentMethod'), product.repaymentMethod?.replace(/_/g, ' ') ?? '—'],
    [t('products.gracePeriod'), t('products.gracePeriodValue', { days: product.gracePeriodDays })],
    [t('products.approvalWorkflow'), product.approvalWorkflow ?? '—'],
    [t('products.maxActiveLoans'), String(product.maxActiveLoans ?? '—')],
    [t('products.version'), String(product.version)],
    [t('products.lender'), product.lender?.name || '—'],
    [t('products.created'), formatDate(product.createdAt)],
    [t('products.activated'), product.activatedAt ? formatDate(product.activatedAt) : '—'],
  ];

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <button
        onClick={() => router.back()}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </button>

      <section className="relative z-10 card-glow-hero card-glow-sweep p-7 lg:p-9">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="flex items-start gap-5">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-deep)',
                border: '1px solid var(--border-default)',
              }}
            >
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="live-dot" aria-hidden />
                <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
                  {t('products.detailEyebrow', { type: product.type.replace(/_/g, ' '), version: product.version })}
                </span>
              </div>
              <h1
                className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
                style={{ fontSize: 36, lineHeight: 1.05 }}
              >
                {product.name}
              </h1>
              {product.description && (
                <p className="text-[14px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
                  {product.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <StatusBadge status={product.status} />
            <div className="flex items-center gap-2">
              <button onClick={() => router.push(`/products/${id}/edit`)} className="btn-secondary text-[12px]">
                <Pencil className="w-3.5 h-3.5" />
                {t('common.edit')}
              </button>
              {product.status === 'draft' && (
                <button
                  onClick={handleActivate}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--status-success-soft)',
                    color: 'var(--status-success-text)',
                    border: '1px solid var(--status-success)',
                  }}
                >
                  <Play className="w-3.5 h-3.5" />
                  {t('products.activate')}
                </button>
              )}
              {product.status === 'active' && (
                <button
                  onClick={handleSuspend}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-1.5"
                  style={{
                    backgroundColor: 'var(--status-warning-soft)',
                    color: 'var(--status-warning-text)',
                    border: '1px solid var(--status-warning)',
                  }}
                >
                  <Pause className="w-3.5 h-3.5" />
                  {t('products.suspend')}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {t('products.productDetails')}
          </h2>
        </div>
        <div className="card-glow p-6">
          <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            {fields.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1">
                  {label}
                </dt>
                <dd className="text-[14px] text-[color:var(--text-primary)] capitalize tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
