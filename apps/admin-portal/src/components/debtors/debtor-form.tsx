'use client';

import { useEffect, useState } from 'react';

import { useI18n } from '@/lib/i18n/i18n-context';
import { compare } from '@/lib/decimal';
import type { IDebtor } from '@/lib/graphql/factoring';

interface DebtorFormProps {
  debtor?: IDebtor | null;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}

const DECIMAL_4DP_REGEX = /^\d+(\.\d{1,4})?$/;
const ISO3_REGEX = /^[A-Z]{3}$/;

/**
 * Create / edit form for an Invoice Factoring debtor entity.
 *
 * Field set mirrors `CreateDebtorInput` / `UpdateDebtorInput` in
 * `apps/graphql-server/src/graphql/inputs/factoring.input.ts`.
 *
 * Decimal-string validation for `exposureLimit` (4dp max).
 */
export function DebtorForm({ debtor, onSave, onCancel, saving }: DebtorFormProps) {
  const { t } = useI18n();

  const [companyName, setCompanyName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [taxId, setTaxId] = useState('');
  const [country, setCountry] = useState('');
  const [industrySector, setIndustrySector] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [externalCreditRating, setExternalCreditRating] = useState('');
  const [exposureLimit, setExposureLimit] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (debtor) {
      setCompanyName(debtor.companyName ?? '');
      setTradingName(debtor.tradingName ?? '');
      setRegistrationNumber(debtor.registrationNumber ?? '');
      setTaxId(debtor.taxId ?? '');
      setCountry(debtor.country ?? '');
      setIndustrySector(debtor.industrySector ?? '');
      setContactName(debtor.contactName ?? '');
      setContactEmail(debtor.contactEmail ?? '');
      setContactPhone(debtor.contactPhone ?? '');
      setPaymentTerms(debtor.paymentTerms ?? '');
      setExternalCreditRating(debtor.externalCreditRating ?? '');
      setExposureLimit(debtor.exposureLimit ?? '');
    } else {
      setCompanyName('');
      setTradingName('');
      setRegistrationNumber('');
      setTaxId('');
      setCountry('');
      setIndustrySector('');
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setPaymentTerms('');
      setExternalCreditRating('');
      setExposureLimit('');
    }
    setError(null);
  }, [debtor]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!companyName.trim()) {
      setError(
        t('debtors.form.error.fieldRequired', {
          field: t('debtors.form.companyName'),
        }),
      );
      return;
    }
    const countryUpper = country.trim().toUpperCase();
    if (!ISO3_REGEX.test(countryUpper)) {
      setError(t('debtors.form.error.countryInvalid'));
      return;
    }

    let limit: string | undefined;
    if (exposureLimit.trim()) {
      const trimmed = exposureLimit.trim();
      if (!DECIMAL_4DP_REGEX.test(trimmed)) {
        setError(t('debtors.form.error.exposureLimitInvalid'));
        return;
      }
      if (compare(trimmed, '0') < 0) {
        setError(t('debtors.form.error.exposureLimitNegative'));
        return;
      }
      limit = trimmed;
    }

    const data: Record<string, unknown> = {
      companyName: companyName.trim(),
      country: countryUpper,
    };
    if (tradingName.trim()) data.tradingName = tradingName.trim();
    if (registrationNumber.trim())
      data.registrationNumber = registrationNumber.trim();
    if (taxId.trim()) data.taxId = taxId.trim();
    if (industrySector.trim()) data.industrySector = industrySector.trim();
    if (contactName.trim()) data.contactName = contactName.trim();
    if (contactEmail.trim()) data.contactEmail = contactEmail.trim();
    if (contactPhone.trim()) data.contactPhone = contactPhone.trim();
    if (paymentTerms.trim()) data.paymentTerms = paymentTerms.trim();
    if (externalCreditRating.trim())
      data.externalCreditRating = externalCreditRating.trim();
    if (limit !== undefined) data.exposureLimit = limit;

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
          {t('debtors.form.legend.company')}
        </legend>

        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
            {t('debtors.form.companyName')}
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="glass-input w-full"
            placeholder={t('debtors.form.placeholder.companyName')}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('debtors.form.tradingName')}
            </label>
            <input
              type="text"
              value={tradingName}
              onChange={(e) => setTradingName(e.target.value)}
              className="glass-input w-full"
              placeholder={t('debtors.form.placeholder.tradingName')}
            />
          </div>
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('debtors.form.registrationNumber')}
            </label>
            <input
              type="text"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              className="glass-input w-full"
              placeholder={t('debtors.form.placeholder.registrationNumber')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('debtors.form.taxId')}
            </label>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="glass-input w-full"
              placeholder={t('debtors.form.placeholder.taxId')}
            />
          </div>
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('debtors.form.country')}
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              className="glass-input w-full uppercase"
              placeholder={t('debtors.form.placeholder.country')}
              maxLength={3}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
            {t('debtors.form.industrySector')}
          </label>
          <input
            type="text"
            value={industrySector}
            onChange={(e) => setIndustrySector(e.target.value)}
            className="glass-input w-full"
            placeholder={t('debtors.form.placeholder.industrySector')}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)] mb-2">
          {t('debtors.form.legend.contact')}
        </legend>

        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
            {t('debtors.form.contactName')}
          </label>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="glass-input w-full"
            placeholder={t('debtors.form.placeholder.contactName')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('debtors.form.contactEmail')}
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="glass-input w-full"
              placeholder={t('debtors.form.placeholder.contactEmail')}
            />
          </div>
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('debtors.form.contactPhone')}
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="glass-input w-full"
              placeholder={t('debtors.form.placeholder.contactPhone')}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-xs uppercase tracking-wide text-[color:var(--text-tertiary)] mb-2">
          {t('debtors.form.legend.commercial')}
        </legend>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('debtors.form.paymentTerms')}
            </label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="glass-input w-full"
              placeholder={t('debtors.form.placeholder.paymentTerms')}
            />
          </div>
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
              {t('debtors.form.externalCreditRating')}
            </label>
            <input
              type="text"
              value={externalCreditRating}
              onChange={(e) => setExternalCreditRating(e.target.value)}
              className="glass-input w-full"
              placeholder={t('debtors.form.placeholder.externalCreditRating')}
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
            {t('debtors.form.exposureLimit')}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={exposureLimit}
            onChange={(e) => setExposureLimit(e.target.value)}
            className="glass-input w-full tabular-nums"
            placeholder={t('debtors.form.placeholder.exposureLimit')}
          />
          <p className="text-xs text-[color:var(--text-tertiary)] mt-1">
            {t('debtors.form.exposureLimitHint')}
          </p>
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
