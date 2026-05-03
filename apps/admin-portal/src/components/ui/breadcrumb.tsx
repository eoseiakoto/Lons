import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-4">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <ChevronRight className="w-3.5 h-3.5 text-[color:var(--text-tertiary)]" />
            )}
            {isLast || !item.href ? (
              <span
                className={
                  isLast
                    ? 'font-medium text-[color:var(--text-primary)]'
                    : 'text-[color:var(--text-secondary)]'
                }
              >
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
