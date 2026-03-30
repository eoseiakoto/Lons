'use client';

import { cn } from '@/lib/utils';

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (key: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-white/10 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-all duration-200 border-b-2 -mb-px',
            activeTab === tab.key
              ? 'text-white border-blue-400'
              : 'text-white/40 border-transparent hover:text-white/60 hover:border-white/20',
          )}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={cn(
              'ml-2 text-xs px-1.5 py-0.5 rounded-full',
              activeTab === tab.key ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-white/40',
            )}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
