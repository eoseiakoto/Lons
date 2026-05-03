'use client';

import { useState } from 'react';
import { gql, useMutation } from '@apollo/client';
import { useI18n } from '@/lib/i18n/i18n-context';

const SUBMIT_SURVEY = gql`
  mutation SubmitSurvey($tenantId: String!, $userId: String!, $score: Int!, $comment: String) {
    submitSurveyResponse(tenantId: $tenantId, userId: $userId, score: $score, comment: $comment) {
      id
    }
  }
`;

interface NpsWidgetProps {
  tenantId: string;
  userId: string;
}

export function NpsWidget({ tenantId, userId }: NpsWidgetProps) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');

  const [submitSurvey, { loading: submitting }] = useMutation(SUBMIT_SURVEY);

  if (dismissed || submitted) return null;

  const handleSubmit = async () => {
    if (selectedScore === null) return;

    try {
      await submitSurvey({
        variables: { tenantId, userId, score: selectedScore, comment: comment || null },
      });
      setSubmitted(true);
    } catch {
      // Silently fail — survey is non-critical
    }
  };

  return (
    <div className="mt-8 max-w-sm ml-auto glass rounded-lg border border-[color:var(--border-subtle)] p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[color:var(--text-primary)]">{t('feedback.quickFeedback')}</h3>
        <button
          onClick={() => setDismissed(true)}
          className="text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)]"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>

      <p className="mb-3 text-xs text-[color:var(--text-secondary)]">
        {t('feedback.npsQuestion')}
      </p>

      <div className="mb-3 flex gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            onClick={() => setSelectedScore(i)}
            className={`flex h-7 w-7 items-center justify-center rounded text-xs font-medium transition-colors ${
              selectedScore === i
                ? i <= 6
                  ? 'bg-red-500 text-white'
                  : i <= 8
                    ? 'bg-yellow-500 text-white'
                    : 'bg-green-500 text-white'
                : 'bg-[color:var(--bg-muted)] text-[color:var(--text-primary)] hover:bg-[color:var(--bg-hover)]'
            }`}
          >
            {i}
          </button>
        ))}
      </div>

      <div className="mb-2 flex justify-between text-[10px] text-[color:var(--text-tertiary)]">
        <span>{t('feedback.notLikely')}</span>
        <span>{t('feedback.veryLikely')}</span>
      </div>

      {selectedScore !== null && (
        <>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Any additional feedback? (optional)"
            className="glass-input mb-2 w-full text-xs"
            rows={2}
          />
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="glass-button-primary w-full text-xs disabled:opacity-50"
          >
            {submitting ? t('feedback.submitting') : t('common.submit')}
          </button>
        </>
      )}
    </div>
  );
}
