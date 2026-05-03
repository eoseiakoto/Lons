'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import {
  PRIMARY_COUNTRY_LIST,
  AFRICAN_COUNTRY_LIST,
  ALL_COUNTRIES,
} from '@/lib/constants/countries';
import {
  PRIMARY_CURRENCY_LIST,
  AFRICAN_CURRENCY_LIST,
  ALL_CURRENCIES,
} from '@/lib/constants/currencies';

interface LenderFormProps {
  lender?: {
    id: string;
    name: string;
    licenseNumber?: string;
    country?: string;
    fundingCapacity?: string;
    fundingCurrency?: string;
    minInterestRate?: string;
    maxInterestRate?: string;
    settlementAccount?: Record<string, unknown>;
    riskParameters?: Record<string, unknown>;
    status: string;
  } | null;
  onSave: (data: Record<string, any>) => void;
  onCancel: () => void;
  saving: boolean;
}


export function LenderForm({ lender, onSave, onCancel, saving }: LenderFormProps) {
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [country, setCountry] = useState('');
  const [fundingCapacity, setFundingCapacity] = useState('');
  const [fundingCurrency, setFundingCurrency] = useState('GHS');
  const [minInterestRate, setMinInterestRate] = useState('');
  const [maxInterestRate, setMaxInterestRate] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [swiftCode, setSwiftCode] = useState('');

  useEffect(() => {
    if (lender) {
      setName(lender.name);
      setLicenseNumber(lender.licenseNumber || '');
      setCountry(lender.country || '');
      setFundingCapacity(lender.fundingCapacity ? String(lender.fundingCapacity) : '');
      setFundingCurrency(lender.fundingCurrency || 'GHS');
      setMinInterestRate(lender.minInterestRate ? String(lender.minInterestRate) : '');
      setMaxInterestRate(lender.maxInterestRate ? String(lender.maxInterestRate) : '');
      const sa = lender.settlementAccount as Record<string, string> | undefined;
      if (sa) {
        setBankName(sa.bankName || '');
        setAccountNumber(sa.accountNumber || '');
        setBranchCode(sa.branchCode || '');
        setSwiftCode(sa.swiftCode || '');
      }
    } else {
      setName('');
      setLicenseNumber('');
      setCountry('');
      setFundingCapacity('');
      setFundingCurrency('GHS');
      setMinInterestRate('');
      setMaxInterestRate('');
      setBankName('');
      setAccountNumber('');
      setBranchCode('');
      setSwiftCode('');
    }
  }, [lender]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, any> = {
      name,
    };
    if (licenseNumber) data.licenseNumber = licenseNumber;
    if (country) data.country = country;
    if (fundingCapacity) data.fundingCapacity = fundingCapacity;
    if (fundingCurrency) data.fundingCurrency = fundingCurrency;
    if (minInterestRate) data.minInterestRate = minInterestRate;
    if (maxInterestRate) data.maxInterestRate = maxInterestRate;

    if (bankName || accountNumber || branchCode || swiftCode) {
      data.settlementAccount = {
        bankName: bankName || undefined,
        accountNumber: accountNumber || undefined,
        branchCode: branchCode || undefined,
        swiftCode: swiftCode || undefined,
      };
    }

    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Core Details */}
      <div>
        <label className="block text-sm text-[color:var(--text-secondary)] mb-1">
          {t('lenders.name')} <span className="text-[color:var(--status-error-text)]">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="glass-input w-full text-sm"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.licenseNumber')}</label>
          <input
            type="text"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            className="glass-input w-full text-sm"
          />
        </div>
        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.country')}</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="glass-input w-full text-sm"
          >
            <option value="">—</option>
            <optgroup label={t('lenders.form.optgroup.primaryMarkets')}>
              {PRIMARY_COUNTRY_LIST.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.code})
                </option>
              ))}
            </optgroup>
            <optgroup label={t('lenders.form.optgroup.otherAfrican')}>
              {AFRICAN_COUNTRY_LIST.filter((c) => !c.primary).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.code})
                </option>
              ))}
            </optgroup>
            <optgroup label={t('lenders.form.optgroup.global')}>
              {ALL_COUNTRIES.filter((c) =>
                !AFRICAN_COUNTRY_LIST.some((ac) => ac.code === c.code)
              ).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} ({c.code})
                </option>
              ))}
            </optgroup>
          </select>
        </div>
      </div>

      {/* Funding */}
      <div className="border-t border-[color:var(--border-subtle)] pt-4">
        <h4 className="text-sm font-medium text-[color:var(--text-primary)] mb-3">{t('lenders.funding')}</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.fundingCapacity')}</label>
            <input
              type="number"
              step="0.01"
              value={fundingCapacity}
              onChange={(e) => setFundingCapacity(e.target.value)}
              className="glass-input w-full text-sm"
              placeholder={t('lenders.form.placeholder.amount')}
            />
          </div>
          <div>
            <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.fundingCurrency')}</label>
            <select
              value={fundingCurrency}
              onChange={(e) => setFundingCurrency(e.target.value)}
              className="glass-input w-full text-sm"
            >
              <optgroup label={t('lenders.form.optgroup.primaryCurrencies')}>
                {PRIMARY_CURRENCY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name} ({c.symbol})
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('lenders.form.optgroup.otherAfricanCurrencies')}>
                {AFRICAN_CURRENCY_LIST.filter((c) => !c.primary).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name} ({c.symbol})
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('lenders.form.optgroup.globalCurrencies')}>
                {ALL_CURRENCIES.filter((c) =>
                  !AFRICAN_CURRENCY_LIST.some((ac) => ac.code === c.code)
                ).map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name} ({c.symbol})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Interest Rate Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.minInterestRate')}</label>
          <input
            type="number"
            step="0.01"
            value={minInterestRate}
            onChange={(e) => setMinInterestRate(e.target.value)}
            className="glass-input w-full text-sm"
            placeholder={t('lenders.form.placeholder.rate')}
          />
        </div>
        <div>
          <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.maxInterestRate')}</label>
          <input
            type="number"
            step="0.01"
            value={maxInterestRate}
            onChange={(e) => setMaxInterestRate(e.target.value)}
            className="glass-input w-full text-sm"
            placeholder={t('lenders.form.placeholder.rate')}
          />
        </div>
      </div>

      {/* Settlement Account */}
      <div className="border-t border-[color:var(--border-subtle)] pt-4">
        <h4 className="text-sm font-medium text-[color:var(--text-primary)] mb-3">{t('lenders.settlementAccount')}</h4>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.bankName')}</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                className="glass-input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.accountNumber')}</label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                className="glass-input w-full text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.branchCode')}</label>
              <input
                type="text"
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value)}
                className="glass-input w-full text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-[color:var(--text-secondary)] mb-1">{t('lenders.swiftCode')}</label>
              <input
                type="text"
                value={swiftCode}
                onChange={(e) => setSwiftCode(e.target.value)}
                className="glass-input w-full text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-[color:var(--border-subtle)]">
        <button type="button" onClick={onCancel} className="glass-button text-sm">
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="glass-button-primary text-sm disabled:opacity-50"
        >
          {saving ? t('common.saving') : lender ? t('common.save') : t('lenders.addLender')}
        </button>
      </div>
    </form>
  );
}
