'use client';

import type { ProductFormState } from './product-wizard';

interface StepReviewProps {
  data: ProductFormState;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass p-4 space-y-3">
      <h4 className="text-sm font-semibold text-blue-400 uppercase tracking-wide">{title}</h4>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-white/40">{label}</dt>
      <dd className="text-sm text-white mt-0.5">{value || '-'}</dd>
    </div>
  );
}

function FeeDisplay({ label, fee }: { label: string; fee: { type: string; amount: string } }) {
  if (!fee.amount || fee.amount === '0') return <Field label={label} value="Not configured" />;
  return (
    <Field
      label={label}
      value={fee.type === 'FLAT' ? `Flat: ${fee.amount}` : `${fee.amount}%`}
    />
  );
}

const TYPE_LABELS: Record<string, string> = {
  OVERDRAFT: 'Overdraft',
  MICRO_LOAN: 'Micro Loan',
  BNPL: 'Buy Now Pay Later',
  INVOICE_FACTORING: 'Invoice Factoring',
};

const MODEL_LABELS: Record<string, string> = {
  FLAT: 'Flat Rate',
  REDUCING_BALANCE: 'Reducing Balance',
};

const METHOD_LABELS: Record<string, string> = {
  EQUAL_INSTALLMENT: 'Equal Installments',
  BULLET: 'Bullet (Lump Sum)',
  INTEREST_ONLY: 'Interest Only',
};

const WORKFLOW_LABELS: Record<string, string> = {
  AUTO: 'Automatic',
  MANUAL: 'Manual',
  HYBRID: 'Hybrid',
};

export function StepReview({ data }: StepReviewProps) {
  return (
    <div className="space-y-5">
      <h3 className="text-lg font-semibold text-white/80">Review & Confirm</h3>
      <p className="text-sm text-white/40">Review all product settings before saving.</p>

      <div className="space-y-4">
        <Section title="Basic Information">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Product Code" value={data.code} />
            <Field label="Name" value={data.name} />
            <Field label="Type" value={TYPE_LABELS[data.type] || data.type} />
            <Field label="Currency" value={data.currency} />
            <div className="col-span-2">
              <Field label="Description" value={data.description} />
            </div>
          </dl>
        </Section>

        <Section title="Financial Terms">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Min Amount" value={data.minAmount ? `${data.currency} ${data.minAmount}` : undefined} />
            <Field label="Max Amount" value={data.maxAmount ? `${data.currency} ${data.maxAmount}` : undefined} />
            <Field label="Interest Rate" value={data.interestRate ? `${data.interestRate}%` : undefined} />
            <Field label="Interest Model" value={MODEL_LABELS[data.interestRateModel] || data.interestRateModel} />
            <Field label="Repayment Method" value={METHOD_LABELS[data.repaymentMethod] || data.repaymentMethod} />
            <Field label="Grace Period" value={data.gracePeriodDays ? `${data.gracePeriodDays} days` : undefined} />
            <Field label="Min Tenor" value={data.minTenorDays ? `${data.minTenorDays} days` : undefined} />
            <Field label="Max Tenor" value={data.maxTenorDays ? `${data.maxTenorDays} days` : undefined} />
          </dl>
        </Section>

        <Section title="Fees & Charges">
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FeeDisplay label="Origination Fee" fee={data.originationFee} />
            <FeeDisplay label="Service Fee" fee={data.serviceFee} />
            <FeeDisplay label="Late Penalty" fee={data.latePenalty} />
            <FeeDisplay label="Insurance" fee={data.insurance} />
          </dl>
        </Section>

        <Section title="Eligibility">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Min Credit Score" value={data.minCreditScore || undefined} />
            <Field label="Min KYC Level" value={data.minKycLevel ? `Level ${data.minKycLevel}` : undefined} />
            <Field label="Max Active Loans" value={data.maxActiveLoans || undefined} />
          </dl>
          {data.customRules && (
            <div className="mt-3">
              <dt className="text-xs font-medium text-white/40 mb-1">Custom Rules</dt>
              <pre className="text-xs text-white/60 bg-white/5 rounded-lg p-3 overflow-auto max-h-32">
                {data.customRules}
              </pre>
            </div>
          )}
        </Section>

        <Section title="Approval Workflow">
          <dl className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Workflow Type" value={WORKFLOW_LABELS[data.approvalWorkflow] || data.approvalWorkflow} />
            {(data.approvalWorkflow === 'AUTO' || data.approvalWorkflow === 'HYBRID') && (
              <Field label="Auto-Approve Threshold" value={data.autoApproveThreshold || undefined} />
            )}
            <Field label="SLA Hours" value={data.slaHours ? `${data.slaHours}h` : undefined} />
          </dl>
        </Section>

        {data.notifications.length > 0 && (
          <Section title="Notifications">
            <div className="space-y-2">
              {data.notifications.map((n, idx) => (
                <div key={idx} className="flex items-start gap-3 bg-white/5 rounded-lg p-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                    {n.channel}
                  </span>
                  <div className="flex-1">
                    <span className="text-xs font-medium text-white/60">{n.event}</span>
                    <p className="text-xs text-white/40 mt-0.5 line-clamp-2">{n.template || '(no template set)'}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
