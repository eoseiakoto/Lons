'use client';

import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

const STEPS = [
  { number: 1, label: 'Basic Info' },
  { number: 2, label: 'Financial Terms' },
  { number: 3, label: 'Fees' },
  { number: 4, label: 'Eligibility' },
  { number: 5, label: 'Approval' },
  { number: 6, label: 'Notifications' },
  { number: 7, label: 'Review' },
];

interface WizardProgressProps {
  currentStep: number;
  completedSteps: Set<number>;
  onStepClick: (step: number) => void;
}

export function WizardProgress({ currentStep, completedSteps, onStepClick }: WizardProgressProps) {
  return (
    <div className="flex items-center justify-between mb-8">
      {STEPS.map((step, idx) => {
        const isActive = step.number === currentStep;
        const isCompleted = completedSteps.has(step.number);
        const isPast = step.number < currentStep;

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
                  isActive
                    ? 'bg-blue-500/30 border-blue-400 text-blue-400 shadow-lg shadow-blue-500/20'
                    : isCompleted || isPast
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-400'
                      : 'bg-white/5 border-white/10 text-white/30 group-hover:border-white/20 group-hover:text-white/50',
                )}
              >
                {isCompleted || (isPast && !isActive) ? (
                  <Check className="w-4 h-4" />
                ) : (
                  step.number
                )}
              </div>
              <span
                className={cn(
                  'text-xs whitespace-nowrap transition-colors',
                  isActive ? 'text-blue-400 font-medium' : isPast || isCompleted ? 'text-white/60' : 'text-white/30',
                )}
              >
                {step.label}
              </span>
            </button>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  'flex-1 h-px mx-3 mt-[-18px]',
                  isPast || isCompleted ? 'bg-emerald-400/30' : 'bg-white/10',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
