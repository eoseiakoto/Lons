'use client';

import { formatMoney, formatPercent } from '@/lib/utils';

interface TabCreditSummaryProps {
  customer: any;
}

export function TabCreditSummary({ customer }: TabCreditSummaryProps) {
  const creditScore = customer.creditScore ?? null;
  const creditLimit = customer.creditLimit ?? null;
  const creditUtilization = customer.creditUtilization ?? null;
  const currency = customer.currency || 'GHS';

  const getScoreColor = (score: number) => {
    if (score >= 700) return 'text-emerald-400';
    if (score >= 500) return 'text-amber-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 700) return 'bg-emerald-500/20 border-emerald-500/30';
    if (score >= 500) return 'bg-amber-500/20 border-amber-500/30';
    return 'bg-red-500/20 border-red-500/30';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-6 text-center">
          <p className="text-xs font-medium text-white/40 uppercase mb-2">Credit Score</p>
          {creditScore !== null ? (
            <>
              <p className={`text-4xl font-bold ${getScoreColor(creditScore)}`}>{creditScore}</p>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium border ${getScoreBg(creditScore)}`}>
                {creditScore >= 700 ? 'Excellent' : creditScore >= 500 ? 'Fair' : 'Poor'}
              </span>
            </>
          ) : (
            <p className="text-2xl font-bold text-white/20">--</p>
          )}
        </div>

        <div className="glass p-6 text-center">
          <p className="text-xs font-medium text-white/40 uppercase mb-2">Credit Limit</p>
          {creditLimit !== null ? (
            <p className="text-2xl font-bold text-white">{formatMoney(String(creditLimit), currency)}</p>
          ) : (
            <p className="text-2xl font-bold text-white/20">--</p>
          )}
        </div>

        <div className="glass p-6 text-center">
          <p className="text-xs font-medium text-white/40 uppercase mb-2">Utilization</p>
          {creditUtilization !== null ? (
            <>
              <p className="text-2xl font-bold text-white">{formatPercent(creditUtilization)}</p>
              <div className="mt-3 w-full bg-white/10 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${creditUtilization > 0.8 ? 'bg-red-400' : creditUtilization > 0.5 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  style={{ width: `${Math.min(creditUtilization * 100, 100)}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-2xl font-bold text-white/20">--</p>
          )}
        </div>
      </div>

      <div className="glass p-6">
        <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Score History</h3>
        <div className="flex items-center justify-center py-12 text-white/30">
          <div className="text-center">
            <p className="text-sm">Score history chart</p>
            <p className="text-xs text-white/20 mt-1">Historical scoring data will appear here once available</p>
          </div>
        </div>
      </div>
    </div>
  );
}
