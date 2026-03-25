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
