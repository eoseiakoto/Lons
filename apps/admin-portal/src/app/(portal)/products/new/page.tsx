'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { ProductWizard } from '@/components/products/wizard/product-wizard';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';

export default function CreateProductPage() {
  const router = useRouter();
  const { t } = useI18n();

  return (
    <div className="relative space-y-6 animate-enter">
      <PageBackdrop />

      <div className="relative z-10 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('common.back')}
        </button>
        <div className="flex items-center gap-2 text-[11px] text-[color:var(--text-tertiary)]">
          <Sparkles className="w-3 h-3 text-[color:var(--accent-primary-deep)]" />
          New product provisioning
        </div>
      </div>

      <header className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="live-dot" aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
            Product wizard
          </span>
        </div>
        <h1
          className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
          style={{ fontSize: 44, lineHeight: 1.05 }}
        >
          {t('products.createProduct')}
        </h1>
        <p className="text-[15px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
          Configure pricing, eligibility, funding and approvals before this product is live.
        </p>
      </header>

      <div className="relative z-10">
        <ProductWizard mode="create" />
      </div>
    </div>
  );
}
