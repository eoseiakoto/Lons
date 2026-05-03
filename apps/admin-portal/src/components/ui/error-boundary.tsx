'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n/i18n-context';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

interface FallbackProps {
  error: Error | null;
  onReset: () => void;
}

// Functional wrapper so we can use the useI18n hook inside an
// error-boundary class component. The class component renders this
// fallback when an error is caught.
function ErrorBoundaryFallback({ error, onReset }: FallbackProps) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center min-h-[400px] p-6">
      <div className="card-elevated p-8 max-w-md text-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ backgroundColor: 'var(--status-error-soft)' }}
        >
          <AlertTriangle
            className="w-5 h-5"
            style={{ color: 'var(--status-error)' }}
          />
        </div>
        <h2 className="text-[17px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-2">
          {t('common.error')}
        </h2>
        <p className="text-sm text-[color:var(--text-secondary)] mb-6 leading-relaxed">
          {error?.message || t('common.unexpectedError')}
        </p>
        <button onClick={onReset} className="btn-primary text-sm">
          {t('common.tryAgain')}
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorBoundaryFallback
          error={this.state.error}
          onReset={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}
