'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export function Drawer({ open, onClose, title, children, width = 'w-[480px]' }: DrawerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!mounted) return null;

  const drawer = (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          {/* Scrim — fade in/out */}
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            onClick={onClose}
          />

          {/* Panel — spring slide from right */}
          <motion.div
            className={`relative ${width} max-w-full h-full flex flex-col shadow-floating`}
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderLeft: '1px solid var(--border-subtle)',
            }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <h2 className="text-[15px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                {title}
              </h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--bg-hover)] transition-colors active:scale-95"
                aria-label="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return createPortal(drawer, document.body);
}
