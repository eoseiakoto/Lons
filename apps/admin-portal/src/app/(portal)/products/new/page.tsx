'use client';

import { useState } from 'react';
import { gql, useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';

const CREATE_PRODUCT = gql`
  mutation CreateProduct($input: CreateProductInput!) {
    createProduct(input: $input) { id code name }
  }
`;

export default function CreateProductPage() {
  const router = useRouter();
  const [createProduct, { loading }] = useMutation(CREATE_PRODUCT);
  const [form, setForm] = useState({
    code: '', name: '', description: '', type: 'micro_loan', currency: 'GHS',
    minAmount: '', maxAmount: '', minTenorDays: '', maxTenorDays: '',
    interestRateModel: 'flat', interestRate: '', repaymentMethod: 'equal_installments',
    gracePeriodDays: '0', approvalWorkflow: 'auto', maxActiveLoans: '1',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createProduct({
      variables: {
        input: {
          ...form,
          minAmount: form.minAmount ? Number(form.minAmount) : undefined,
          maxAmount: form.maxAmount ? Number(form.maxAmount) : undefined,
          minTenorDays: form.minTenorDays ? Number(form.minTenorDays) : undefined,
          maxTenorDays: form.maxTenorDays ? Number(form.maxTenorDays) : undefined,
          interestRate: form.interestRate ? Number(form.interestRate) : undefined,
          gracePeriodDays: Number(form.gracePeriodDays),
          maxActiveLoans: Number(form.maxActiveLoans),
        },
      },
    });
    router.push('/products');
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const labelCls = 'block text-sm font-medium text-white/60 mb-1';

  return (
    <div>
      <button onClick={() => router.back()} className="text-sm text-blue-400 mb-4 hover:underline">&larr; Back</button>
      <h1 className="text-lg font-semibold text-white/80 mb-6">Create Product</h1>
      <form onSubmit={handleSubmit} className="glass p-6 max-w-2xl space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Product Code</label><input className="w-full glass-input" value={form.code} onChange={update('code')} required /></div>
          <div><label className={labelCls}>Name</label><input className="w-full glass-input" value={form.name} onChange={update('name')} required /></div>
        </div>
        <div><label className={labelCls}>Description</label><textarea className="w-full glass-input" value={form.description} onChange={update('description')} rows={2} /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className={labelCls}>Type</label><select className="w-full glass-input" value={form.type} onChange={update('type')}><option value="overdraft">Overdraft</option><option value="micro_loan">Micro Loan</option><option value="bnpl">BNPL</option><option value="invoice_financing">Invoice Financing</option></select></div>
          <div><label className={labelCls}>Currency</label><input className="w-full glass-input" value={form.currency} onChange={update('currency')} required /></div>
          <div><label className={labelCls}>Interest Rate (%)</label><input type="number" step="0.01" className="w-full glass-input" value={form.interestRate} onChange={update('interestRate')} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Min Amount</label><input type="number" className="w-full glass-input" value={form.minAmount} onChange={update('minAmount')} /></div>
          <div><label className={labelCls}>Max Amount</label><input type="number" className="w-full glass-input" value={form.maxAmount} onChange={update('maxAmount')} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Min Tenor (days)</label><input type="number" className="w-full glass-input" value={form.minTenorDays} onChange={update('minTenorDays')} /></div>
          <div><label className={labelCls}>Max Tenor (days)</label><input type="number" className="w-full glass-input" value={form.maxTenorDays} onChange={update('maxTenorDays')} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className={labelCls}>Interest Model</label><select className="w-full glass-input" value={form.interestRateModel} onChange={update('interestRateModel')}><option value="flat">Flat</option><option value="reducing_balance">Reducing Balance</option><option value="tiered">Tiered</option></select></div>
          <div><label className={labelCls}>Repayment Method</label><select className="w-full glass-input" value={form.repaymentMethod} onChange={update('repaymentMethod')}><option value="lump_sum">Lump Sum</option><option value="equal_installments">Equal Installments</option><option value="reducing">Reducing</option><option value="balloon">Balloon</option><option value="auto_deduction">Auto Deduction</option></select></div>
          <div><label className={labelCls}>Approval Workflow</label><select className="w-full glass-input" value={form.approvalWorkflow} onChange={update('approvalWorkflow')}><option value="auto">Auto</option><option value="semi_auto">Semi-Auto</option><option value="single_level">Single Level</option><option value="multi_level">Multi-Level</option></select></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelCls}>Grace Period (days)</label><input type="number" className="w-full glass-input" value={form.gracePeriodDays} onChange={update('gracePeriodDays')} /></div>
          <div><label className={labelCls}>Max Active Loans</label><input type="number" className="w-full glass-input" value={form.maxActiveLoans} onChange={update('maxActiveLoans')} /></div>
        </div>
        <button type="submit" disabled={loading} className="glass-button-primary disabled:opacity-50">
          {loading ? 'Creating...' : 'Create Product'}
        </button>
      </form>
    </div>
  );
}
