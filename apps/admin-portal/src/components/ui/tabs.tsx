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
    <div
      className="flex gap-0.5 mb-6 overflow-x-auto"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors duration-200',
              active
                ? 'text-[color:var(--text-primary)]'
                : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]',
            )}
          >
            <span className="inline-flex items-center gap-2">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full',
                    active ? 'pill pill-accent' : 'pill pill-neutral',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {active && (
              <span
                aria-hidden
                className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full"
                style={{ backgroundColor: 'var(--accent-primary)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
