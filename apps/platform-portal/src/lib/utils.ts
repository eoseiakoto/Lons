import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: string, currency: string): string {
  const num = parseFloat(amount);
  return `${currency} ${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function downloadCSV(filename: string, headers: string[], rows: string[][]): void {
  const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'pill pill-success',
    performing: 'pill pill-success',
    approved: 'pill pill-success',
    completed: 'pill pill-success',

    draft: 'pill pill-neutral',
    suspended: 'pill pill-warning',
    cooling_off: 'pill pill-warning',
    due: 'pill pill-warning',
    pending: 'pill pill-warning',

    overdue: 'pill pill-error',
    delinquent: 'pill pill-error',
    default_status: 'pill pill-error',
    rejected: 'pill pill-error',
    blacklisted: 'pill pill-error',

    settled: 'pill pill-info',
    accepted: 'pill pill-info',

    discontinued: 'pill pill-neutral',
    deactivated: 'pill pill-neutral',
    inactive: 'pill pill-neutral',
    cancelled: 'pill pill-neutral',
  };
  return map[status] || 'pill pill-neutral';
}
