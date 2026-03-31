'use client';

import { gql, useQuery } from '@apollo/client';

const PORTFOLIO_METRICS = gql`
  query PortfolioMetricsReport {
    portfolioMetrics {
      activeLoans activeOutstanding
      parAt1 { count amount pct }
      parAt7 { count amount pct }
      parAt30 { count amount pct }
      parAt60 { count amount pct }
      parAt90 { count amount pct }
      nplRatio
      provisioning { performing specialMention substandard doubtful loss total }
    }
  }
`;

export default function ReportsPage() {
  const { data, loading } = useQuery(PORTFOLIO_METRICS);
  const m = data?.portfolioMetrics;

  if (loading) return <div className="text-white/40">Loading...</div>;

  return (
    <div>
      <h1 className="text-lg font-semibold text-white/80 mb-6">Reports</h1>

      <div className="glass p-6 mb-6">
        <h2 className="text-lg font-semibold text-white/80 mb-4">Portfolio at Risk</h2>
        <div className="grid grid-cols-5 gap-4">
          {[
            ['PAR 1+', m?.parAt1], ['PAR 7+', m?.parAt7], ['PAR 30+', m?.parAt30],
            ['PAR 60+', m?.parAt60], ['PAR 90+', m?.parAt90],
          ].map(([label, par]: any) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-white">{((Number(par?.pct) || 0) * 100).toFixed(1)}%</p>
              <p className="text-xs text-white/40">{label}</p>
              <p className="text-xs text-white/30">{par?.count ?? 0} contracts</p>
            </div>
          ))}
        </div>
      </div>

      <div className="glass p-6 mb-6">
        <h2 className="text-lg font-semibold text-white/80 mb-4">Provisioning</h2>
        <div className="space-y-2 text-sm">
          {[
            ['Performing (1%)', m?.provisioning?.performing],
            ['Special Mention (5%)', m?.provisioning?.specialMention],
            ['Substandard (20%)', m?.provisioning?.substandard],
            ['Doubtful (50%)', m?.provisioning?.doubtful],
            ['Loss (100%)', m?.provisioning?.loss],
          ].map(([label, val]) => (
            <div key={label as string} className="flex justify-between">
              <span className="text-white/40">{label}</span>
              <span className="font-medium text-white">GHS {Number(val || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-white/10 pt-2 font-bold">
            <span className="text-white">Total Provision</span>
            <span className="text-white">GHS {Number(m?.provisioning?.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
