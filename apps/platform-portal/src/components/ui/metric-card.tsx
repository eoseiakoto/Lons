import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export function MetricCard({ title, value, subtitle, trend }: MetricCardProps) {
  return (
    <div className="glass p-6 hover:bg-white/10 transition-all duration-200">
      <p className="text-sm font-medium text-white/60">{title}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-bold text-white">{value}</p>
        {trend && trend !== 'neutral' && (
          <span className={cn(
            'text-xs font-medium',
            trend === 'up' ? 'text-green-400' : 'text-red-400',
          )}>
            {trend === 'up' ? '\u2191' : '\u2193'}
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-white/40 mt-1">{subtitle}</p>}
    </div>
  );
}
