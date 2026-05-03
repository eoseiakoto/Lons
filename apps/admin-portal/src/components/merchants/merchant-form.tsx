'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { bankersRound, compare, divide, multiply } from '@/lib/decimal';

interface MerchantFormProps {
  merchant?: {
    id: string;
    name: string;
    code: string;
    contactEmail?: string;
    contactPhone?: string;
    settlementType?: 'IMMEDIATE' | 'T_PLUS_1';
    discountRate: string;
    walletId?: string;
    walletProvider?: string;
  } | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}

export function MerchantForm({ merchant, onSave, onCancel, saving }: MerchantFormProps) {
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [settlementType, setSettlementType] = useState<'IMMEDIATE' | 'T_PLUS_1'>('T_PLUS_1');
  const [discountRatePercent, setDiscountRatePercent] = useState('2.50');
  const [walletId, setWalletId] = useState('');
  const [walletProvider, setWalletProvider] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (merchant) {
      setName(merchant.name);
      setCode(merchant.code);
      setContactEmail(merchant.contactEmail || '');
      setContactPhone(merchant.contactPhone || '');
      setSettlementType(merchant.settlementType || 'T_PLUS_1');
      // Decimal fraction → percent for human display. Decimal-string
      // multiply: '0.0250' × '100' = '2.5000' → banker-round to 2dp = '2.50'.
      setDiscountRatePercent(bankersRound(multiply(String(merchant.discountRate), '100'), 2));
      setWalletId(merchant.walletId || '');
      setWalletProvider(merchant.walletProvider || '');
    } else {
      setName('');
      setCode('');
      setContactEmail('');
      setContactPhone('');
      setSettlementType('T_PLUS_1');
      setDiscountRatePercent('2.50');
      setWalletId('');
      setWalletProvider('');
    }
    setError(null);
  }, [merchant]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError(t('merchants.form.error.fieldRequired', { field: t('merchants.name') }));
      return;
    }
    if (!code.trim()) {
      setError(t('merchants.form.error.fieldRequired', { field: t('merchants.code') }));
      return;
    }

    const ratePctStr = discountRatePercent.trim();
    // Validate format before any math — input is user-entered and may be
    // non-numeric. We allow exactly one optional decimal point and digits.
    if (!ratePctStr || !/^\d+(\.\d+)?$/.test(ratePctStr)) {
      setError(t('merchants.form.error.discountRateInvalid'));
      return;
    }
    if (compare(ratePctStr, '0') < 0 || compare(ratePctStr, '100') >= 0) {
      setError(t('merchants.form.error.discountRateRange'));
      return;
    }
    // Convert percent → decimal fraction with 4dp precision (matches
    // Prisma `Decimal(7, 4)`). Decimal-string division.
    const discountRate = bankersRound(divide(ratePctStr, '100'), 4);

    const data: Record<string, unknown> = {
      name: name.trim(),
      // `code` is set on create only — the GraphQL update input doesn't accept it.
      ...(merchant ? {} : { code: code.trim() }),
      settlementType,
      discountRate,
    };
    if (contactEmail.trim()) data.contactEmail = contactEmail.trim();
    if (contactPhone.trim()) data.contactPhone = contactPhone.trim();
    if (walletId.trim()) data.walletId = walletId.trim();
    if (walletProvider.trim()) data.walletProvider = walletProvider.trim();

    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="px-4 py-3 rounded-lg bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-sm text-[color:var(--status-error-text)]">
          {error}
        </div>
      )}

      <fieldset className="space-y-4">
        <legend className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)] mb-2">
          {t('merchants.form.basicInfo')}
        </legend>

        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
            {t('merchants.name')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="glass-input w-full"
            placeholder={t('merchants.form.placeholders.name')}
            required
          />
        </div>

        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
            {t('merchants.code')}
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            className="glass-input w-full"
            placeholder={t('merchants.form.placeholders.code')}
            disabled={!!merchant}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('merchants.contactEmail')}
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="glass-input w-full"
              placeholder={t('merchants.form.placeholders.email')}
            />
          </div>
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('merchants.contactPhone')}
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="glass-input w-full"
              placeholder={t('merchants.form.placeholders.phone')}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)] mb-2">
          {t('merchants.form.settlement')}
        </legend>

        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
            {t('merchants.settlementType')}
          </label>
          <select
            value={settlementType}
            onChange={(e) => setSettlementType(e.target.value as 'IMMEDIATE' | 'T_PLUS_1')}
            className="glass-input w-full"
          >
            <option value="T_PLUS_1">{t('merchants.settlementTPlusOne')}</option>
            <option value="IMMEDIATE">{t('merchants.settlementImmediate')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
            {t('merchants.discountRatePercent')}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max="99.99"
            value={discountRatePercent}
            onChange={(e) => setDiscountRatePercent(e.target.value)}
            className="glass-input w-full"
            required
          />
          <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
            {t('merchants.form.discountRateHint')}
          </p>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)] mb-2">
          {t('merchants.form.wallet')}
        </legend>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('merchants.walletId')}
            </label>
            <input
              type="text"
              value={walletId}
              onChange={(e) => setWalletId(e.target.value)}
              className="glass-input w-full"
              placeholder={t('merchants.form.placeholders.walletId')}
            />
          </div>
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('merchants.walletProvider')}
            </label>
            <input
              type="text"
              value={walletProvider}
              onChange={(e) => setWalletProvider(e.target.value)}
              className="glass-input w-full"
              placeholder={t('merchants.form.placeholders.walletProvider')}
            />
          </div>
        </div>
      </fieldset>

      <div className="flex justify-end gap-3 pt-4 border-t border-[color:var(--border-subtle)]">
        <button type="button" onClick={onCancel} className="glass-button text-sm">
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </form>
  );
}
