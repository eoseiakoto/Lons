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

export function statusColor(status: string): string {
  // Returns an Apple-inspired pill class name. Pairs with `pill-*` classes
  // defined in globals.css so colors adapt to light/dark theme automatically.
  const map: Record<string, string> = {
    // Success / healthy
    active: 'pill pill-success',
    performing: 'pill pill-success',
    approved: 'pill pill-success',
    completed: 'pill pill-success',
    settled_status: 'pill pill-success',

    // Warning / attention
    draft: 'pill pill-neutral',
    suspended: 'pill pill-warning',
    cooling_off: 'pill pill-warning',
    due: 'pill pill-warning',
    pending: 'pill pill-warning',

    // Error / critical
    overdue: 'pill pill-error',
    delinquent: 'pill pill-error',
    default_status: 'pill pill-error',
    rejected: 'pill pill-error',
    blacklisted: 'pill pill-error',

    // Info
    settled: 'pill pill-info',
    accepted: 'pill pill-info',

    // Neutral
    discontinued: 'pill pill-neutral',
    cancelled: 'pill pill-neutral',
    anonymized: 'pill pill-accent',
    escalate: 'pill pill-accent',
  };
  return map[status] || 'pill pill-neutral';
}

export function formatPercent(value: number | string, decimals = 1): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num.toFixed(decimals)}%`;
}

export function downloadCSV(data: Record<string, unknown>[], filename: string): void {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(','),
    ...data.map((row) =>
      headers.map((h) => {
        const val = String(row[h] ?? '');
        return val.includes(',') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(','),
    ),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPDF(_title: string, _data: unknown, _columns?: string[]): void {
  // PDF generation placeholder - requires a PDF library in production
  console.warn('PDF download not yet implemented');
}

export function maskPII(value: string, type: 'phone' | 'email' | 'id' | 'nationalId' = 'id'): string {
  if (!value) return '';
  switch (type) {
    case 'phone':
      return value.length > 4 ? `${value.slice(0, 4)}***${value.slice(-2)}` : '***';
    case 'email': {
      const [local, domain] = value.split('@');
      if (!domain) return '***';
      return `${local.slice(0, 2)}***@${domain}`;
    }
    case 'nationalId':
    case 'id':
    default:
      return value.length > 6 ? `${value.slice(0, 3)}-***-${value.slice(-3)}` : '***';
  }
}
