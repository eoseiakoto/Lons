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
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    performing: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    draft: 'bg-white/10 text-white/60 border-white/10',
    suspended: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    due: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    overdue: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    delinquent: 'bg-red-500/20 text-red-400 border-red-500/30',
    default_status: 'bg-red-500/20 text-red-400 border-red-500/30',
    rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
    blacklisted: 'bg-red-500/20 text-red-400 border-red-500/30',
    settled: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    discontinued: 'bg-white/10 text-white/40 border-white/10',
    cancelled: 'bg-white/10 text-white/40 border-white/10',
  };
  return colors[status] || 'bg-white/10 text-white/60 border-white/10';
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
