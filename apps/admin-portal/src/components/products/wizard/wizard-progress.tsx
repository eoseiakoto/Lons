'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n/i18n-context';

interface WizardProgressProps {
  currentStep: number;
  completedSteps: Set<number>;
  onStepClick: (step: number) => void;
  errorStep?: number;
}

export function WizardProgress({ currentStep, completedSteps, onStepClick, errorStep }: WizardProgressProps) {
  const { t } = useI18n();

  const STEPS = [
    { number: 1, label: t('products.wizard.basicInfo') },
    { number: 2, label: t('products.wizard.financialTerms') },
    { number: 3, label: t('products.wizard.fees') },
    { number: 4, label: t('products.wizard.eligibility') },
    { number: 5, label: t('products.wizard.fundingSource') },
    { number: 6, label: t('products.wizard.approval') },
    { number: 7, label: t('products.wizard.notifications') },
    { number: 8, label: t('products.wizard.review') },
  ];

  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, idx) => {
        const isActive = step.number === currentStep;
        const isCompleted = completedSteps.has(step.number);
        const isPast = step.number < currentStep;
        const hasError = step.number === errorStep;

        return (
          <div key={step.number} className="flex items-center flex-1 last:flex-none">
            <button
              type="button"
              onClick={() => onStepClick(step.number)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div
                className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium border transition-all duration-200',
                  hasError
                    ? 'bg-[color:var(--status-error-soft)] border-[color:var(--status-error)] text-[color:var(--status-error-text)] shadow-lg'
                    : isActive
                      ? 'bg-[color:var(--accent-primary-soft)] border-[color:var(--accent-primary)] text-[color:var(--accent-primary-deep)] shadow-lg shadow-[color:var(--accent-primary-soft)]'
                      : isCompleted || isPast
                        ? 'bg-[color:var(--status-success-soft)] border-[color:var(--status-success)] text-[color:var(--status-success-text)]'
                        : 'bg-[color:var(--bg-muted)] border-[color:var(--border-subtle)] text-[color:var(--text-tertiary)] group-hover:border-[color:var(--border-default)] group-hover:text-[color:var(--text-secondary)]',
                )}
              >
                {hasError ? (
                  <span className="text-[color:var(--status-error-text)] font-bold">!</span>
                ) : isCompleted || (isPast && !isActive) ? (
                  <Check className="w-4 h-4" />
                ) : (
                  step.number
                )}
              </div>
              <span
                className={cn(
                  'text-xs whitespace-nowrap transition-colors',
                  hasError ? 'text-[color:var(--status-error-text)] font-medium' : isActive ? 'text-[color:var(--accent-primary-deep)] font-medium' : isPast || isCompleted ? 'text-[color:var(--text-secondary)]' : 'text-[color:var(--text-tertiary)]',
                )}
              >
                {step.label}
              </span>
            </button>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-px mx-3 mt-[-18px]',
                  isPast || isCompleted ? 'bg-[color:var(--status-success)]' : 'bg-[color:var(--border-subtle)]',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
