'use client';

import type { FieldError } from './validation';

interface FieldErrorMessageProps {
  /** Pre-resolved error message string */
  message?: string;
}

/**
 * Inline field-level error message.
 * Expects the message to be already resolved via t() by the parent.
 */
export function FieldErrorMessage({ message }: FieldErrorMessageProps) {
  if (!message) return null;

  return (
    <p data-field-error className="text-xs text-[color:var(--status-error-text)] mt-1 flex items-center gap-1">
      <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 10.5a.75.75 0 110-1.5.75.75 0 010 1.5zM8.75 4.75a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z" />
      </svg>
      <span>{message}</span>
    </p>
  );
}

interface StepErrorBannerProps {
  /** Pre-resolved banner message */
  message?: string;
  show: boolean;
}

/**
 * Banner shown at the top of a step when validation fails.
 * Expects the message to be already resolved via t() by the parent.
 */
export function StepErrorBanner({ message, show }: StepErrorBannerProps) {
  if (!show || !message) return null;

  return (
    <div className="bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] rounded-lg p-3 mb-4">
      <p className="text-sm text-[color:var(--status-error-text)] font-medium">{message}</p>
    </div>
  );
}

/**
 * Resolve an error's messageKey using the t() function.
 * Call this in the parent component to get the display string.
 */
export function resolveError(
  error: FieldError | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | undefined {
  if (!error) return undefined;
  let mergedParams = error.params;
  if (error.paramKeys) {
    const translated: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(error.paramKeys)) {
      translated[k] = t(v);
    }
    mergedParams = { ...(error.params ?? {}), ...translated };
  }
  return t(error.messageKey, mergedParams);
}
