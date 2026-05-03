'use client';

import { BarChart3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

interface TabFinancialProfileProps {
  customer: any;
}

export function TabFinancialProfile({ customer: _customer }: TabFinancialProfileProps) {
  const { t } = useI18n();
  const placeholderLabels = [
    t('customers.financialProfile.avgMonthlyIncome'),
    t('customers.financialProfile.avgMonthlySpend'),
    t('customers.financialProfile.walletActivity'),
  ];

  return (
    <div className="card p-6">
      <h3 className="section-label mb-6">{t('customers.financialProfile.transactionPatternSummary')}</h3>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-[color:var(--bg-muted)] flex items-center justify-center mb-4">
          <BarChart3 className="w-8 h-8 text-[color:var(--text-tertiary)]" />
        </div>
        <h4 className="text-lg font-medium text-[color:var(--text-tertiary)]">{t('customers.financialProfile.comingSoon')}</h4>
        <p className="text-sm text-[color:var(--text-tertiary)] mt-2 max-w-md">
          {t('customers.financialProfile.comingSoonDescription')}
        </p>
        <div className="grid grid-cols-3 gap-4 mt-8 w-full max-w-lg">
          {placeholderLabels.map((label) => (
            <div key={label} className="card p-4 text-center">
              <p className="text-xs text-[color:var(--text-tertiary)] uppercase">{label}</p>
              <p className="text-lg font-bold text-[color:var(--text-tertiary)] mt-1">--</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
