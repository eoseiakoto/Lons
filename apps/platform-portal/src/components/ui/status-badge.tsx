import { statusColor } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={`${statusColor(status)} capitalize${className ? ' ' + className : ''}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
