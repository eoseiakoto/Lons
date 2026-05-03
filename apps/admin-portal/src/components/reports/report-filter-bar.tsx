'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';

export interface DateRange {
  startDate: string;
  endDate: string;
}

type PresetKey =
  | 'last7'
  | 'last30'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisQuarter'
  | 'lastQuarter'
  | 'yearToDate'
  | 'custom';

interface PresetOption {
  key: PresetKey;
  label: string;
  getRange: () => { startDate: string; endDate: string };
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0];
}

function buildPresets(t?: (key: string) => string): PresetOption[] {
  const today = new Date();
  const todayStr = toDateStr(today);
  const label = (key: string, fallback: string) => (t ? t(key) : fallback);

  return [
    {
      key: 'last7',
      label: label('reports.filter.last7', 'Last 7 days'),
      getRange: () => {
        const start = new Date(today);
        start.setDate(start.getDate() - 6);
        return { startDate: toDateStr(start), endDate: todayStr };
      },
    },
    {
      key: 'last30',
      label: label('reports.filter.last30', 'Last 30 days'),
      getRange: () => {
        const start = new Date(today);
        start.setDate(start.getDate() - 29);
        return { startDate: toDateStr(start), endDate: todayStr };
      },
    },
    {
      key: 'thisMonth',
      label: label('reports.filter.thisMonth', 'This month'),
      getRange: () => {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { startDate: toDateStr(start), endDate: todayStr };
      },
    },
    {
      key: 'lastMonth',
      label: label('reports.filter.lastMonth', 'Last month'),
      getRange: () => {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { startDate: toDateStr(start), endDate: toDateStr(end) };
      },
    },
    {
      key: 'thisQuarter',
      label: label('reports.filter.thisQuarter', 'This quarter'),
      getRange: () => {
        const qMonth = Math.floor(today.getMonth() / 3) * 3;
        const start = new Date(today.getFullYear(), qMonth, 1);
        return { startDate: toDateStr(start), endDate: todayStr };
      },
    },
    {
      key: 'lastQuarter',
      label: label('reports.filter.lastQuarter', 'Last quarter'),
      getRange: () => {
        const qMonth = Math.floor(today.getMonth() / 3) * 3;
        const start = new Date(today.getFullYear(), qMonth - 3, 1);
        const end = new Date(today.getFullYear(), qMonth, 0);
        return { startDate: toDateStr(start), endDate: toDateStr(end) };
      },
    },
    {
      key: 'yearToDate',
      label: label('reports.filter.ytd', 'Year to date'),
      getRange: () => {
        const start = new Date(today.getFullYear(), 0, 1);
        return { startDate: toDateStr(start), endDate: todayStr };
      },
    },
    {
      key: 'custom',
      label: label('reports.filter.custom', 'Custom'),
      getRange: () => {
        const start = new Date(today);
        start.setDate(start.getDate() - 29);
        return { startDate: toDateStr(start), endDate: todayStr };
      },
    },
  ];
}

function detectPreset(startDate: string, endDate: string, presets: PresetOption[]): PresetKey {
  for (const preset of presets) {
    if (preset.key === 'custom') continue;
    const range = preset.getRange();
    if (range.startDate === startDate && range.endDate === endDate) {
      return preset.key;
    }
  }
  return 'custom';
}

interface ReportFilterBarProps {
  onFilter: (range: DateRange) => void;
}

export function useReportDateRange(): DateRange {
  const searchParams = useSearchParams();
  const presets = useMemo(() => buildPresets(), []);
  const defaultRange = useMemo(() => {
    const last30 = presets.find((p) => p.key === 'last30')!;
    return last30.getRange();
  }, [presets]);

  const from = searchParams.get('from');
  const to = searchParams.get('to');

  return useMemo(() => {
    if (from && to) {
      return { startDate: from, endDate: to };
    }
    return defaultRange;
  }, [from, to, defaultRange]);
}

export function ReportFilterBar({ onFilter }: ReportFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useI18n();

  const presets = useMemo(() => buildPresets(t), [t]);

  const defaultRange = useMemo(() => {
    const last30 = presets.find((p) => p.key === 'last30')!;
    return last30.getRange();
  }, [presets]);

  const initialRange = useMemo(() => {
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    if (from && to) {
      return { startDate: from, endDate: to };
    }
    return defaultRange;
  }, [searchParams, defaultRange]);

  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [activePreset, setActivePreset] = useState<PresetKey>(() =>
    detectPreset(initialRange.startDate, initialRange.endDate, presets),
  );

  // Pending URL update queued by event handlers; flushed in an effect after
  // commit so we never call `router.replace` synchronously during render or
  // mid-event (which triggered the "setState in render" warning under HMR).
  const [urlSync, setUrlSync] = useState<{ from: string; to: string } | null>(null);
  const lastSyncedRef = useRef<string>(`${initialRange.startDate}::${initialRange.endDate}`);

  useEffect(() => {
    if (!urlSync) return;
    const key = `${urlSync.from}::${urlSync.to}`;
    if (lastSyncedRef.current === key) return;
    lastSyncedRef.current = key;
    const params = new URLSearchParams(searchParams.toString());
    params.set('from', urlSync.from);
    params.set('to', urlSync.to);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [urlSync, router, pathname, searchParams]);

  const handlePresetClick = useCallback(
    (preset: PresetOption) => {
      if (preset.key === 'custom') {
        setActivePreset('custom');
        return;
      }
      const range = preset.getRange();
      setStartDate(range.startDate);
      setEndDate(range.endDate);
      setActivePreset(preset.key);
      setUrlSync({ from: range.startDate, to: range.endDate });
      onFilter(range);
    },
    [onFilter],
  );

  const handleApply = useCallback(() => {
    setActivePreset(detectPreset(startDate, endDate, presets));
    setUrlSync({ from: startDate, to: endDate });
    onFilter({ startDate, endDate });
  }, [startDate, endDate, presets, onFilter]);

  return (
    <div className="card-glow p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((preset) => {
          const isActive = activePreset === preset.key;
          return (
            <button
              key={preset.key}
              onClick={() => handlePresetClick(preset)}
              className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: isActive ? 'var(--accent-primary)' : 'transparent',
                color: isActive ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                boxShadow: isActive ? '0 4px 12px -4px rgba(var(--accent-primary-rgb), 0.45)' : undefined,
              }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[color:var(--border-subtle)]">
        <span className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">{t('reports.filter.range')}</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => {
            setStartDate(e.target.value);
            setActivePreset('custom');
          }}
          className="rounded-lg px-2 py-1 text-[12px] focus:outline-none transition-colors"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        <span className="text-[11px] text-[color:var(--text-tertiary)]">→</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => {
            setEndDate(e.target.value);
            setActivePreset('custom');
          }}
          className="rounded-lg px-2 py-1 text-[12px] focus:outline-none transition-colors"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        <button onClick={handleApply} className="btn-primary text-[12px]">
          {t('reports.filter.apply')}
        </button>
      </div>
    </div>
  );
}
