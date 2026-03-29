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
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Icon className="w-12 h-12 text-white/20 mb-4" />
      <h3 className="text-lg font-medium text-white/60">{title}</h3>
      {description && <p className="text-sm text-white/40 mt-1 max-w-sm">{description}</p>}
      {action && (
        <button onClick={action.onClick} className="glass-button-primary mt-4 text-sm">
          {action.label}
        </button>
      )}
    </div>
  );
}
