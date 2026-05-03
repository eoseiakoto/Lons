'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className={cn(
          'relative w-full card-elevated p-6 animate-[scaleIn_0.18s_cubic-bezier(0.2,0,0,1)]',
          sizeClasses[size],
        )}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] font-semibold tracking-tight text-[color:var(--text-primary)]">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-hover)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
