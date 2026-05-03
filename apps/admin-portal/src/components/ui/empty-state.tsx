import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
        style={{ backgroundColor: 'var(--bg-muted)' }}
      >
        <Icon className="w-6 h-6 text-[color:var(--text-tertiary)]" />
      </div>
      <h3 className="text-[15px] font-semibold tracking-tight text-[color:var(--text-primary)]">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-[color:var(--text-secondary)] mt-1.5 max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <button onClick={action.onClick} className="btn-primary mt-6 text-sm">
          {action.label}
        </button>
      )}
    </div>
  );
}
