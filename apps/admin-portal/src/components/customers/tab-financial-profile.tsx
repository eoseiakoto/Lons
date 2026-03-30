'use client';

import { BarChart3 } from 'lucide-react';

interface TabFinancialProfileProps {
  customer: any;
}

export function TabFinancialProfile({ customer: _customer }: TabFinancialProfileProps) {
  return (
    <div className="glass p-6">
      <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-6">Transaction Pattern Summary</h3>

      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <BarChart3 className="w-8 h-8 text-white/20" />
        </div>
        <h4 className="text-lg font-medium text-white/40">Coming Soon</h4>
        <p className="text-sm text-white/20 mt-2 max-w-md">
          Transaction pattern analysis will be available once the integration service is connected.
          This will include income patterns, spending behavior, and wallet activity summaries.
        </p>
        <div className="grid grid-cols-3 gap-4 mt-8 w-full max-w-lg">
          {['Avg Monthly Income', 'Avg Monthly Spend', 'Wallet Activity'].map((label) => (
            <div key={label} className="glass p-4 text-center">
              <p className="text-xs text-white/30 uppercase">{label}</p>
              <p className="text-lg font-bold text-white/15 mt-1">--</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
